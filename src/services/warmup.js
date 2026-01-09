/**
 * Service Warmup Module
 * 
 * Pings the Cloud Run service on page load to trigger warm-up
 * before the user tries to send a chat message.
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

// Store the current status
let currentStatus = ServiceStatus.UNKNOWN;
let statusListeners = [];

/**
 * Subscribe to status changes
 */
export function subscribeToStatus(callback) {
  statusListeners.push(callback);
  // Immediately notify of current status
  callback(currentStatus);
  
  // Return unsubscribe function
  return () => {
    statusListeners = statusListeners.filter(cb => cb !== callback);
  };
}

/**
 * Update status and notify listeners
 */
function setStatus(newStatus) {
  currentStatus = newStatus;
  statusListeners.forEach(cb => cb(newStatus));
}

/**
 * Get current status
 */
export function getStatus() {
  return currentStatus;
}

/**
 * Ping the health endpoint to warm up the service
 * Returns true if service is ready, false otherwise
 */
export async function warmupService() {
  if (!API_BASE) {
    console.log('[Warmup] No API_BASE configured, skipping warmup');
    setStatus(ServiceStatus.ERROR);
    return false;
  }

  setStatus(ServiceStatus.CHECKING);
  console.log('[Warmup] Checking service status...');

  try {
    // First, ping the worker health endpoint (should be instant)
    const workerResponse = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!workerResponse.ok) {
      console.error('[Warmup] Worker health check failed');
      setStatus(ServiceStatus.ERROR);
      return false;
    }

    console.log('[Warmup] Worker is healthy, warming up LLM service...');
    setStatus(ServiceStatus.WARMING_UP);

    // Now send a minimal request to warm up the Cloud Run LLM service
    // This will trigger model loading if the service is cold
    const warmupStart = Date.now();
    
    const llmResponse = await fetch(`${API_BASE}/api/huggingface`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
        // No manuscript context needed for warmup
      })
    });

    const warmupTime = Date.now() - warmupStart;
    console.log(`[Warmup] LLM response received in ${warmupTime}ms`);

    if (llmResponse.ok) {
      setStatus(ServiceStatus.READY);
      return true;
    } else {
      const error = await llmResponse.json().catch(() => ({}));
      console.error('[Warmup] LLM warmup failed:', error);
      
      // If it's a timeout/503 error, service is still warming up
      if (llmResponse.status === 503 || llmResponse.status === 504) {
        // Keep trying in background
        setTimeout(() => warmupService(), 10000);
        return false;
      }
      
      setStatus(ServiceStatus.ERROR);
      return false;
    }
  } catch (error) {
    console.error('[Warmup] Error during warmup:', error);
    
    // Network errors might mean the service is still starting
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      setStatus(ServiceStatus.WARMING_UP);
      // Retry after a delay
      setTimeout(() => warmupService(), 15000);
    } else {
      setStatus(ServiceStatus.ERROR);
    }
    return false;
  }
}

/**
 * Initialize warmup on module load
 * Call this once when the app starts
 */
export function initWarmup() {
  // Small delay to let the UI render first
  setTimeout(() => {
    warmupService();
  }, 500);
}
