/**
 * Service Warmup Module
 * 
 * Checks the Compute Engine VM status on page load.
 * VM is always-on so no warmup needed, but we verify it's responding.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
// VM URL - disabled due to mixed content (HTTPS site can't call HTTP)
// To enable: set up nginx + Let's Encrypt on VM, then uncomment
// const VM_URL = 'http://34.30.2.20:8080';
const VM_URL = null; // Disabled until HTTPS is configured
// Primary: Cloud Run (has HTTPS)
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';

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
 * Ping the health endpoint to check/warm up the service
 */
export async function warmupService() {
  setStatus(ServiceStatus.CHECKING);
  console.log('[Warmup] Checking Cloud Run service status...');

  try {
    // VM is disabled (mixed content), go straight to Cloud Run
    // When VM HTTPS is set up, uncomment the VM check below
    /*
    if (VM_URL) {
      const healthResponse = await fetch(`${VM_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('[Warmup] VM health:', healthData);

        if (healthData.model_loaded) {
          console.log('[Warmup] VM model loaded, service is ready');
          setStatus(ServiceStatus.READY);
          return true;
        }
      }
    }
    */
    
    // Check Cloud Run health
    const healthResponse = await fetch(`${CLOUD_RUN_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!healthResponse.ok) {
      console.error('[Warmup] Cloud Run health check failed');
      setStatus(ServiceStatus.ERROR);
      return false;
    }

    const healthData = await healthResponse.json();
    console.log('[Warmup] Cloud Run health:', healthData);

    // If model is already loaded, we're ready!
    if (healthData.model_loaded) {
      console.log('[Warmup] Model already loaded, service is ready');
      setStatus(ServiceStatus.READY);
      return true;
    }

    // Model not loaded yet, need to warm up
    console.log('[Warmup] Model not loaded, warming up LLM service...');
    setStatus(ServiceStatus.WARMING_UP);

    // Send a minimal request to Cloud Run to trigger model loading
    const warmupStart = Date.now();
    
    const llmResponse = await fetch(`${CLOUD_RUN_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
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
