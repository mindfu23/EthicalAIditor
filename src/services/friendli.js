/**
 * Friendli.ai Service for EthicalAIditor
 *
 * Handles API calls to Friendli.ai for BLOOM/BLOOMZ models.
 * Supports two modes:
 * 1. Server-side: Uses worker proxy with server-configured API key (default, no user config needed)
 * 2. Client-side: Uses user-provided API key directly (fallback/override)
 * 
 * This allows anonymous users to access BLOOMZ models when the server has Friendli configured.
 * 
 * API Docs: https://friendli.ai/docs/guides/dedicated_endpoints/quickstart
 */

// Worker URL for server-side Friendli proxy
const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

// Base URL for direct Friendli calls (client-side fallback)
const FRIENDLI_BASE_URL = 'https://api.friendli.ai/dedicated/v1';
// The endpoint ID from Friendli dashboard (found in Playground curl command)
const FRIENDLI_ENDPOINT_ID = import.meta.env.VITE_FRIENDLI_ENDPOINT_ID || 'depwcl4sjq52lzu';

/**
 * Available BLOOM models on the Friendli endpoint
 * Since both models are served from a single endpoint, they use the same endpoint ID
 */
export const FRIENDLI_MODELS = {
  'bigscience/bloomz-560m': {
    id: 'bigscience/bloomz-560m',
    name: 'BLOOMZ 560M',
    description: 'Fast, lightweight ethical model (BigScience)',
  },
  'bigscience/bloomz-1b7': {
    id: 'bigscience/bloomz-1b7',
    name: 'BLOOMZ 1.7B',
    description: 'More capable ethical model (BigScience)',
  },
};

// Cache for server-side configuration status
let serverConfigCache = null;
let serverConfigCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get Friendli API token from environment or localStorage (for client-side mode)
 */
function getClientFriendliToken() {
  // Try environment variable first (for production builds with client-side key)
  const envToken = import.meta.env.VITE_FRIENDLI_API_KEY;
  if (envToken) return envToken;

  // Fall back to localStorage (for user-provided keys)
  return localStorage.getItem('friendli_api_key');
}

/**
 * Check if server-side Friendli is configured
 * Caches result for 5 minutes to avoid repeated requests
 * @returns {Promise<{configured: boolean, models: Array}>}
 */
export async function checkServerFriendli() {
  // Return cached result if still valid
  if (serverConfigCache && Date.now() - serverConfigCacheTime < CACHE_TTL) {
    return serverConfigCache;
  }

  try {
    const response = await fetch(`${API_BASE}/api/friendli/status`);
    if (response.ok) {
      const data = await response.json();
      serverConfigCache = data;
      serverConfigCacheTime = Date.now();
      return data;
    }
  } catch (error) {
    console.warn('[Friendli] Could not check server status:', error.message);
  }

  // Default to not configured if server check fails
  return { configured: false, models: [] };
}

/**
 * Check if Friendli.ai is configured (either server-side or client-side)
 * This is a sync function for backward compatibility, returns true if client token exists
 * For async server check, use checkServerFriendli() or isFriendliAvailable()
 */
export function isFriendliConfigured() {
  // Check client-side first (sync)
  if (getClientFriendliToken()) return true;
  
  // Check cached server status (sync)
  if (serverConfigCache?.configured) return true;
  
  // Return false but trigger async check for next time
  checkServerFriendli().catch(() => {});
  return serverConfigCache?.configured || false;
}

/**
 * Async check if Friendli is available (server or client)
 * Use this for accurate availability check
 */
export async function isFriendliAvailable() {
  // Client-side token takes precedence
  if (getClientFriendliToken()) return true;
  
  // Check server-side
  const serverStatus = await checkServerFriendli();
  return serverStatus.configured;
}

/**
 * Chat with a BLOOM model via Friendli.ai
 * Automatically uses server-side proxy if available, falls back to client-side
 *
 * @param {Array} messages - Array of {role, content} message objects
 * @param {string} modelId - The BLOOM model ID (e.g., 'bigscience/bloomz-560m')
 * @param {string} manuscriptContext - Optional manuscript text for context
 * @param {Object} options - Optional configuration
 * @param {string} options.sessionToken - Tenant session token for rate limiting
 * @returns {Promise<string>} - Generated text response
 */
export async function chatWithFriendli(messages, modelId, manuscriptContext = '', options = {}) {
  const clientToken = getClientFriendliToken();
  const serverStatus = await checkServerFriendli();
  
  // Prefer server-side if configured (doesn't require user API key)
  if (serverStatus.configured && !clientToken) {
    return chatWithFriendliServer(messages, modelId, manuscriptContext, options);
  }
  
  // Use client-side if user has provided their own key
  if (clientToken) {
    return chatWithFriendliClient(messages, modelId, manuscriptContext, clientToken);
  }
  
  throw new Error('Friendli.ai not configured. Server-side not available and no API key provided.');
}

