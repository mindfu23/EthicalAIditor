/**
 * HuggingFace Service for EthicalAIditor
 *
 * Calls Compute Engine VM directly for LLM requests (always-on, no cold start).
 * Falls back to Cloud Run or direct HuggingFace API if needed.
 * Supports PleIAs ethical AI models trained on Common Corpus.
 * Supports BLOOM/BLOOMZ models via Friendli.ai.
 *
 * Desktop (Electron): Can use local llama.cpp inference for instant, offline responses.
 * Mobile (iOS/Android): Can use local llama.cpp via Capacitor plugin for offline use.
 */

import {
  isElectron,
  isMobile,
  generateLocal,
  isLocalInferenceAvailable as checkLocalAvailable,
  Platform,
  getPlatform
} from './local-llm.js';

import {
  chatWithFriendli,
  isFriendliModel,
  isFriendliConfigured,
  warmupFriendliEndpoint,
  FRIENDLI_MODELS
} from './friendli.js';

// Re-export Friendli functions for components
export { isFriendliConfigured, warmupFriendliEndpoint };

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
// Netlify Function to proxy to VM (Netlify can call HTTP, unlike Cloudflare Workers)
const NETLIFY_VM_ENDPOINT = '/.netlify/functions/vm-chat';
// Direct Cloud Run (HTTPS, has cold start)
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';
const DEFAULT_MODEL = 'PleIAs/Pleias-1.2b-Preview';

// Inference mode: 'cloud' (default) or 'local' (desktop/mobile only)
export const InferenceMode = {
  CLOUD: 'cloud',
  LOCAL: 'local'
};

/**
 * Get current inference mode from settings
 */
export function getInferenceMode() {
  if (!checkLocalAvailable()) return InferenceMode.CLOUD;
  return localStorage.getItem('ethicalaiditor_inference_mode') || InferenceMode.CLOUD;
}

/**
 * Set inference mode
 */
export function setInferenceMode(mode) {
  localStorage.setItem('ethicalaiditor_inference_mode', mode);
}

/**
 * Check if local inference is available (desktop or mobile)
 */
export function isLocalInferenceAvailable() {
  return checkLocalAvailable();
}

/**
 * Get current platform info for UI
 */
export function getPlatformInfo() {
  const platform = getPlatform();
  return {
    platform,
    isDesktop: platform === Platform.ELECTRON,
    isMobile: platform === Platform.IOS || platform === Platform.ANDROID,
    isWeb: platform === Platform.WEB,
    supportsLocalInference: platform !== Platform.WEB,
    platformName: {
      [Platform.WEB]: 'Web Browser',
      [Platform.ELECTRON]: 'Mac Desktop',
      [Platform.IOS]: 'iOS',
      [Platform.ANDROID]: 'Android'
    }[platform]
  };
}

// Average response time tracking (for estimating wait times)
let lastResponseTime = 45000; // Start with 45s estimate
let responseTimeHistory = [];

/**
 * Get estimated response time based on history
 */
export function getEstimatedResponseTime() {
  if (responseTimeHistory.length === 0) return lastResponseTime;
  const avg = responseTimeHistory.reduce((a, b) => a + b, 0) / responseTimeHistory.length;
  return Math.round(avg);
}

/**
 * Clean up model response - remove instruction tokens and ensure complete sentences
 */
