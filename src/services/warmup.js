/**
 * Service Warmup Module
 *
 * Provides predictive warming for Cloud Run and Friendli.ai endpoints.
 * Triggers warmup on user activity (file upload, typing) to minimize
 * wait time when they send their first AI request.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';

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

// Store state for each provider
const providerState = {
  cloudrun: {
    status: ServiceStatus.UNKNOWN,
    progress: WarmupProgress.NOT_STARTED,
    lastCheck: 0,
    warmupStartTime: null,
  },
  friendli: {
    status: ServiceStatus.UNKNOWN,
    progress: WarmupProgress.NOT_STARTED,
    lastCheck: 0,
    warmupStartTime: null,
  }
};

// Listeners for status changes
let statusListeners = [];
let progressListeners = [];

// Debounce timers for predictive warming
let activityWarmupTimer = null;
const WARMUP_DEBOUNCE_MS = 1000;
const WARMUP_COOLDOWN_MS = 60000; // Don't re-warm within 1 minute

/**
 * Subscribe to status changes
 */
export function subscribeToStatus(callback) {
  statusListeners.push(callback);
  // Immediately notify of current status (use cloudrun as primary)
  callback(providerState.cloudrun.status);

  return () => {
    statusListeners = statusListeners.filter(cb => cb !== callback);
  };
}

/**
 * Subscribe to progress changes (for progress bar)
 * Callback receives: { provider, progress, status, estimatedTimeRemaining }
 */
export function subscribeToProgress(callback) {
  progressListeners.push(callback);
  // Immediately notify current state
  callback(getProgressState());

  return () => {
    progressListeners = progressListeners.filter(cb => cb !== callback);
  };
}

/**
 * Get current progress state for all providers
 */
export function getProgressState() {
  return {
    cloudrun: { ...providerState.cloudrun },
    friendli: { ...providerState.friendli },
    // Overall status (worst of the two if either is warming)
    isWarming: providerState.cloudrun.status === ServiceStatus.WARMING_UP ||
               providerState.friendli.status === ServiceStatus.WARMING_UP,
    activeProvider: providerState.cloudrun.status === ServiceStatus.WARMING_UP ? 'cloudrun' :
                   providerState.friendli.status === ServiceStatus.WARMING_UP ? 'friendli' : null,
  };
}

/**
 * Update provider state and notify listeners
 */
function updateProviderState(provider, updates) {
  Object.assign(providerState[provider], updates);

  // Notify status listeners (primary provider)
  if (provider === 'cloudrun') {
    statusListeners.forEach(cb => cb(providerState.cloudrun.status));
  }

  // Notify progress listeners
  progressListeners.forEach(cb => cb(getProgressState()));
}

/**
 * Get current status (legacy compatibility)
 */
export function getStatus() {
  return providerState.cloudrun.status;
}

/**
 * Estimate remaining warmup time based on progress
 */
function estimateTimeRemaining(provider) {
  const state = providerState[provider];
  if (!state.warmupStartTime) return 45000;

  const elapsed = Date.now() - state.warmupStartTime;
  const progress = state.progress;

  // Estimate total time based on progress
  if (progress <= WarmupProgress.HEALTH_CHECK) return 45000;
  if (progress <= WarmupProgress.TRIGGERING_LOAD) return 40000;
  if (progress <= WarmupProgress.MODEL_LOADING) return 30000;
  if (progress <= WarmupProgress.ALMOST_READY) return 10000;

  return Math.max(0, 45000 - elapsed);
}

/**
 * Warm up Cloud Run service
 */
