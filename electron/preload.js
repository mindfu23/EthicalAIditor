/**
 * Electron Preload Script for EthicalAIditor
 * 
 * Exposes safe IPC methods to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform detection
  isElectron: true,
  platform: process.platform,
  
  // Model management
  getModels: () => ipcRenderer.invoke('llm:getModels'),
  loadModel: (modelPath) => ipcRenderer.invoke('llm:loadModel', modelPath),
  unloadModel: () => ipcRenderer.invoke('llm:unloadModel'),
  downloadModel: (url, filename) => ipcRenderer.invoke('llm:downloadModel', { url, filename }),
  
  // Text generation
  generate: (options) => ipcRenderer.invoke('llm:generate', options),
  
  // System info
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),
  openModelsDir: () => ipcRenderer.invoke('system:openModelsDir'),
  
  // Download progress listener
  onDownloadProgress: (callback) => {
    ipcRenderer.on('llm:downloadProgress', (event, data) => callback(data));
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('llm:downloadProgress');
  }
});
