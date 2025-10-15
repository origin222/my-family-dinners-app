import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // CRITICAL: Ensures the app is served from the root path of your domain
  base: '/', 
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})