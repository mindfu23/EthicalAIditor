/**
 * Mobile LLM Service for EthicalAIditor
 *
 * Handles local model inference on iOS and Android using llama.cpp
 * via Capacitor native plugins.
 *
 * Architecture:
 * - iOS: Uses llama.cpp compiled as iOS framework (via capacitor-llama-cpp plugin)
 * - Android: Uses llama.cpp compiled as Android NDK library
 * - Both platforms store models in app's private documents directory
 */

// Capacitor stub for web builds (actual module only available on native)
let Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web'
};

// Try to load real Capacitor if available (native builds)
try {
  // Check if we're in a native context before dynamic import
  if (typeof window !== 'undefined' && window.Capacitor) {
    Capacitor = window.Capacitor;
  }
} catch (e) {
  // Use stub on web
}

// Platform detection
export const Platform = {
  WEB: 'web',
  IOS: 'ios',
  ANDROID: 'android',
  ELECTRON: 'electron'
};

/**
 * Get current platform
 */
export function getPlatform() {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return Platform.ELECTRON;
  }

  try {
    if (Capacitor.isNativePlatform()) {
      return Capacitor.getPlatform(); // 'ios' or 'android'
    }
  } catch (e) {
    // Capacitor not available
  }

  return Platform.WEB;
}

/**
 * Check if running on mobile (iOS or Android)
 */
export function isMobile() {
  const platform = getPlatform();
  return platform === Platform.IOS || platform === Platform.ANDROID;
}

/**
 * Check if local inference is available on this platform
 */
export function isLocalInferenceSupported() {
  const platform = getPlatform();
  return platform !== Platform.WEB;
}

// Mobile-optimized models (smaller sizes for mobile RAM constraints)
export const MOBILE_MODELS = [
  {
    id: 'pleias-350m',
    name: 'PleIAs 350M',
    description: 'Fast, ethical model - recommended for mobile',
    size: '200MB',
    sizeBytes: 200 * 1024 * 1024,
    ramRequired: '1GB',
    downloadUrl: 'https://huggingface.co/PleIAs/Pleias-350m-Preview-GGUF/resolve/main/pleias-350m-q4_k_m.gguf',
    filename: 'pleias-350m-q4_k_m.gguf',
    recommended: true,
    mobileCompatible: true,
    expectedInferenceTime: '2-5s' // On modern phones
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    description: 'Good quality, works on most phones',
    size: '600MB',
    sizeBytes: 600 * 1024 * 1024,
    ramRequired: '2GB',
    downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    filename: 'llama-3.2-1b-q4_k_m.gguf',
    mobileCompatible: true,
    expectedInferenceTime: '5-10s'
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    description: 'Better quality (needs 6GB+ RAM phone)',
    size: '1.8GB',
    sizeBytes: 1.8 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    filename: 'llama-3.2-3b-q4_k_m.gguf',
    mobileCompatible: true,
    highEndOnly: true,
    expectedInferenceTime: '10-20s'
  }
];

// State management for loaded model
let currentModel = null;
let llamaPlugin = null;

/**
 * Initialize the llama.cpp plugin for mobile
 * This should be called once when the app starts
 */
export async function initializeMobileLLM() {
  if (!isMobile()) {
    console.log('[Mobile LLM] Not on mobile platform, skipping init');
    return false;
  }
  
  try {
    // Dynamic import using variable to prevent Vite static analysis
    // This plugin wraps llama.cpp for iOS/Android
    const pluginName = 'capacitor-llama-cpp';
    const module = await import(/* @vite-ignore */ pluginName);
    llamaPlugin = module.LlamaCpp;
    
    console.log('[Mobile LLM] Plugin initialized');
    return true;
  } catch (error) {
    console.error('[Mobile LLM] Failed to initialize:', error);
    return false;
  }
}

/**
 * Get device information for model recommendations
 */
export async function getMobileDeviceInfo() {
  if (!isMobile()) {
    return null;
  }
  
  try {
    const deviceModule = await import(/* @vite-ignore */ '@capacitor/device');
    const Device = deviceModule.Device;
    const info = await Device.getInfo();
    const memInfo = await Device.getMemInfo?.() || {};
    
    return {
      platform: info.platform,
      model: info.model,
      osVersion: info.osVersion,
      manufacturer: info.manufacturer,
      isVirtual: info.isVirtual,
      totalMemoryMB: memInfo.total ? Math.round(memInfo.total / (1024 * 1024)) : null,
      freeMemoryMB: memInfo.free ? Math.round(memInfo.free / (1024 * 1024)) : null
    };
  } catch (error) {
    console.error('[Mobile LLM] Failed to get device info:', error);
    return null;
  }
}

