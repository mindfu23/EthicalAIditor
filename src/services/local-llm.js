/**
 * Local LLM Service for EthicalAIditor
 * 
 * Unified interface for local model inference across all platforms:
 * - Mac Desktop: Electron + node-llama-cpp
 * - iOS/Android: Capacitor + llama.cpp native plugin
 * - Web: Falls back to cloud API
 */

import * as MobileLLM from './mobile-llm.js';

// Platform detection
export const Platform = {
  WEB: 'web',
  ELECTRON: 'electron',
  IOS: 'ios',
  ANDROID: 'android'
};

/**
 * Get current platform
 */
export function getPlatform() {
  // Check Electron first
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron === true) {
    return Platform.ELECTRON;
  }
  
  // Check Capacitor mobile
  if (MobileLLM.isMobile()) {
    return MobileLLM.getPlatform();
  }
  
  return Platform.WEB;
}

/**
 * Check if running in Electron
 */
export const isElectron = () => {
  return getPlatform() === Platform.ELECTRON;
};

/**
 * Check if running on mobile (iOS or Android)
 */
export const isMobile = () => {
  return MobileLLM.isMobile();
};

/**
 * Check if local inference is available on this platform
 */
export const isLocalInferenceAvailable = () => {
  return getPlatform() !== Platform.WEB;
};

// Available models for download (GGUF format for llama.cpp)
export const AVAILABLE_MODELS = [
  {
    id: 'pleias-350m',
    name: 'PleIAs 350M',
    description: 'Fast, ethical model trained on Common Corpus',
    size: '200MB',
    sizeBytes: 200 * 1024 * 1024,
    ramRequired: '1GB',
    url: 'https://huggingface.co/PleIAs/Pleias-350m-Preview-GGUF/resolve/main/pleias-350m-q4_k_m.gguf',
    filename: 'pleias-350m-q4_k_m.gguf',
    recommended: true
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    description: 'Meta\'s compact model, good quality',
    size: '600MB',
    sizeBytes: 600 * 1024 * 1024,
    ramRequired: '2GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    filename: 'llama-3.2-1b-q4_k_m.gguf'
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    description: 'Best balance of speed and quality',
    size: '1.8GB',
    sizeBytes: 1.8 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    filename: 'llama-3.2-3b-q4_k_m.gguf'
  },
  {
    id: 'qwen-2.5-3b',
    name: 'Qwen 2.5 3B',
    description: 'Excellent for writing tasks',
    size: '1.8GB',
    sizeBytes: 1.8 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    filename: 'qwen-2.5-3b-q4_k_m.gguf'
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    description: 'Premium quality (needs 8GB+ RAM)',
    size: '4GB',
    sizeBytes: 4 * 1024 * 1024 * 1024,
    ramRequired: '8GB',
    url: 'https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    filename: 'mistral-7b-instruct-v0.2-q4_k_m.gguf'
  },
  {
    id: 'llama-3.1-70b',
    name: 'Llama 3.1 70B',
    description: 'Top quality (needs 40GB+ RAM - Mac Studio)',
    size: '40GB',
    sizeBytes: 40 * 1024 * 1024 * 1024,
    ramRequired: '48GB',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-70B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-70B-Instruct-Q4_K_M.gguf',
    filename: 'llama-3.1-70b-instruct-q4_k_m.gguf',
    proOnly: true
  }
];

/**
 * Get system information (Electron or Mobile)
 */
export async function getSystemInfo() {
  const platform = getPlatform();
  
  if (platform === Platform.ELECTRON) {
    return await window.electronAPI.getSystemInfo();
  }
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.getMobileDeviceInfo();
  }
  
  return null;
}
  return await window.electronAPI.getSystemInfo();
}

/**
 * Get list of downloaded models (all platforms)
 */
export async function getDownloadedModels() {
  const platform = getPlatform();
  
  if (platform === Platform.ELECTRON) {
    const result = await window.electronAPI.getModels();
    return result.success ? result.models : [];
  }
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.getMobileDownloadedModels();
  }
  
  return [];
}

/**
 * Get models directory path
 */
export async function getModelsDirectory() {
  const platform = getPlatform();
  
  if (platform === Platform.ELECTRON) {
    const result = await window.electronAPI.getModels();
    return result.modelsDir;
  }
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.getMobileModelsDirectory();
  }
  
  return null;
}

