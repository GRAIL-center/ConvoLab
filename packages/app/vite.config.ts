import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// API host: 'localhost:3000' for local dev, 'api:3000' when running in Docker
const apiHost = process.env.API_HOST ?? 'localhost:3000';

// Vite rejects requests whose Host header it does not recognise, which is every
// request arriving through a dev tunnel (cloudflared, ngrok) used to open the
// local app on a real phone. Opt in per run rather than weakening the default:
//   DEV_ALLOWED_HOSTS=foo-bar.trycloudflare.com pnpm -F @workspace/app dev
// Comma-separated; '.example.com' matches subdomains.
const devAllowedHosts = process.env.DEV_ALLOWED_HOSTS?.split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['react-google-recaptcha'] },
  server: {
    port: 5173,
    host: true,
    ...(devAllowedHosts?.length ? { allowedHosts: devAllowedHosts } : {}),
    proxy: {
      '/api': {
        target: `http://${apiHost}`,
        changeOrigin: true,
      },
      '/trpc': {
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
