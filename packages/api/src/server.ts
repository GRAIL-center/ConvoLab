import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { prisma, seedIfEmpty } from '@workspace/database';
import Fastify from 'fastify';

import oauthPlugin from './plugins/oauth.js';
import sessionPlugin from './plugins/session.js';
import authRoutes from './routes/auth.js';
import { createContext } from './trpc/context.js';
import { type AppRouter, appRouter } from './trpc/router.js';
import { registerWebSocketHandler } from './ws/handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

// Validate required environment variables in production
if (!isDev) {
  const required = ['FRONTEND_URL', 'SESSION_KEY'];
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

// WebSocket routes for real-time streaming
await registerWebSocketHandler(fastify);

// Session and OAuth (must be registered before routes that need auth)
if (process.env.SESSION_KEY) {
  await fastify.register(sessionPlugin);
  await fastify.register(oauthPlugin);
  await fastify.register(authRoutes);

  // tRPC (requires session for context)
  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        fastify.log.error({ path, error: error.message }, 'tRPC error');
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
} else if (isDev) {
  fastify.log.warn('SESSION_KEY not set - auth disabled for development');
}

// Health check
fastify.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Serve static files in production (SPA with fallback to index.html)
if (!isDev) {
  const publicDir = path.join(__dirname, 'public');
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // SPA fallback: serve index.html for non-API routes
  fastify.setNotFoundHandler(async (request, reply) => {
    const url = request.url;
    // Return JSON 404 for API routes, not index.html
    if (url.startsWith('/api') || url.startsWith('/trpc') || url.startsWith('/ws')) {
      reply.code(404);
      return { error: 'Not Found' };
    }
    return reply.sendFile('index.html');
  });
}

const start = async () => {
  try {
    // Auto-seed empty database in development
    if (isDev) {
      try {
        const seeded = await seedIfEmpty(prisma, {
          log: (msg) => fastify.log.info(msg),
        });
        if (seeded) {
          fastify.log.info('Auto-seeded empty database with initial data');
        }
      } catch (seedErr) {
        fastify.log.error(
          { err: seedErr },
          'Database seeding failed; continuing without seed data'
        );
      }
    }

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