export async function warmupCloudRun() {
  const state = providerState.cloudrun;

  // Skip if recently checked and ready
  if (state.status === ServiceStatus.READY &&
      Date.now() - state.lastCheck < WARMUP_COOLDOWN_MS) {
    console.log('[Warmup] Cloud Run already warm, skipping');
    return true;
  }

  // Skip if already warming
  if (state.status === ServiceStatus.WARMING_UP) {
    console.log('[Warmup] Cloud Run warmup already in progress');
    return false;
  }

  updateProviderState('cloudrun', {
    status: ServiceStatus.CHECKING,
    progress: WarmupProgress.HEALTH_CHECK,
    warmupStartTime: Date.now(),
  });

  console.log('[Warmup] Checking Cloud Run status...');

  try {
    // Step 1: Health check
    const healthResponse = await fetch(`${CLOUD_RUN_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!healthResponse.ok) {
      console.error('[Warmup] Health check failed');
      updateProviderState('cloudrun', {
        status: ServiceStatus.ERROR,
        progress: WarmupProgress.NOT_STARTED,
      });
      return false;
    }

    const healthData = await healthResponse.json();
    console.log('[Warmup] Health:', healthData);

    // If model is already loaded, we're ready!
    if (healthData.model_loaded) {
      console.log('[Warmup] Model already loaded, service is ready');
      updateProviderState('cloudrun', {
        status: ServiceStatus.READY,
        progress: WarmupProgress.COMPLETE,
        lastCheck: Date.now(),
      });
      return true;
    }

    // Step 2: Model not loaded, need to warm up
    console.log('[Warmup] Model not loaded, triggering load...');
    updateProviderState('cloudrun', {
      status: ServiceStatus.WARMING_UP,
      progress: WarmupProgress.TRIGGERING_LOAD,
    });

    // Send a minimal request to trigger model loading
    const warmupStart = Date.now();

    // Progress simulation while waiting
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - warmupStart;
      let progress = WarmupProgress.TRIGGERING_LOAD;

      if (elapsed > 5000) progress = WarmupProgress.MODEL_LOADING;
      if (elapsed > 20000) progress = WarmupProgress.ALMOST_READY;

      if (providerState.cloudrun.status === ServiceStatus.WARMING_UP) {
        updateProviderState('cloudrun', { progress });
      }
    }, 2000);

    try {
      const llmResponse = await fetch(`${CLOUD_RUN_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Hi',
          max_length: 5,
          temperature: 0.7
        })
      });

      clearInterval(progressInterval);

      const warmupTime = Date.now() - warmupStart;
      console.log(`[Warmup] LLM response received in ${warmupTime}ms`);

      if (llmResponse.ok) {
        updateProviderState('cloudrun', {
          status: ServiceStatus.READY,
          progress: WarmupProgress.COMPLETE,
          lastCheck: Date.now(),
        });
        return true;
      } else {
        const responseText = await llmResponse.text();
        console.error('[Warmup] LLM warmup failed:', responseText);

        // If it's a timeout/503 error, service is still warming up
        if (llmResponse.status === 503 || llmResponse.status === 504) {
          // Keep trying in background
          setTimeout(() => warmupCloudRun(), 10000);
          return false;
        }

        updateProviderState('cloudrun', {
          status: ServiceStatus.ERROR,
          progress: WarmupProgress.NOT_STARTED,
        });
        return false;
      }
    } catch (fetchError) {
      clearInterval(progressInterval);
      throw fetchError;
    }
  } catch (error) {
    console.error('[Warmup] Error during warmup:', error);

    // Network errors might mean the service is still starting
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      updateProviderState('cloudrun', {
        status: ServiceStatus.WARMING_UP,
        progress: WarmupProgress.MODEL_LOADING,
      });
      // Retry after a delay
      setTimeout(() => warmupCloudRun(), 15000);
    } else {
      updateProviderState('cloudrun', {
        status: ServiceStatus.ERROR,
        progress: WarmupProgress.NOT_STARTED,
      });
    }
    return false;
  }
}

/**
 * Warm up Friendli endpoint
 */