/**
 * Open models directory (Mac only - shows in Finder)
 */
export async function openModelsDirectory() {
  if (!isElectron()) {
    return false;
  }
  await window.electronAPI.openModelsDir();
  return true;
}

/**
 * Download a model (all platforms)
 */
export async function downloadModel(modelId, onProgress) {
  const platform = getPlatform();
  
  // Mobile platforms
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.downloadMobileModel(modelId, onProgress);
  }
  
  // Electron
  if (platform !== Platform.ELECTRON) {
    throw new Error('Model download only available in desktop/mobile app');
  }
  
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  
  // Set up progress listener
  if (onProgress) {
    window.electronAPI.onDownloadProgress((data) => {
      if (data.filename === model.filename) {
        onProgress(data);
      }
    });
  }
  
  const result = await window.electronAPI.downloadModel(model.url, model.filename);
  
  // Clean up listener
  window.electronAPI.removeDownloadProgressListener();
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.path;
}

/**
 * Load a model for inference (all platforms)
 */
export async function loadModel(modelPath) {
  const platform = getPlatform();
  
  // Mobile platforms
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    const result = await MobileLLM.loadMobileModel(modelPath);
    return result.loadTime;
  }
  
  // Electron
  if (platform !== Platform.ELECTRON) {
    throw new Error('Local models only available in desktop/mobile app');
  }
  
  const result = await window.electronAPI.loadModel(modelPath);
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.loadTime;
}

/**
 * Unload current model (all platforms)
 */
export async function unloadModel() {
  const platform = getPlatform();
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    await MobileLLM.unloadMobileModel();
    return;
  }
  
  if (platform === Platform.ELECTRON) {
    await window.electronAPI.unloadModel();
  }
}

/**
 * Generate text using local model (all platforms)
 */
export async function generateLocal(prompt, options = {}) {
  const platform = getPlatform();
  
  // Mobile platforms
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.generateMobile(prompt, options);
  }
  
  // Electron
  if (platform !== Platform.ELECTRON) {
    throw new Error('Local generation only available in desktop/mobile app');
  }
  
  const result = await window.electronAPI.generate({
    prompt,
    maxTokens: options.maxTokens || 256,
    temperature: options.temperature || 0.7
  });
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return {
    text: result.text,
    elapsed: result.elapsed
  };
}

/**
 * Check if a model is currently loaded
 */
export function isModelLoaded() {
  const platform = getPlatform();
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return MobileLLM.isMobileModelLoaded();
  }
  
  // For Electron, we'd need to track this - for now return false
  return false;
}

/**
 * Get recommended models based on platform and system RAM
 */
export async function getRecommendedModels() {
  const platform = getPlatform();
  
  // For mobile, use mobile-specific model list
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.getMobileCompatibleModels();
  }
  
  // For desktop/web, use full model list
  const sysInfo = await getSystemInfo();
  if (!sysInfo) {
    return AVAILABLE_MODELS.filter(m => !m.proOnly);
  }
  
  const freeGB = parseFloat(sysInfo.freeMemoryGB || sysInfo.freeMemoryMB / 1024);
  const totalGB = parseFloat(sysInfo.totalMemoryGB || sysInfo.totalMemoryMB / 1024);
  
  return AVAILABLE_MODELS.map(model => {
    const requiredGB = parseFloat(model.ramRequired);
    const canRun = totalGB >= requiredGB;
    const recommended = freeGB >= requiredGB * 1.2; // 20% headroom
    
    return {
      ...model,
      canRun,
      recommended: model.recommended || recommended,
      warning: !canRun ? `Requires ${model.ramRequired} RAM (you have ${totalGB.toFixed(1)}GB)` : null
    };
  });
}

/**
 * Get available models for current platform
 */
export function getAvailableModelsForPlatform() {
  const platform = getPlatform();
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return MobileLLM.MOBILE_MODELS;
  }
  
  return AVAILABLE_MODELS;
}

/**
 * Initialize local LLM service (call on app start)
 */
export async function initializeLocalLLM() {
  const platform = getPlatform();
  
  if (platform === Platform.IOS || platform === Platform.ANDROID) {
    return await MobileLLM.initializeMobileLLM();
  }
  
  // Electron doesn't need initialization
  return true;
}

// Re-export mobile utilities for direct access if needed
export { MobileLLM };
