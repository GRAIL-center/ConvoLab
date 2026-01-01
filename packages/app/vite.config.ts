import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://api:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://api:3000',
        ws: true,
      },
    },
  },
});
