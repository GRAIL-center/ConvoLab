import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// API host: 'localhost:3000' for local dev, 'api:3000' when running in Docker
const apiHost = process.env.API_HOST ?? 'localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: `http://${apiHost}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${apiHost}`,
        ws: true,
      },
    },
  },
});
