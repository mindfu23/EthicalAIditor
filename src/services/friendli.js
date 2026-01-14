/**
 * Friendli.ai Service for EthicalAIditor
 *
 * Handles API calls to Friendli.ai for BLOOM/BLOOMZ models.
 * Friendli.ai provides fast, managed inference endpoints.
 * 
 * API Docs: https://friendli.ai/docs/guides/dedicated_endpoints/quickstart
 */

// Base URL for Friendli dedicated endpoints
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

/**
 * Get Friendli API token from environment or localStorage
 */
function getFriendliToken() {
  // Try environment variable first (for production builds)
  const envToken = import.meta.env.VITE_FRIENDLI_API_KEY;
  if (envToken) return envToken;

  // Fall back to localStorage (for user-provided keys)
  return localStorage.getItem('friendli_api_key');
}

/**
 * Check if Friendli.ai is configured
 */
export function isFriendliConfigured() {
  return !!getFriendliToken();
}

/**
 * Chat with a BLOOM model via Friendli.ai
 *
 * @param {Array} messages - Array of {role, content} message objects
 * @param {string} modelId - The BLOOM model ID (e.g., 'bigscience/bloomz-560m')
 * @param {string} manuscriptContext - Optional manuscript text for context
 * @returns {Promise<string>} - Generated text response
 */
export async function chatWithFriendli(messages, modelId, manuscriptContext = '') {
  const token = getFriendliToken();

  if (!token) {
    throw new Error('Friendli.ai API key not configured. Please add your API key in settings.');
  }

  const modelConfig = FRIENDLI_MODELS[modelId];
  if (!modelConfig) {
    throw new Error(`Unknown Friendli model: ${modelId}`);
  }

  // Get the latest user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  
  // Build prompt optimized for BLOOMZ instruction-following
  // BLOOMZ responds well to direct task instructions
  let prompt = '';
  
  if (manuscriptContext) {
    // Include manuscript for context-aware responses
    const truncatedContext = manuscriptContext.substring(0, 1200);
    prompt = `Task: You are a helpful writing assistant. Read the following story excerpt and answer the question.\n\nStory excerpt:\n${truncatedContext}\n\nQuestion: ${lastUserMessage}\n\nAnswer:`;
  } else {
    // Simple Q&A format without manuscript
    prompt = `Task: Answer the following question helpfully and thoroughly.\n\nQuestion: ${lastUserMessage}\n\nAnswer:`;
  }

  console.log(`[Friendli] Calling ${modelId} via endpoint ${FRIENDLI_ENDPOINT_ID}...`);
  console.log(`[Friendli] Prompt preview:`, prompt.substring(0, 200) + '...');

  // Use completions API (not chat/completions) for BLOOMZ models
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
      min_tokens: 30,  // Ensure we get a meaningful response
      temperature: 0.7,
      top_p: 0.9,
      stop: ['Question:', '\n\nTask:', '\n\n\n'],  // Stop at next question or task
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
    console.error('[Friendli] Endpoint ID used:', FRIENDLI_ENDPOINT_ID);

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
  console.log('[Friendli] Response received:', result);

  // Extract the text from completions API response
  const generatedText = result.choices?.[0]?.text;

  if (!generatedText) {
    throw new Error('No response received from Friendli.ai');
  }

  // Clean up the response
  return generatedText.trim();
}

/**
 * Warm up the Friendli endpoint by sending a minimal request
 * This helps wake up sleeping endpoints when a user selects a BLOOM model
 * 
 * @returns {Promise<{success: boolean, status: string, message: string}>}
 */
export async function warmupFriendliEndpoint() {
  const token = getFriendliToken();
  
  if (!token) {
    return { success: false, status: 'not_configured', message: 'API key not set' };
  }

  console.log('[Friendli] Warming up endpoint...');

  try {
    // Use completions API (not chat) for BLOOMZ
    const response = await fetch(`${FRIENDLI_BASE_URL}/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: FRIENDLI_ENDPOINT_ID,
        prompt: 'Hi',
        max_tokens: 1, // Minimal tokens to reduce cost/time
      }),
    });

    if (response.ok) {
      console.log('[Friendli] Endpoint is warm and ready');
      return { success: true, status: 'ready', message: 'Endpoint is ready' };
    }

    if (response.status === 503) {
      console.log('[Friendli] Endpoint is waking up...');
      return { success: false, status: 'waking', message: 'Endpoint is waking up, please wait ~30 seconds' };
    }

    if (response.status === 403) {
      return { success: false, status: 'forbidden', message: 'Check API key and endpoint permissions' };
    }

    return { success: false, status: 'error', message: `Status: ${response.status}` };
  } catch (error) {
    console.error('[Friendli] Warmup error:', error);
    return { success: false, status: 'error', message: error.message };
  }
}

/**
 * Check if a model ID is a Friendli-hosted model
 */
export function isFriendliModel(modelId) {
  return modelId in FRIENDLI_MODELS;
}
