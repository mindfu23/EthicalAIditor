/**
 * Electron Main Process for EthicalAIditor
 * 
 * Mac Desktop App with local LLM inference via llama.cpp
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;
let llamaModel = null;

// Model storage directory
const MODELS_DIR = path.join(app.getPath('userData'), 'models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // Mac-native title bar
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Required for llama.cpp
    },
    backgroundColor: '#0f172a', // Match app dark theme
    show: false // Show when ready to prevent flash
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================
// IPC Handlers for Local LLM Inference
// ============================================

/**
 * Get list of available models
 */
ipcMain.handle('llm:getModels', async () => {
  try {
    const files = fs.readdirSync(MODELS_DIR);
    const models = files
      .filter(f => f.endsWith('.gguf'))
      .map(f => {
        const stats = fs.statSync(path.join(MODELS_DIR, f));
        return {
          name: f.replace('.gguf', ''),
          filename: f,
          path: path.join(MODELS_DIR, f),
          size: stats.size,
          sizeGB: (stats.size / (1024 * 1024 * 1024)).toFixed(2)
        };
      });
    return { success: true, models, modelsDir: MODELS_DIR };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Load a model for inference
 */
ipcMain.handle('llm:loadModel', async (event, modelPath) => {
  try {
    // Dynamic import for node-llama-cpp (ESM module)
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
    
    console.log(`[Electron] Loading model: ${modelPath}`);
    const startTime = Date.now();
    
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext();
    
    llamaModel = {
      llama,
      model,
      context,
      session: new LlamaChatSession({ contextSequence: context.getSequence() }),
      path: modelPath
    };
    
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Electron] Model loaded in ${loadTime}s`);
    
    return { success: true, loadTime };
  } catch (error) {
    console.error('[Electron] Model load error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Generate text using loaded model
 */
ipcMain.handle('llm:generate', async (event, { prompt, maxTokens = 256, temperature = 0.7 }) => {
  if (!llamaModel) {
    return { success: false, error: 'No model loaded. Please load a model first.' };
  }
  
  try {
    console.log(`[Electron] Generating (max ${maxTokens} tokens)...`);
    const startTime = Date.now();
    
    const response = await llamaModel.session.prompt(prompt, {
      maxTokens,
      temperature
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Electron] Generated in ${elapsed}s`);
    
    return { success: true, text: response, elapsed };
  } catch (error) {
    console.error('[Electron] Generation error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Unload current model to free memory
 */
ipcMain.handle('llm:unloadModel', async () => {
  if (llamaModel) {
    try {
      await llamaModel.model.dispose();
      llamaModel = null;
      console.log('[Electron] Model unloaded');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: true };
});

/**
 * Get system info for model recommendations
 */
ipcMain.handle('system:getInfo', async () => {
  const os = require('os');
  return {
    platform: process.platform,
    arch: process.arch,
    totalMemoryGB: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1),
    freeMemoryGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1),
    cpus: os.cpus().length,
    isAppleSilicon: process.platform === 'darwin' && process.arch === 'arm64'
  };
});

/**
 * Open models directory in Finder
 */
ipcMain.handle('system:openModelsDir', async () => {
  shell.openPath(MODELS_DIR);
  return { success: true, path: MODELS_DIR };
});

/**
 * Download a model from URL
 */
ipcMain.handle('llm:downloadModel', async (event, { url, filename }) => {
  const https = require('https');
  const http = require('http');
  
  const destPath = path.join(MODELS_DIR, filename);
  
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = totalSize ? (downloadedSize / totalSize * 100).toFixed(1) : 0;
        mainWindow?.webContents.send('llm:downloadProgress', { 
          filename, 
          progress, 
          downloadedMB: (downloadedSize / (1024 * 1024)).toFixed(1),
          totalMB: totalSize ? (totalSize / (1024 * 1024)).toFixed(1) : 'unknown'
        });
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve({ success: true, path: destPath });
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      resolve({ success: false, error: err.message });
    });
  });
});
