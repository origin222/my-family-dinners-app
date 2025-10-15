import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This build setting forces compatibility with Vercel's environment
  build: {
    cssTarget: 'es2020', 
    outDir: 'dist',
    emptyOutDir: true
  }
});