/**
 * Get the app's model storage directory
 */
export async function getMobileModelsDirectory() {
  if (!isMobile()) {
    return null;
  }
  
  try {
    const fsModule = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const { Filesystem, Directory } = fsModule;
    
    // Create models directory if it doesn't exist
    try {
      await Filesystem.mkdir({
        path: 'models',
        directory: Directory.Data,
        recursive: true
      });
    } catch (e) {
      // Directory might already exist
    }
    
    const result = await Filesystem.getUri({
      path: 'models',
      directory: Directory.Data
    });
    
    return result.uri;
  } catch (error) {
    console.error('[Mobile LLM] Failed to get models directory:', error);
    return null;
  }
}

/**
 * Get list of downloaded models on mobile
 */
export async function getMobileDownloadedModels() {
  if (!isMobile()) {
    return [];
  }
  
  try {
    const fsModule = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const { Filesystem, Directory } = fsModule;
    
    const result = await Filesystem.readdir({
      path: 'models',
      directory: Directory.Data
    });
    
    const models = [];
    for (const file of result.files) {
      if (file.name.endsWith('.gguf')) {
        const modelInfo = MOBILE_MODELS.find(m => m.filename === file.name);
        models.push({
          filename: file.name,
          name: modelInfo?.name || file.name.replace('.gguf', ''),
          id: modelInfo?.id || file.name.replace('.gguf', ''),
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          path: `models/${file.name}`
        });
      }
    }
    
    return models;
  } catch (error) {
    console.error('[Mobile LLM] Failed to list models:', error);
    return [];
  }
}

/**
 * Download a model to mobile device
 * @param {string} modelId - Model ID from MOBILE_MODELS
 * @param {function} onProgress - Progress callback ({progress, downloadedMB, totalMB})
 */
export async function downloadMobileModel(modelId, onProgress) {
  if (!isMobile()) {
    throw new Error('Model download only available on mobile');
  }
  
  const model = MOBILE_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  
  try {
    const fsModule = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const { Filesystem, Directory } = fsModule;
    const httpModule = await import(/* @vite-ignore */ '@capacitor-community/http');
    const { Http } = httpModule;
    
    console.log(`[Mobile LLM] Downloading ${model.name}...`);
    
    // Check available storage
    const storageInfo = await checkMobileStorage();
    if (storageInfo && storageInfo.freeBytes < model.sizeBytes * 1.2) {
      throw new Error(`Not enough storage. Need ${model.size}, have ${formatBytes(storageInfo.freeBytes)}`);
    }
    
    // Download with progress
    const destPath = `models/${model.filename}`;
    
    // For large files, we need to use a streaming download
    // This is a simplified version - production would use chunked downloads
    const response = await Http.downloadFile({
      url: model.downloadUrl,
      filePath: destPath,
      fileDirectory: Directory.Data,
      progress: true
    });
    
    // Set up progress listener if available
    if (onProgress && Http.addListener) {
      Http.addListener('progress', (event) => {
        onProgress({
          progress: event.progress * 100,
          downloadedMB: (event.loaded / (1024 * 1024)).toFixed(1),
          totalMB: (event.total / (1024 * 1024)).toFixed(1)
        });
      });
    }
    
    console.log(`[Mobile LLM] Download complete: ${destPath}`);
    
    return {
      success: true,
      path: destPath,
      model: model
    };
  } catch (error) {
    console.error('[Mobile LLM] Download failed:', error);
    throw error;
  }
}

/**
 * Delete a downloaded model
 */
export async function deleteMobileModel(filename) {
  if (!isMobile()) {
    return false;
  }
  
  try {
    const fsModule = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const { Filesystem, Directory } = fsModule;
    
    await Filesystem.deleteFile({
      path: `models/${filename}`,
      directory: Directory.Data
    });
    
    console.log(`[Mobile LLM] Deleted model: ${filename}`);
    return true;
  } catch (error) {
    console.error('[Mobile LLM] Failed to delete model:', error);
    return false;
  }
}

/**
 * Load a model for inference on mobile
 */
