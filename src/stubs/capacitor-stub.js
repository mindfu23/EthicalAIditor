/**
 * Capacitor Stub for Web Development
 * 
 * This file stubs out Capacitor native plugins for web builds.
 * On native mobile builds (iOS/Android), the real Capacitor plugins are used.
 */

// Stub exports - these won't do anything on web
export const Device = {
  getInfo: async () => ({ platform: 'web', model: 'browser', osVersion: 'unknown' }),
  getMemInfo: async () => null,
};

export const Filesystem = {
  readdir: async () => ({ files: [] }),
  writeFile: async () => ({}),
  readFile: async () => ({ data: '' }),
  deleteFile: async () => ({}),
  mkdir: async () => ({}),
  getUri: async () => ({ uri: '' }),
  stat: async () => null,
  checkPermissions: null,
};

export const Directory = {
  Data: 'DATA',
  Documents: 'DOCUMENTS',
  Cache: 'CACHE',
};

export const Http = {
  request: async () => ({ data: null }),
  downloadFile: async () => ({ path: '' }),
};

export const LlamaCpp = {
  loadModel: async () => ({}),
  unloadModel: async () => ({}),
  generate: async () => ({ text: '' }),
  isModelLoaded: async () => false,
};

// Default export for modules that use default import
export default {
  Device,
  Filesystem,
  Directory,
  Http,
  LlamaCpp,
};
