import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ethicalaiditor.app',
  appName: 'EthicalAIditor',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // HTTP plugin for model downloads
    CapacitorHttp: {
      enabled: true
    },
    // Filesystem for model storage
    Filesystem: {
      // Use app's private directory for models
    },
    // Device info for RAM detection
    Device: {}
  },
  // iOS-specific settings
  ios: {
    // Allow background model downloads
    backgroundColor: '#0f172a',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    // Increase memory limit for LLM inference
    limitsNavigationsToAppBoundDomains: true
  },
  // Android-specific settings  
  android: {
    backgroundColor: '#0f172a',
    allowMixedContent: false,
    // Use hardware acceleration for better inference
    useLegacyBridge: false
  }
};

export default config;
