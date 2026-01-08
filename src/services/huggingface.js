/**
 * HuggingFace Service for EthicalAIditor
 * 
 * Calls the Cloudflare Worker proxy for secure API access.
 * Supports PleIAs ethical AI models trained on Common Corpus.
 */

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const DEFAULT_MODEL = 'PleIAs/Pleias-1.2b-Preview';
const DEFAULT_MCP = 'huggingface';

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
 * Get selected MCP from localStorage
 */
function getSelectedMcp() {
  return localStorage.getItem('ethicalaiditor_mcp') || DEFAULT_MCP;
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
  const selectedMcp = getSelectedMcp();

  // If no API configured, fall back to direct HuggingFace call (requires user's API key)
  if (!API_BASE) {
    const apiKey = localStorage.getItem('hf_api_key');
    if (!apiKey) {
      throw new Error('Please configure the Cloudflare Worker URL or provide a HuggingFace API key in settings.');
    }
    return directHuggingFaceCall(messages, selectedModel, apiKey, manuscriptContext);
  }

  try {
    const response = await fetch(`${API_BASE}/api/huggingface`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        messages,
        model: selectedModel,
        mcp: selectedMcp,
        manuscriptContext: manuscriptContext?.substring(0, 3000), // Limit context size
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      
      // Handle rate limiting
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded. ${error.error || 'Please sign up for more requests or wait until tomorrow.'}`);
      }
      
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const result = await response.json();
    return result.text || '';
  } catch (error) {
    console.error('Error calling API:', error);
    
    // Provide clearer error messages for common issues
    if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
      throw new Error('Cannot reach the API server. The Cloudflare Worker may not be deployed yet. Check DEPLOYMENT.md for setup instructions.');
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

export { DEFAULT_MODEL, DEFAULT_MCP };
