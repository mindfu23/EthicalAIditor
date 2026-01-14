import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mobile/Capacitor dependencies that shouldn't be bundled for web
const mobileExternals = [
  '@capacitor/core',
  '@capacitor/device',
  '@capacitor/filesystem',
  '@capacitor-community/http',
  'capacitor-llama-cpp',
];

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Externalize Capacitor/mobile dependencies for web builds
      external: mobileExternals,
    },
  },
  // Suppress warnings for optional mobile dependencies during dev
  optimizeDeps: {
    exclude: mobileExternals,
  },
  resolve: {
    alias: {
      // Stub out Capacitor modules for web development
      // They'll be available natively on mobile builds
      '@capacitor/core': '/src/stubs/capacitor-stub.js',
      '@capacitor/device': '/src/stubs/capacitor-stub.js',
      '@capacitor/filesystem': '/src/stubs/capacitor-stub.js',
      '@capacitor-community/http': '/src/stubs/capacitor-stub.js',
      'capacitor-llama-cpp': '/src/stubs/capacitor-stub.js',
    },
  },
})