export async function warmupFriendli() {
  const state = providerState.friendli;

  // Skip if recently checked and ready
  if (state.status === ServiceStatus.READY &&
      Date.now() - state.lastCheck < WARMUP_COOLDOWN_MS) {
    console.log('[Warmup] Friendli already warm, skipping');
    return true;
  }

  // Skip if already warming
  if (state.status === ServiceStatus.WARMING_UP) {
    console.log('[Warmup] Friendli warmup already in progress');
    return false;
  }

  // Check if Friendli is configured
  const token = import.meta.env.VITE_FRIENDLI_API_KEY || localStorage.getItem('friendli_api_key');
  if (!token) {
    console.log('[Warmup] Friendli not configured, skipping');
    updateProviderState('friendli', {
      status: ServiceStatus.UNKNOWN,
      progress: WarmupProgress.NOT_STARTED,
    });
    return false;
  }

  updateProviderState('friendli', {
    status: ServiceStatus.CHECKING,
    progress: WarmupProgress.HEALTH_CHECK,
    warmupStartTime: Date.now(),
  });

  console.log('[Warmup] Checking Friendli status...');

  try {
    const FRIENDLI_ENDPOINT_ID = import.meta.env.VITE_FRIENDLI_ENDPOINT_ID || 'depwcl4sjq52lzu';

    updateProviderState('friendli', {
      status: ServiceStatus.WARMING_UP,
      progress: WarmupProgress.TRIGGERING_LOAD,
    });

    const response = await fetch('https://api.friendli.ai/dedicated/v1/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: FRIENDLI_ENDPOINT_ID,
        prompt: 'Hi',
        max_tokens: 1,
      }),
    });

    if (response.ok) {
      console.log('[Warmup] Friendli endpoint is ready');
      updateProviderState('friendli', {
        status: ServiceStatus.READY,
        progress: WarmupProgress.COMPLETE,
        lastCheck: Date.now(),
      });
      return true;
    }

    if (response.status === 503) {
      console.log('[Warmup] Friendli endpoint is waking up...');
      updateProviderState('friendli', {
        status: ServiceStatus.WARMING_UP,
        progress: WarmupProgress.MODEL_LOADING,
      });
      // Retry after delay
      setTimeout(() => warmupFriendli(), 10000);
      return false;
    }

    console.error('[Warmup] Friendli warmup failed:', response.status);
    updateProviderState('friendli', {
      status: ServiceStatus.ERROR,
      progress: WarmupProgress.NOT_STARTED,
    });
    return false;
  } catch (error) {
    console.error('[Warmup] Friendli error:', error);
    updateProviderState('friendli', {
      status: ServiceStatus.ERROR,
      progress: WarmupProgress.NOT_STARTED,
    });
    return false;
  }
}

/**
 * Warm up the appropriate service based on selected model
 */
export async function warmupService(modelId = null) {
  // Determine which provider to warm based on model
  const isFriendliModel = modelId && (
    modelId.includes('bloomz') || modelId.includes('bigscience')
  );

  if (isFriendliModel) {
    return warmupFriendli();
  } else {
    return warmupCloudRun();
  }
}

/**
 * Predictive warming triggered by user activity
 * Debounced to avoid excessive calls
 */
export function triggerPredictiveWarmup(modelId = null) {
  // Clear existing timer
  if (activityWarmupTimer) {
    clearTimeout(activityWarmupTimer);
  }

  // Debounce the warmup call
  activityWarmupTimer = setTimeout(() => {
    console.log('[Warmup] Predictive warmup triggered by user activity');
    warmupService(modelId);
  }, WARMUP_DEBOUNCE_MS);
}

/**
 * Trigger warmup on file upload
 */
export function onFileUpload(modelId = null) {
  console.log('[Warmup] File upload detected, triggering warmup');
  triggerPredictiveWarmup(modelId);
}

/**
 * Trigger warmup on editor activity (typing)
 */
export function onEditorActivity(modelId = null) {
  triggerPredictiveWarmup(modelId);
}

/**
 * Trigger warmup on chat input focus
 */
export function onChatFocus(modelId = null) {
  console.log('[Warmup] Chat focused, triggering warmup');
  triggerPredictiveWarmup(modelId);
}

/**
 * Trigger warmup when model selection changes
 */
export function onModelChange(modelId) {
  console.log('[Warmup] Model changed to:', modelId);
  // Immediate warmup for model changes (no debounce)
  warmupService(modelId);
}

/**
 * Initialize warmup on module load
 * Call this once when the app starts
 */
export function initWarmup() {
  // Small delay to let the UI render first
  setTimeout(() => {
    warmupCloudRun();
  }, 500);
}

/**
 * Get warmup status message for UI
 */
export function getWarmupMessage(provider = 'cloudrun') {
  const state = providerState[provider];
  const providerName = provider === 'cloudrun' ? 'Cloud Run' : 'Friendli.ai';

  switch (state.status) {
    case ServiceStatus.CHECKING:
      return `Checking ${providerName} status...`;
    case ServiceStatus.WARMING_UP:
      const timeRemaining = Math.ceil(estimateTimeRemaining(provider) / 1000);
      return `${providerName} is warming up (~${timeRemaining}s remaining)...`;
    case ServiceStatus.READY:
      return `${providerName} is ready`;
    case ServiceStatus.ERROR:
      return `${providerName} is unavailable`;
    default:
      return '';
  }
}