function cleanResponse(text) {
  if (!text) return '';
  
  // Remove common instruction tokens and artifacts
  let cleaned = text
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')
    .replace(/<<SYS>>.*?<<\/SYS>>/gs, '')
    .replace(/<\|.*?\|>/g, '')
    .replace(/^(user|assistant|system):\s*/gim, '')
    .trim();
  
  // If the response appears to be cut off mid-sentence, trim to last complete sentence
  // Look for sentence-ending punctuation followed by space or end
  const sentences = cleaned.match(/[^.!?]*[.!?]+(?:\s|$)/g);
  
  if (sentences && sentences.length > 0) {
    // If the cleaned text doesn't end with punctuation, use complete sentences only
    const lastChar = cleaned.slice(-1);
    if (!/[.!?]/.test(lastChar)) {
      cleaned = sentences.join('').trim();
    }
  }
  
  // Clean up any double spaces or weird whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

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
 * @param {function} onProgress - Optional callback for progress updates (elapsed, estimated)
 * @returns {Promise<string>} - Generated text response
 */
export const chatWithLLM = async (messages, manuscriptContext = '', model = null, onProgress = null) => {
  // Check if using local inference (Electron desktop app or mobile)
  const inferenceMode = getInferenceMode();
  const localAvailable = checkLocalAvailable();

  if (inferenceMode === InferenceMode.LOCAL && localAvailable) {
    return chatWithLocalLLM(messages, manuscriptContext, onProgress);
  }

  const selectedModel = model || getSelectedModel();

  // Check if this is a Friendli-hosted model (BLOOM/BLOOMZ)
  if (isFriendliModel(selectedModel)) {
    const startTime = Date.now();
    let progressInterval = null;

    if (onProgress) {
      const estimated = 10000; // Friendli is fast, estimate 10s
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        onProgress(elapsed, estimated);
      }, 500);
    }

    try {
      const response = await chatWithFriendli(messages, selectedModel, manuscriptContext);
      if (progressInterval) clearInterval(progressInterval);

      // Track response time
      const elapsed = Date.now() - startTime;
      responseTimeHistory.push(elapsed);
      if (responseTimeHistory.length > 5) responseTimeHistory.shift();
      lastResponseTime = elapsed;

      return cleanResponse(response);
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      throw error;
    }
  }
  const startTime = Date.now();
  
  // Start progress tracking
  let progressInterval = null;
  if (onProgress) {
    const estimated = getEstimatedResponseTime();
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      onProgress(elapsed, estimated);
    }, 500);
  }
  
  const cleanupAndReturn = (response) => {
    if (progressInterval) clearInterval(progressInterval);
    
    // Track response time for future estimates
    const elapsed = Date.now() - startTime;
    responseTimeHistory.push(elapsed);
    if (responseTimeHistory.length > 5) responseTimeHistory.shift(); // Keep last 5
    lastResponseTime = elapsed;
    
    // Clean the response
    return cleanResponse(response);
  };

  // If no API configured, fall back to direct HuggingFace call (requires user's API key)
  if (!API_BASE && !CLOUD_RUN_URL) {
    const apiKey = localStorage.getItem('hf_api_key');
    if (!apiKey) {
      if (progressInterval) clearInterval(progressInterval);
      throw new Error('Please configure the Cloudflare Worker URL or provide a HuggingFace API key in settings.');
    }
    const result = await directHuggingFaceCall(messages, selectedModel, apiKey, manuscriptContext);
    return cleanupAndReturn(result);
  }

  // Build prompt with truncated context to stay under token limits
  // Use 2000 chars for better context (about 500 tokens)
  const contextPrefix = manuscriptContext 
    ? `Context from manuscript:\n---\n${manuscriptContext.substring(0, 2000)}\n---\n\n`
    : '';
  const userMessage = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = contextPrefix + userMessage;

  // Try Cloud Run first (HTTPS, longer timeout, handles cold starts)
  try {
    console.log('[Chat] Calling Cloud Run...');
    const response = await fetch(`${CLOUD_RUN_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: selectedModel,
        manuscriptContext: manuscriptContext?.substring(0, 2000),
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Chat] Cloud Run response received');
      return cleanupAndReturn(result.text || result.response || '');
    }
    
    const err = await response.json().catch(() => ({}));
    console.error('[Chat] Cloud Run error:', err);
  } catch (error) {
    console.error('[Chat] Cloud Run failed, trying Netlify Function:', error);
  }

  // Fallback: Try Netlify Function VM proxy (10s timeout on free tier)
  try {
    console.log('[Chat] Calling VM via Netlify Function...');
    const response = await fetch(NETLIFY_VM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: 100,  // Very short for 10s timeout
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Chat] Response received from:', result.source);
      return cleanupAndReturn(result.text || '');
    }
    
    const err = await response.json().catch(() => ({}));
    console.error('[Chat] Netlify Function error:', err);
  } catch (error) {
    console.error('[Chat] Netlify Function failed:', error);
  }

  // Final fallback: Cloudflare Worker
  if (API_BASE) {
    try {
      console.log('[Chat] Trying Cloudflare Worker fallback...');
      const response = await fetch(`${API_BASE}/api/huggingface`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          messages,
          model: selectedModel,
          manuscriptContext: manuscriptContext?.substring(0, 2000),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) {
          if (progressInterval) clearInterval(progressInterval);
          throw new Error(`Rate limit exceeded. ${err.error || 'Please sign up for more requests or wait until tomorrow.'}`);
        }
        console.error('[Chat] Worker fallback error:', err);
        if (progressInterval) clearInterval(progressInterval);
        throw new Error(err.error || `API error: ${response.status}`);
      }

      const result = await response.json();
      return cleanupAndReturn(result.text || '');
    } catch (workerError) {
      console.error('[Chat] Worker fallback also failed:', workerError);
    }
  }
  
  // All fallbacks failed - clean up progress interval
  if (progressInterval) clearInterval(progressInterval);
  throw new Error('AI service temporarily unavailable. Please try again.');
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

/**
 * Chat with local LLM (Electron desktop app only)
 * Uses llama.cpp via node-llama-cpp for instant, offline inference
 */
async function chatWithLocalLLM(messages, manuscriptContext = '', onProgress = null) {
  const startTime = Date.now();
  
  // Build prompt
  const contextPrefix = manuscriptContext 
    ? `Context from manuscript:\n---\n${manuscriptContext.substring(0, 2000)}\n---\n\n`
    : '';
  const userMessage = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = contextPrefix + userMessage;
  
  // Start progress tracking (local inference is much faster)
  let progressInterval = null;
  if (onProgress) {
    const estimated = 5000; // Local models are fast, estimate 5s
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      onProgress(elapsed, estimated);
    }, 200);
  }
  
  try {
    console.log('[Local LLM] Generating response...');
    const result = await generateLocal(prompt, {
      maxTokens: 256,
      temperature: 0.7
    });
    
    if (progressInterval) clearInterval(progressInterval);
    console.log(`[Local LLM] Generated in ${result.elapsed}s`);
    
    return cleanResponse(result.text);
  } catch (error) {
    if (progressInterval) clearInterval(progressInterval);
    console.error('[Local LLM] Error:', error);
    throw error;
  }
}

export { DEFAULT_MODEL, FRIENDLI_MODELS };
