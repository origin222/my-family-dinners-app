import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Crucial fix: Ensures the compiler targets a modern JS version (es2020)
    // which resolves the "import.meta" warning and prevents Vercel build failures.
    target: 'es2020',
    cssTarget: 'es2020',
    // This is necessary because of the unusual static deployment structure
    outDir: 'dist',
    emptyOutDir: true,
  },
});