/**
 * HuggingFace Service for EthicalAIditor
 *
 * Routes all cloud LLM requests through the Cloudflare Worker proxy,
 * which calls HuggingFace Inference API (Pro plan) server-side.
 * Falls back to direct HuggingFace API if user provides their own key.
 *
 * Supports PleIAs and BLOOM/BLOOMZ ethical AI models.
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

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const DEFAULT_MODEL = 'PleIAs/Pleias-1.2b-Preview';

// HuggingFace Inference API base URL (for direct calls with user's key)
const HF_INFERENCE_URL = 'https://api-inference.huggingface.co/models';

// Available models on HuggingFace Inference API
export const HF_MODELS = {
  'PleIAs/Pleias-1.2b-Preview': {
    id: 'PleIAs/Pleias-1.2b-Preview',
    name: 'Pleias 1.2B',
    description: 'Ethical AI — more nuanced writing suggestions',
  },
  'PleIAs/Pleias-350m-Preview': {
    id: 'PleIAs/Pleias-350m-Preview',
    name: 'Pleias 350M',
    description: 'Ethical AI — faster responses',
  },
  'bigscience/bloomz-1b7': {
    id: 'bigscience/bloomz-1b7',
    name: 'BLOOMZ 1.7B',
    description: 'Ethical multilingual model (BigScience)',
  },
};

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

// Average response time tracking
let lastResponseTime = 5000; // HF Inference API is much faster than self-hosted
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

  let cleaned = text
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')
    .replace(/<<SYS>>.*?<<\/SYS>>/gs, '')
    .replace(/<\|.*?\|>/g, '')
    .replace(/^(user|assistant|system):\s*/gim, '')
    .trim();

  // If the response appears to be cut off mid-sentence, trim to last complete sentence
  const sentences = cleaned.match(/[^.!?]*[.!?]+(?:\s|$)/g);

  if (sentences && sentences.length > 0) {
    const lastChar = cleaned.slice(-1);
    if (!/[.!?]/.test(lastChar)) {
      cleaned = sentences.join('').trim();
    }
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Get auth headers from local storage
 */
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  const tenantData = localStorage.getItem('ethicalaiditor_tenant');
  if (tenantData) {
    try {
      const parsed = JSON.parse(tenantData);
      if (parsed.token) {
        headers['Authorization'] = `Bearer ${parsed.token}`;
        headers['X-Tenant-Id'] = parsed.tenant_id;
        return headers;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  const token = localStorage.getItem('ethicalaiditor_auth_token');
  const userId = localStorage.getItem('ethicalaiditor_user_id');

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  return headers;
}

/**
 * Get current tenant ID from storage
 */
function getTenantId() {
  const tenantData = localStorage.getItem('ethicalaiditor_tenant');
  if (tenantData) {
    try {
      const parsed = JSON.parse(tenantData);
      return parsed.tenant_id;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Get selected model from localStorage
 */
function getSelectedModel() {
  return localStorage.getItem('ethicalaiditor_model') || DEFAULT_MODEL;
}

/**
 * Chat with LLM via Cloudflare Worker proxy → HuggingFace Inference API
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

    const elapsed = Date.now() - startTime;
    responseTimeHistory.push(elapsed);
    if (responseTimeHistory.length > 5) responseTimeHistory.shift();
    lastResponseTime = elapsed;

    return cleanResponse(response);
  };

  // If no worker URL configured, fall back to direct HuggingFace call (requires user's API key)
  if (!API_BASE) {
    const apiKey = localStorage.getItem('hf_api_key');
    if (!apiKey) {
      if (progressInterval) clearInterval(progressInterval);
      throw new Error('Please configure the Cloudflare Worker URL or provide a HuggingFace API key in settings.');
    }
    const result = await directHuggingFaceCall(messages, selectedModel, apiKey, manuscriptContext);
    return cleanupAndReturn(result);
  }

  // Get tenant ID for logging
  const tenantId = getTenantId();
  if (tenantId) {
    console.log('[Chat] Using tenant:', tenantId);
  }

  // Call Cloudflare Worker (which proxies to HuggingFace Inference API)
  try {
    console.log(`[Chat] Calling HuggingFace Inference API via worker for ${selectedModel}...`);
    const response = await fetch(`${API_BASE}/api/huggingface`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        messages,
        model: selectedModel,
        manuscriptContext: manuscriptContext?.substring(0, 2000),
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Chat] Response received (${result.latency_ms || '?'}ms)`);
      return cleanupAndReturn(result.text || result.response || '');
    }

    if (response.status === 429) {
      const err = await response.json().catch(() => ({}));
      if (progressInterval) clearInterval(progressInterval);
      throw new Error(`Rate limit exceeded. ${err.error || 'Please sign up for more requests or wait until tomorrow.'}`);
    }

    if (response.status === 503) {
      const err = await response.json().catch(() => ({}));
      if (progressInterval) clearInterval(progressInterval);
      throw new Error(err.error || 'Model is loading. Please try again in ~20 seconds.');
    }

    const err = await response.json().catch(() => ({}));
    console.error('[Chat] Worker error:', err);
    if (progressInterval) clearInterval(progressInterval);
    throw new Error(err.error || 'AI service error. Please try again.');
  } catch (error) {
    if (progressInterval) clearInterval(progressInterval);
    throw error;
  }
};

/**
 * Direct HuggingFace Inference API call (fallback when worker not configured)
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

  const response = await fetch(`${HF_INFERENCE_URL}/${model}`, {
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
    const error = await response.json().catch(() => ({ error: 'HuggingFace API error' }));
    if (response.status === 503) {
      throw new Error('Model is loading on HuggingFace. Please try again in ~20 seconds.');
    }
    throw new Error(error.error || 'Failed to fetch from HuggingFace');
  }

  const result = await response.json();
  // HF Inference API returns [{generated_text: "..."}]
  if (Array.isArray(result)) {
    return result[0]?.generated_text || '';
  }
  return result.generated_text || '';
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
      models: HF_MODELS,
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
 * Chat with local LLM (Electron desktop app or mobile)
 * Uses llama.cpp via node-llama-cpp for instant, offline inference
 */
async function chatWithLocalLLM(messages, manuscriptContext = '', onProgress = null) {
  const startTime = Date.now();

  const contextPrefix = manuscriptContext
    ? `Context from manuscript:\n---\n${manuscriptContext.substring(0, 2000)}\n---\n\n`
    : '';
  const userMessage = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = contextPrefix + userMessage;

  let progressInterval = null;
  if (onProgress) {
    const estimated = 5000;
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

// DEFAULT_MODEL and HF_MODELS are already exported above
