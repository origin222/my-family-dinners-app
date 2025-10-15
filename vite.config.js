import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This build target ensures modern JavaScript features like 'import.meta.env' are supported,
  // which will resolve the build warnings.
  build: {
    target: 'esnext'
  }
})