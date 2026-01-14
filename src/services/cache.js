/**
 * Cache Service
 * 
 * Provides client-side wrapper for the caching API.
 * Supports embedding, completion, and retrieval caching.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

/**
 * Cache types
 */
export const CacheTypes = {
  EMBEDDING: 'embedding',
  COMPLETION: 'completion',
  RETRIEVAL: 'retrieval',
};

/**
 * Get or set a cache entry
 * 
 * @param {string} cacheType - Type of cache (use CacheTypes)
 * @param {any} input - Input to cache (used for key generation)
 * @param {any} output - Optional: value to cache (if not provided, performs GET)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Cache result
 */
export async function cacheEntry(cacheType, input, output = undefined, options = {}) {
  const { tenantId = null, ttlSeconds = null } = options;

  try {
    const response = await fetch(`${API_BASE}/api/cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cache_type: cacheType,
        input,
        ...(output !== undefined && { output }),
        ...(tenantId && { tenant_id: tenantId }),
        ...(ttlSeconds && { ttl_seconds: ttlSeconds }),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Cache operation failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Cache] Error:', error);
    throw error;
  }
}

/**
 * Get a cached value
 */
export async function getCached(cacheType, input) {
  return cacheEntry(cacheType, input);
}

/**
 * Set a cached value
 */
export async function setCached(cacheType, input, output, ttlSeconds = null) {
  return cacheEntry(cacheType, input, output, { ttlSeconds });
}

/**
 * Wrap a function with caching
 * 
 * @param {string} cacheType - Type of cache
 * @param {function} fn - Function to wrap
 * @param {object} options - Caching options
 * @returns {function} Wrapped function with caching
 */
export function withCache(cacheType, fn, options = {}) {
  const { ttlSeconds = 3600, keyFn = JSON.stringify } = options;

  return async function(...args) {
    const cacheKey = keyFn(args);

    // Check cache first
    try {
      const cached = await getCached(cacheType, cacheKey);
      if (cached.hit) {
        console.log(`[Cache] Hit for ${cacheType}`);
        return cached.output;
      }
    } catch (e) {
      // Cache miss or error - continue to execute function
    }

    // Execute function
    const result = await fn(...args);

    // Store in cache
    try {
      await setCached(cacheType, cacheKey, result, ttlSeconds);
    } catch (e) {
      // Cache store failed - don't break the flow
      console.warn('[Cache] Failed to store:', e);
    }

    return result;
  };
}

/**
 * Create a completion cache wrapper
 * Useful for caching LLM responses
 */
export function createCompletionCache(ttlSeconds = 3600) {
  return {
    async get(prompt, model) {
      const result = await getCached(CacheTypes.COMPLETION, { prompt, model });
      return result.hit ? result.output : null;
    },

    async set(prompt, model, completion) {
      return setCached(CacheTypes.COMPLETION, { prompt, model }, completion, ttlSeconds);
    },
  };
}

/**
 * Create an embedding cache wrapper
 */
export function createEmbeddingCache(ttlSeconds = 86400) { // 24 hours
  return {
    async get(text) {
      const result = await getCached(CacheTypes.EMBEDDING, text);
      return result.hit ? result.output : null;
    },

    async set(text, embedding) {
      return setCached(CacheTypes.EMBEDDING, text, embedding, ttlSeconds);
    },
  };
}

/**
 * Create a retrieval cache wrapper
 */
export function createRetrievalCache(ttlSeconds = 1800) { // 30 minutes
  return {
    async get(query, manuscriptId) {
      const result = await getCached(CacheTypes.RETRIEVAL, { query, manuscriptId });
      return result.hit ? result.output : null;
    },

    async set(query, manuscriptId, results) {
      return setCached(CacheTypes.RETRIEVAL, { query, manuscriptId }, results, ttlSeconds);
    },
  };
}

export default {
  CacheTypes,
  cacheEntry,
  getCached,
  setCached,
  withCache,
  createCompletionCache,
  createEmbeddingCache,
  createRetrievalCache,
};
