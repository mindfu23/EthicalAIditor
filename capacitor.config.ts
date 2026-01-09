import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ethicalaiditor.app',
  appName: 'EthicalAIditor',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
