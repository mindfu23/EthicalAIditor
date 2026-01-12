import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Externalize Capacitor/mobile dependencies for web builds
      external: [
        '@capacitor/core',
        '@capacitor/device',
        '@capacitor/filesystem',
        '@capacitor-community/http',
        'capacitor-llama-cpp',
      ],
    },
  },
  // Suppress warnings for optional mobile dependencies during dev
  optimizeDeps: {
    exclude: [
      '@capacitor/core',
      '@capacitor/device',
      '@capacitor/filesystem',
      '@capacitor-community/http',
      'capacitor-llama-cpp',
    ],
  },
})
