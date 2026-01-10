/**
 * Local LLM Service for EthicalAIditor Desktop (Mac)
 * 
 * Handles local model inference via Electron IPC when running as desktop app.
 * Falls back to cloud API when running in browser.
 */

// Check if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
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
 * Get system information (Electron only)
 */
export async function getSystemInfo() {
  if (!isElectron()) {
    return null;
  }
  return await window.electronAPI.getSystemInfo();
}

/**
 * Get list of downloaded models (Electron only)
 */
export async function getDownloadedModels() {
  if (!isElectron()) {
    return [];
  }
  const result = await window.electronAPI.getModels();
  return result.success ? result.models : [];
}

/**
 * Get models directory path
 */
export async function getModelsDirectory() {
  if (!isElectron()) {
    return null;
  }
  const result = await window.electronAPI.getModels();
  return result.modelsDir;
}

/**
 * Open models directory in Finder
 */
export async function openModelsDirectory() {
  if (!isElectron()) {
    return false;
  }
  await window.electronAPI.openModelsDir();
  return true;
}

/**
 * Download a model
 */
export async function downloadModel(modelId, onProgress) {
  if (!isElectron()) {
    throw new Error('Model download only available in desktop app');
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
 * Load a model for inference
 */
export async function loadModel(modelPath) {
  if (!isElectron()) {
    throw new Error('Local models only available in desktop app');
  }
  
  const result = await window.electronAPI.loadModel(modelPath);
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.loadTime;
}

/**
 * Unload current model
 */
export async function unloadModel() {
  if (!isElectron()) {
    return;
  }
  await window.electronAPI.unloadModel();
}

/**
 * Generate text using local model
 */
export async function generateLocal(prompt, options = {}) {
  if (!isElectron()) {
    throw new Error('Local generation only available in desktop app');
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
 * Get recommended models based on system RAM
 */
export async function getRecommendedModels() {
  const sysInfo = await getSystemInfo();
  if (!sysInfo) {
    return AVAILABLE_MODELS.filter(m => !m.proOnly);
  }
  
  const freeGB = parseFloat(sysInfo.freeMemoryGB);
  const totalGB = parseFloat(sysInfo.totalMemoryGB);
  
  return AVAILABLE_MODELS.map(model => {
    const requiredGB = parseFloat(model.ramRequired);
    const canRun = totalGB >= requiredGB;
    const recommended = freeGB >= requiredGB * 1.2; // 20% headroom
    
    return {
      ...model,
      canRun,
      recommended: model.recommended || recommended,
      warning: !canRun ? `Requires ${model.ramRequired} RAM (you have ${totalGB}GB)` : null
    };
  });
}
