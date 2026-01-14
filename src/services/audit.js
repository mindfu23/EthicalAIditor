/**
 * Audit Jobs Service
 * 
 * Manages whole-book audit jobs with progress tracking.
 * Supports different audit types: full_audit, style_check, consistency, grammar.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

/**
 * Audit job types
 */
export const AuditTypes = {
  FULL_AUDIT: 'full_audit',
  STYLE_CHECK: 'style_check',
  CONSISTENCY: 'consistency',
  GRAMMAR: 'grammar',
};

/**
 * Audit job statuses
 */
export const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Get auth headers with tenant token
 */
function getAuthHeaders() {
  const token = localStorage.getItem('tenant_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

/**
 * Create a new audit job
 * 
 * @param {string} manuscriptId - ID of the manuscript to audit
 * @param {string} jobType - Type of audit (use AuditTypes)
 * @param {string} content - Optional: manuscript content for chunk counting
 * @returns {Promise<object>} Created job info
 */
export async function createAuditJob(manuscriptId, jobType = AuditTypes.FULL_AUDIT, content = null) {
  try {
    const response = await fetch(`${API_BASE}/api/audit/jobs`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        manuscript_id: manuscriptId,
        job_type: jobType,
        ...(content && { content }),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create job' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Audit] Create job error:', error);
    throw error;
  }
}

/**
 * Get audit job status
 * 
 * @param {string} jobId - ID of the job to check
 * @returns {Promise<object>} Job status and results
 */
export async function getJobStatus(jobId) {
  try {
    const response = await fetch(`${API_BASE}/api/audit/jobs/${jobId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get job' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Audit] Get job error:', error);
    throw error;
  }
}

/**
 * List all audit jobs for the current tenant
 * 
 * @returns {Promise<object>} List of jobs
 */
export async function listJobs() {
  try {
    const response = await fetch(`${API_BASE}/api/audit/jobs`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list jobs' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Audit] List jobs error:', error);
    throw error;
  }
}

/**
 * Cancel a running or pending audit job
 * 
 * @param {string} jobId - ID of the job to cancel
 * @returns {Promise<object>} Cancellation result
 */
export async function cancelJob(jobId) {
  try {
    const response = await fetch(`${API_BASE}/api/audit/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to cancel job' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Audit] Cancel job error:', error);
    throw error;
  }
}

/**
 * Process a batch of audit job chunks
 * 
 * @param {string} jobId - ID of the job to process
 * @param {string} content - Optional: manuscript content for processing
 * @param {number} batchSize - Number of chunks to process
 * @returns {Promise<object>} Processing result
 */
export async function processJobBatch(jobId, content = null, batchSize = 5) {
  try {
    const response = await fetch(`${API_BASE}/api/audit/jobs/${jobId}/process`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...(content && { content }),
        batch_size: batchSize,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to process job' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Audit] Process batch error:', error);
    throw error;
  }
}

/**
 * Subscribe to job progress via SSE streaming
 * 
 * @param {string} jobId - ID of the job to stream
 * @param {object} callbacks - Event callbacks
 * @returns {function} Cleanup function to close the stream
 */
export function streamJobProgress(jobId, callbacks = {}) {
  const { onProgress, onComplete, onError, onCancelled } = callbacks;

  // Get auth token for SSE connection
  const token = localStorage.getItem('tenant_token');
  const url = `${API_BASE}/api/audit/jobs/${jobId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  const eventSource = new EventSource(url);

  eventSource.addEventListener('progress', (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress?.(data);
    } catch (e) {
      console.error('[Audit] Parse progress error:', e);
    }
  });

  eventSource.addEventListener('complete', (event) => {
    try {
      const data = JSON.parse(event.data);
      onComplete?.(data);
      eventSource.close();
    } catch (e) {
      console.error('[Audit] Parse complete error:', e);
    }
  });

  eventSource.addEventListener('error', (event) => {
    try {
      const data = event.data ? JSON.parse(event.data) : { message: 'Connection error' };
      onError?.(data);
    } catch (e) {
      onError?.({ message: 'Stream error' });
    }
    eventSource.close();
  });

  eventSource.addEventListener('cancelled', (event) => {
    try {
      const data = JSON.parse(event.data);
      onCancelled?.(data);
    } catch (e) {}
    eventSource.close();
  });

  eventSource.addEventListener('timeout', (event) => {
    onError?.({ message: 'Stream timeout' });
    eventSource.close();
  });

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

/**
 * Poll job status until completion or timeout
 * 
 * @param {string} jobId - ID of the job to poll
 * @param {function} onProgress - Callback for progress updates
 * @param {object} options - Polling options
 * @returns {Promise<object>} Final job status
 */
export async function pollJobUntilComplete(jobId, onProgress = null, options = {}) {
  const { intervalMs = 2000, timeoutMs = 300000 } = options;
  const startTime = Date.now();

  while (true) {
    const job = await getJobStatus(jobId);
    
    if (onProgress) {
      onProgress(job);
    }

    if (job.status === JobStatus.COMPLETED || 
        job.status === JobStatus.FAILED || 
        job.status === JobStatus.CANCELLED) {
      return job;
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Job polling timeout');
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Start an audit with SSE streaming for progress
 * 
 * @param {string} manuscriptId - Manuscript to audit
 * @param {string} jobType - Type of audit
 * @param {string} content - Manuscript content
 * @param {object} callbacks - Event callbacks
 * @returns {object} Job tracker with cancel method
 */
export function startAuditWithStreaming(manuscriptId, jobType = AuditTypes.FULL_AUDIT, content = null, callbacks = {}) {
  let cleanup = null;
  let currentJob = null;
  let isProcessing = false;

  // Start the job and begin streaming
  const jobPromise = createAuditJob(manuscriptId, jobType, content)
    .then(async (job) => {
      currentJob = job;
      callbacks.onProgress?.({ ...job, progress: 0 });

      // Start SSE stream for progress
      cleanup = streamJobProgress(job.job_id, {
        onProgress: callbacks.onProgress,
        onComplete: callbacks.onComplete,
        onError: callbacks.onError,
        onCancelled: callbacks.onCancelled,
      });

      // Start processing in background
      isProcessing = true;
      while (isProcessing) {
        try {
          const result = await processJobBatch(job.job_id, content, 3);
          if (result.is_complete) {
            isProcessing = false;
            break;
          }
        } catch (e) {
          console.error('[Audit] Processing error:', e);
          isProcessing = false;
          break;
        }
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final status check
      return getJobStatus(job.job_id);
    });

  return {
    getPromise: () => jobPromise,
    
    cancel: async () => {
      isProcessing = false;
      if (cleanup) cleanup();
      if (currentJob?.job_id) {
        return cancelJob(currentJob.job_id);
      }
    },

    getJob: () => currentJob,
  };
}

/**
 * Start an audit and return an observable-like object for tracking progress
 * (Legacy API - uses polling instead of SSE)
 * 
 * @param {string} manuscriptId - Manuscript to audit
 * @param {string} jobType - Type of audit
 * @param {string} content - Manuscript content
 * @returns {object} Job tracker with subscribe method
 */
export function startAuditWithProgress(manuscriptId, jobType = AuditTypes.FULL_AUDIT, content = null) {
  let subscribers = [];
  let currentJob = null;
  let cancelled = false;

  const notify = (job) => {
    subscribers.forEach(cb => cb(job));
  };

  // Start the job
  const jobPromise = createAuditJob(manuscriptId, jobType, content)
    .then(async (job) => {
      currentJob = job;
      notify(job);

      // Poll for completion
      return pollJobUntilComplete(job.job_id, (updatedJob) => {
        if (!cancelled) {
          currentJob = updatedJob;
          notify(updatedJob);
        }
      });
    });

  return {
    subscribe(callback) {
      subscribers.push(callback);
      if (currentJob) {
        callback(currentJob);
      }
      return () => {
        subscribers = subscribers.filter(cb => cb !== callback);
      };
    },

    async cancel() {
      cancelled = true;
      if (currentJob?.job_id) {
        return cancelJob(currentJob.job_id);
      }
    },

    getPromise() {
      return jobPromise;
    },
  };
}

export default {
  AuditTypes,
  JobStatus,
  createAuditJob,
  getJobStatus,
  listJobs,
  cancelJob,
  processJobBatch,
  streamJobProgress,
  pollJobUntilComplete,
  startAuditWithStreaming,
  startAuditWithProgress,
};
