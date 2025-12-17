import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

const isDev = process.env.NODE_ENV !== 'production';

// Validate required environment variables in production
if (!isDev) {
  const required = ['FRONTEND_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const fastify = Fastify({
  logger: {
    level: isDev ? 'debug' : 'info',
  },
});

// Register plugins
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

await fastify.register(websocket);

// Health check
fastify.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    fastify.log.info(`API server listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
