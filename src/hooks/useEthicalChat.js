/**
 * Custom chat hook for EthicalAIditor
 * 
 * Uses Vercel AI SDK's useChat pattern but customized for our
 * Cloudflare Worker backend with manuscript context support.
 */

import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const DEFAULT_MODEL = 'PleIAs/Pleias-1.2b-Preview';

/**
 * Get auth headers for API calls
 */
function getAuthHeaders() {
  const token = localStorage.getItem('ethicalaiditor_auth_token');
  const userId = localStorage.getItem('ethicalaiditor_user_id');
  
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  
  return headers;
}

/**
 * Custom hook for ethical AI chat with streaming support
 * 
 * @param {Object} options
 * @param {string} options.manuscriptContext - The manuscript text for context
 * @param {string} options.model - The model to use
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onFinish - Callback when message completes
 */
export function useEthicalChat({ 
  manuscriptContext = '', 
  model = null,
  onError,
  onFinish,
} = {}) {
  const [apiConfigured, setApiConfigured] = useState(!!API_BASE);
  const selectedModel = model || localStorage.getItem('ethicalaiditor_model') || DEFAULT_MODEL;
  const selectedMcp = localStorage.getItem('ethicalaiditor_mcp') || 'huggingface';

  // Use Vercel AI SDK's useChat with custom fetch
  const chatHelpers = useChat({
    api: `${API_BASE}/api/huggingface`,
    streamProtocol: 'data',
    headers: getAuthHeaders(),
    body: {
      model: selectedModel,
      mcp: selectedMcp,
      manuscriptContext: manuscriptContext?.substring(0, 3000),
      stream: true,
    },
    onError: (error) => {
      console.error('Chat error:', error);
      if (onError) {
        // Improve error messages
        if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
          onError(new Error('Cannot reach the API server. The Cloudflare Worker may not be deployed yet.'));
        } else {
          onError(error);
        }
      }
    },
    onFinish: (message) => {
      if (onFinish) onFinish(message);
    },
  });

  // Update body when manuscript context changes
  useEffect(() => {
    // The body is included in each request, so changes to manuscriptContext
    // will be picked up on the next message
  }, [manuscriptContext]);

  return {
    ...chatHelpers,
    apiConfigured,
    selectedModel,
    selectedMcp,
  };
}

/**
 * Non-streaming chat function (for compatibility)
 */
export async function sendMessage(messages, manuscriptContext = '', model = null) {
  const selectedModel = model || localStorage.getItem('ethicalaiditor_model') || DEFAULT_MODEL;
  const selectedMcp = localStorage.getItem('ethicalaiditor_mcp') || 'huggingface';

  if (!API_BASE) {
    throw new Error('API not configured. Please deploy the Cloudflare Worker first.');
  }

  const response = await fetch(`${API_BASE}/api/huggingface`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      messages,
      model: selectedModel,
      mcp: selectedMcp,
      manuscriptContext: manuscriptContext?.substring(0, 3000),
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }

  const result = await response.json();
  return result.text || '';
}

export { DEFAULT_MODEL };
