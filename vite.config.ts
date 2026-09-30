import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: '/lighting-simultaor/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } },
    },
  },
});
