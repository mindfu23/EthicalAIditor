/**
 * Service Warmup Module
 *
 * Simplified for HuggingFace Inference API (Pro plan).
 * HF's shared inference keeps popular models warm, so heavy warmup logic
 * is no longer needed. This module now just does a lightweight health check
 * and notifies the UI of readiness.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

// Service status states
export const ServiceStatus = {
  UNKNOWN: 'unknown',
  CHECKING: 'checking',
  WARMING_UP: 'warming_up',
  READY: 'ready',
  ERROR: 'error'
};

// Warmup progress tracking
export const WarmupProgress = {
  NOT_STARTED: 0,
  HEALTH_CHECK: 10,
  TRIGGERING_LOAD: 30,
  MODEL_LOADING: 50,
  ALMOST_READY: 80,
  COMPLETE: 100
};

// Store state for the HF provider
const providerState = {
  huggingface: {
    status: ServiceStatus.UNKNOWN,
    progress: WarmupProgress.NOT_STARTED,
    lastCheck: 0,
    warmupStartTime: null,
  }
};

// Listeners for status changes
let statusListeners = [];
let progressListeners = [];

// Debounce timers
let activityWarmupTimer = null;
const WARMUP_DEBOUNCE_MS = 1000;
const WARMUP_COOLDOWN_MS = 120000; // 2 minutes (HF stays warm longer)

/**
 * Subscribe to status changes
 */
export function subscribeToStatus(callback) {
  statusListeners.push(callback);
  callback(providerState.huggingface.status);

  return () => {
    statusListeners = statusListeners.filter(cb => cb !== callback);
  };
}

/**
 * Subscribe to progress changes (for progress bar)
 */
export function subscribeToProgress(callback) {
  progressListeners.push(callback);
  callback(getProgressState());

  return () => {
    progressListeners = progressListeners.filter(cb => cb !== callback);
  };
}

/**
 * Get current progress state
 */
export function getProgressState() {
  return {
    huggingface: { ...providerState.huggingface },
    // Legacy compat — components may check these
    cloudrun: { ...providerState.huggingface },
    isWarming: providerState.huggingface.status === ServiceStatus.WARMING_UP ||
               providerState.huggingface.status === ServiceStatus.CHECKING,
    activeProvider: providerState.huggingface.status === ServiceStatus.WARMING_UP ? 'huggingface' : null,
  };
}

/**
 * Update provider state and notify listeners
 */
function updateState(updates) {
  Object.assign(providerState.huggingface, updates);
  statusListeners.forEach(cb => cb(providerState.huggingface.status));
  progressListeners.forEach(cb => cb(getProgressState()));
}

/**
 * Get current status
 */
export function getStatus() {
  return providerState.huggingface.status;
}

/**
 * Check HuggingFace Inference API availability via worker health endpoint
 */
export async function warmupCloudRun() {
  return warmupHuggingFace();
}

export async function warmupHuggingFace() {
  const state = providerState.huggingface;

  // Skip if recently checked and ready
  if (state.status === ServiceStatus.READY &&
      Date.now() - state.lastCheck < WARMUP_COOLDOWN_MS) {
    return true;
  }

  // Skip if already checking
  if (state.status === ServiceStatus.WARMING_UP || state.status === ServiceStatus.CHECKING) {
    return false;
  }

  if (!API_BASE) {
    updateState({ status: ServiceStatus.READY, progress: WarmupProgress.COMPLETE });
    return true;
  }

  updateState({
    status: ServiceStatus.CHECKING,
    progress: WarmupProgress.HEALTH_CHECK,
    warmupStartTime: Date.now(),
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.huggingface?.ok) {
        updateState({
          status: ServiceStatus.READY,
          progress: WarmupProgress.COMPLETE,
          lastCheck: Date.now(),
        });
        return true;
      }
    }

    // Worker is reachable but HF might not be — still mark as ready
    // (the actual HF call will handle model loading errors)
    updateState({
      status: ServiceStatus.READY,
      progress: WarmupProgress.COMPLETE,
      lastCheck: Date.now(),
    });
    return true;
  } catch (error) {
    console.error('[Warmup] Health check error:', error);
    updateState({
      status: ServiceStatus.ERROR,
      progress: WarmupProgress.NOT_STARTED,
    });
    return false;
  }
}

/**
 * Warm up the appropriate service
 */
export async function warmupService(modelId = null) {
  return warmupHuggingFace();
}

/**
 * Predictive warming triggered by user activity (debounced)
 */
export function triggerPredictiveWarmup(modelId = null) {
  if (activityWarmupTimer) {
    clearTimeout(activityWarmupTimer);
  }

  activityWarmupTimer = setTimeout(() => {
    warmupHuggingFace();
  }, WARMUP_DEBOUNCE_MS);
}

export function onFileUpload(modelId = null) {
  triggerPredictiveWarmup(modelId);
}

export function onEditorActivity(modelId = null) {
  triggerPredictiveWarmup(modelId);
}

export function onChatFocus(modelId = null) {
  triggerPredictiveWarmup(modelId);
}

export function onModelChange(modelId) {
  // No special warmup needed — all models go through same HF API
  warmupHuggingFace();
}

/**
 * Initialize warmup on module load
 */
export function initWarmup() {
  setTimeout(() => {
    warmupHuggingFace();
  }, 500);
}

/**
 * Get warmup status message for UI
 */
export function getWarmupMessage(provider = 'huggingface') {
  const state = providerState.huggingface;

  switch (state.status) {
    case ServiceStatus.CHECKING:
      return 'Checking HuggingFace API...';
    case ServiceStatus.WARMING_UP:
      return 'Model is loading on HuggingFace (~20s)...';
    case ServiceStatus.READY:
      return 'HuggingFace API is ready';
    case ServiceStatus.ERROR:
      return 'HuggingFace API is unavailable';
    default:
      return '';
  }
}