export async function loadMobileModel(modelPath) {
  if (!isMobile()) {
    throw new Error('Mobile model loading only available on mobile');
  }
  
  if (!llamaPlugin) {
    await initializeMobileLLM();
  }
  
  if (!llamaPlugin) {
    throw new Error('LLM plugin not available');
  }
  
  try {
    const fsModule = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const { Filesystem, Directory } = fsModule;
    
    // Get full path to model file
    const fileInfo = await Filesystem.getUri({
      path: modelPath,
      directory: Directory.Data
    });
    
    console.log(`[Mobile LLM] Loading model: ${fileInfo.uri}`);
    const startTime = Date.now();
    
    // Load the model via native plugin
    await llamaPlugin.loadModel({
      modelPath: fileInfo.uri,
      contextSize: 2048, // Token context window
      threads: 4, // Use 4 threads on mobile
      gpuLayers: 0 // CPU only for compatibility (GPU can be enabled per-device)
    });
    
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Mobile LLM] Model loaded in ${loadTime}s`);
    
    currentModel = modelPath;
    
    return {
      success: true,
      loadTime: parseFloat(loadTime)
    };
  } catch (error) {
    console.error('[Mobile LLM] Failed to load model:', error);
    throw error;
  }
}

/**
 * Unload current model to free memory
 */
export async function unloadMobileModel() {
  if (!isMobile() || !llamaPlugin || !currentModel) {
    return;
  }
  
  try {
    await llamaPlugin.unloadModel();
    currentModel = null;
    console.log('[Mobile LLM] Model unloaded');
  } catch (error) {
    console.error('[Mobile LLM] Failed to unload model:', error);
  }
}

/**
 * Generate text using loaded mobile model
 */
export async function generateMobile(prompt, options = {}) {
  if (!isMobile()) {
    throw new Error('Mobile generation only available on mobile');
  }
  
  if (!llamaPlugin || !currentModel) {
    throw new Error('No model loaded. Please load a model first.');
  }
  
  try {
    console.log('[Mobile LLM] Generating response...');
    const startTime = Date.now();
    
    const result = await llamaPlugin.generate({
      prompt: prompt,
      maxTokens: options.maxTokens || 256,
      temperature: options.temperature || 0.7,
      topP: options.topP || 0.9,
      stopSequences: options.stopSequences || ['\n\n', 'User:', 'user:']
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Mobile LLM] Generated in ${elapsed}s`);
    
    return {
      text: result.text,
      elapsed: parseFloat(elapsed),
      tokensGenerated: result.tokensGenerated || null
    };
  } catch (error) {
    console.error('[Mobile LLM] Generation failed:', error);
    throw error;
  }
}

/**
 * Check if a model is currently loaded
 */
export function isMobileModelLoaded() {
  return currentModel !== null;
}

/**
 * Get currently loaded model path
 */
export function getCurrentMobileModel() {
  return currentModel;
}

/**
 * Check available storage on mobile device
 */
export async function checkMobileStorage() {
  if (!isMobile()) {
    return null;
  }
  
  try {
    const fsModule = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const { Filesystem } = fsModule;
    
    // This may not be available on all platforms
    if (Filesystem.checkPermissions) {
      const info = await Filesystem.stat?.({ path: '' });
      return {
        freeBytes: info?.freeSpace || null,
        totalBytes: info?.totalSpace || null
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get recommended model for current device
 */
export async function getRecommendedMobileModel() {
  const deviceInfo = await getMobileDeviceInfo();
  
  // Default to PleIAs 350M for all devices
  let recommended = MOBILE_MODELS.find(m => m.id === 'pleias-350m');
  
  if (deviceInfo?.totalMemoryMB) {
    const totalGB = deviceInfo.totalMemoryMB / 1024;
    
    if (totalGB >= 6) {
      // High-end device can run 3B models
      recommended = MOBILE_MODELS.find(m => m.id === 'llama-3.2-3b');
    } else if (totalGB >= 4) {
      // Mid-range can run 1B models well
      recommended = MOBILE_MODELS.find(m => m.id === 'llama-3.2-1b');
    }
  }
  
  return recommended;
}

/**
 * Get mobile-compatible models with device-specific recommendations
 */
export async function getMobileCompatibleModels() {
  const deviceInfo = await getMobileDeviceInfo();
  const totalGB = deviceInfo?.totalMemoryMB ? deviceInfo.totalMemoryMB / 1024 : 4;
  
  return MOBILE_MODELS.map(model => {
    const requiredGB = parseFloat(model.ramRequired);
    const canRun = totalGB >= requiredGB;
    
    return {
      ...model,
      canRun,
      warning: !canRun 
        ? `Requires ${model.ramRequired} RAM (your device has ~${totalGB.toFixed(1)}GB)` 
        : null,
      isRecommended: model.id === 'pleias-350m' || (canRun && !model.highEndOnly)
    };
  });
}

// Utility functions
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