/**
 * Chat via server-side Friendli proxy (uses server's API key)
 */
async function chatWithFriendliServer(messages, modelId, manuscriptContext, options = {}) {
  console.log(`[Friendli] Using server-side proxy for ${modelId}`);
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Include session token if available
  if (options.sessionToken) {
    headers['Authorization'] = `Bearer ${options.sessionToken}`;
  }
  
  const response = await fetch(`${API_BASE}/api/friendli/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      model: modelId,
      manuscriptContext,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    if (response.status === 503 && error.status === 'waking') {
      throw new Error('Friendli endpoint is waking up. Please wait 30-60 seconds and try again.');
    }
    if (response.status === 429) {
      throw new Error(`Rate limit exceeded. ${error.hint || 'Try again later.'}`);
    }
    
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  const data = await response.json();
  return data.message || data.response || data.generated_text || '';
}

/**
 * Chat via client-side Friendli API (uses user's API key)
 */
async function chatWithFriendliClient(messages, modelId, manuscriptContext, token) {
  console.log(`[Friendli] Using client-side API for ${modelId}`);
  
  const modelConfig = FRIENDLI_MODELS[modelId];
  if (!modelConfig) {
    throw new Error(`Unknown Friendli model: ${modelId}`);
  }

  // Get the latest user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  
  // Build prompt optimized for BLOOMZ instruction-following
  let prompt = '';
  
  if (manuscriptContext) {
    const truncatedContext = manuscriptContext.substring(0, 1200);
    prompt = `Task: You are a helpful writing assistant. Read the following story excerpt and answer the question.\n\nStory excerpt:\n${truncatedContext}\n\nQuestion: ${lastUserMessage}\n\nAnswer:`;
  } else {
    prompt = `Task: Answer the following question helpfully and thoroughly.\n\nQuestion: ${lastUserMessage}\n\nAnswer:`;
  }

  console.log(`[Friendli] Calling ${modelId} via endpoint ${FRIENDLI_ENDPOINT_ID}...`);

  const response = await fetch(`${FRIENDLI_BASE_URL}/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FRIENDLI_ENDPOINT_ID,
      prompt: prompt,
      max_tokens: 512,
      min_tokens: 30,
      temperature: 0.7,
      top_p: 0.9,
      stop: ['Question:', '\n\nTask:', '\n\n\n'],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let error = {};
    try {
      error = JSON.parse(errorText);
    } catch (e) {
      error = { raw: errorText };
    }
    console.error('[Friendli] API error:', response.status, error);

    if (response.status === 401) {
      throw new Error('Invalid Friendli.ai API key. Please check your settings.');
    }
    if (response.status === 403) {
      const detail = error.detail || error.message || error.raw || '';
      throw new Error(`Access denied: ${detail || 'Check API key permissions for this endpoint'}`);
    }
    if (response.status === 429) {
      throw new Error('Friendli.ai rate limit exceeded. Please try again later.');
    }
    if (response.status === 404) {
      throw new Error(`Endpoint "${FRIENDLI_ENDPOINT_ID}" not found. Check endpoint ID in settings.`);
    }

    throw new Error(error.message || error.detail || `Friendli.ai error: ${response.status}`);
  }

  const result = await response.json();
  const generatedText = result.choices?.[0]?.text;

  if (!generatedText) {
    throw new Error('No response received from Friendli.ai');
  }

  return generatedText.trim();
}

/**
 * Warm up the Friendli endpoint by sending a minimal request
 * Supports both server-side and client-side modes
 * 
 * @returns {Promise<{success: boolean, status: string, message: string}>}
 */
export async function warmupFriendliEndpoint() {
  const clientToken = getClientFriendliToken();
  const serverStatus = await checkServerFriendli();
  
  // Try server-side warmup first
  if (serverStatus.configured) {
    console.log('[Friendli] Warming up via server...');
    try {
      const response = await fetch(`${API_BASE}/api/friendli/warmup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('[Friendli] Server warmup failed:', error.message);
    }
  }
  
  // Fall back to client-side warmup
  if (clientToken) {
    console.log('[Friendli] Warming up via client...');
    try {
      const response = await fetch(`${FRIENDLI_BASE_URL}/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: FRIENDLI_ENDPOINT_ID,
          prompt: 'Hi',
          max_tokens: 1,
        }),
      });

      if (response.ok) {
        return { success: true, status: 'ready', message: 'Endpoint is ready' };
      }
      if (response.status === 503) {
        return { success: false, status: 'waking', message: 'Endpoint is waking up, please wait ~30 seconds' };
      }
      return { success: false, status: 'error', message: `Status: ${response.status}` };
    } catch (error) {
      return { success: false, status: 'error', message: error.message };
    }
  }
  
  return { success: false, status: 'not_configured', message: 'Friendli not configured' };
}

/**
 * Check if a model ID is a Friendli-hosted model
 */
export function isFriendliModel(modelId) {
  return modelId in FRIENDLI_MODELS;
}
