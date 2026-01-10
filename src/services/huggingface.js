/**
 * HuggingFace Service for EthicalAIditor
 * 
 * Calls Compute Engine VM directly for LLM requests (always-on, no cold start).
 * Falls back to Cloud Run or direct HuggingFace API if needed.
 * Supports PleIAs ethical AI models trained on Common Corpus.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
// Netlify Function to proxy to VM (Netlify can call HTTP, unlike Cloudflare Workers)
const NETLIFY_VM_ENDPOINT = '/.netlify/functions/vm-chat';
// Direct Cloud Run (HTTPS, has cold start)
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';
const DEFAULT_MODEL = 'PleIAs/Pleias-1.2b-Preview';

// Check if fetch is available (should be in all modern browsers and Node 18+)
const fetchFn = typeof fetch !== 'undefined' ? fetch : null;

/**
 * Get auth headers from local storage
 */
function getAuthHeaders() {
  const token = localStorage.getItem('ethicalaiditor_auth_token');
  const userId = localStorage.getItem('ethicalaiditor_user_id');
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  
  return headers;
}

/**
 * Get selected model from localStorage
 */
function getSelectedModel() {
  return localStorage.getItem('ethicalaiditor_model') || DEFAULT_MODEL;
}

/**
 * Chat with LLM via Cloudflare Worker proxy
 * 
 * @param {Array} messages - Array of {role, content} message objects
 * @param {string} manuscriptContext - Optional manuscript text for context
 * @param {string} model - Optional model override (defaults to user selection)
 * @returns {Promise<string>} - Generated text response
 */
export const chatWithLLM = async (messages, manuscriptContext = '', model = null) => {
  const selectedModel = model || getSelectedModel();

  // If no API configured, fall back to direct HuggingFace call (requires user's API key)
  if (!API_BASE && !CLOUD_RUN_URL) {
    const apiKey = localStorage.getItem('hf_api_key');
    if (!apiKey) {
      throw new Error('Please configure the Cloudflare Worker URL or provide a HuggingFace API key in settings.');
    }
    return directHuggingFaceCall(messages, selectedModel, apiKey, manuscriptContext);
  }

  // Build prompt with truncated context to stay under token limits
  const contextPrefix = manuscriptContext 
    ? `Context from manuscript: ${manuscriptContext.substring(0, 500)}\n\n`
    : '';
  const userMessage = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = contextPrefix + userMessage;

  // Try Netlify Function VM proxy first (Netlify can call HTTP endpoints)
  // Note: Netlify free tier has 10s timeout, so we use a short max_tokens
  try {
    console.log('[Chat] Calling VM via Netlify Function...');
    const response = await fetch(NETLIFY_VM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: 150,  // Keep short for faster response
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Chat] Response received from:', result.source);
      return result.text || '';
    }
    
    const err = await response.json().catch(() => ({}));
    console.error('[Chat] Netlify Function error:', err);
  } catch (error) {
    console.error('[Chat] Netlify Function failed, trying Cloud Run:', error);
  }

  // Fallback: Direct Cloud Run call
  try {
    console.log('[Chat] Calling Cloud Run directly...');
    const response = await fetch(`${CLOUD_RUN_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: selectedModel,
        manuscriptContext: manuscriptContext?.substring(0, 3000),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[Chat] Cloud Run error:', err);
      throw new Error(err.error || `Cloud Run error: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Chat] Cloud Run response received');
    return result.text || result.response || '';
  } catch (error) {
    console.error('[Chat] Cloud Run failed:', error);
    
    // Fallback to Cloudflare Worker
    if (API_BASE) {
      try {
        console.log('[Chat] Trying Cloudflare Worker fallback...');
        const response = await fetch(`${API_BASE}/api/huggingface`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            messages,
            model: selectedModel,
            manuscriptContext: manuscriptContext?.substring(0, 3000),
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          if (response.status === 429) {
            throw new Error(`Rate limit exceeded. ${err.error || 'Please sign up for more requests or wait until tomorrow.'}`);
          }
          throw new Error(err.error || `API error: ${response.status}`);
        }

        const result = await response.json();
        return result.text || '';
      } catch (workerError) {
        console.error('[Chat] Worker fallback also failed:', workerError);
        throw workerError;
      }
    }
    
    throw error;
  }
};

/**
 * Direct HuggingFace API call (fallback when worker not configured)
 */
async function directHuggingFaceCall(messages, model, apiKey, manuscriptContext = '') {
  let systemPrompt = 'You are an ethical AI writing assistant trained on legally licensed materials.';
  
  if (manuscriptContext) {
    systemPrompt += `\n\nManuscript context:\n${manuscriptContext.substring(0, 2000)}`;
  }
  
  const prompt = messages.map(m => 
    `${m.role === 'user' ? '[INST]' : ''} ${m.content} ${m.role === 'user' ? '[/INST]' : ''}`
  ).join('\n');

  const fullPrompt = `${systemPrompt}\n\n${prompt}`;

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: fullPrompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch from HuggingFace');
  }

  const result = await response.json();
  return result[0]?.generated_text || '';
}

/**
 * Get usage statistics from the API
 */
export const getUsageStats = async () => {
  if (!API_BASE) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/usage`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.usage;
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    return null;
  }
};

/**
 * Get available models from the API
 */
export const getAvailableModels = async () => {
  if (!API_BASE) {
    return {
      models: {
        'PleIAs/Pleias-1.2b-Preview': { name: 'Pleias 1.2B', description: 'More nuanced writing suggestions' },
        'PleIAs/Pleias-350m-Preview': { name: 'Pleias 350M', description: 'Faster responses, lighter footprint' },
      },
      default: DEFAULT_MODEL,
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/models`);
    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching models:', error);
    return null;
  }
};

export { DEFAULT_MODEL };
