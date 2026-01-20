import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { isDatabaseEmpty, prisma, seedReferenceData, seedTestData } from '@workspace/database';
import Fastify from 'fastify';

import {
  getAIProviderSummary,
  logStartupDiagnostics,
  runStartupChecks,
} from './lib/startup-checks.js';
import oauthPlugin from './plugins/oauth.js';
import sessionPlugin from './plugins/session.js';
import authRoutes from './routes/auth.js';
import { createContext } from './trpc/context.js';
import { type AppRouter, appRouter } from './trpc/router.js';
import { registerWebSocketHandler } from './ws/handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

const fastify = Fastify({
  logger: {
    level: isDev ? 'debug' : 'info',
  },
});

// Run startup diagnostics (will exit if critical config missing)
logStartupDiagnostics(fastify.log);
fastify.log.info(`AI providers available: ${getAIProviderSummary()}`);

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

// Setup status endpoint (dev-only, doesn't require auth)
// This is a plain REST endpoint so it works even when tRPC isn't registered
if (isDev) {
  fastify.get('/api/setup/status', async () => {
    const checks = runStartupChecks();

    // Load quickstart content
    let quickstartContent: string | null = null;
    const possiblePaths = [
      '/app/QUICKSTART.md', // Docker container path (most common)
      path.resolve(__dirname, '../../QUICKSTART.md'),
      path.resolve(__dirname, '../../../QUICKSTART.md'),
      path.resolve(__dirname, '../../../../QUICKSTART.md'),
    ];
    for (const p of possiblePaths) {
      try {
        const fs = await import('node:fs');
        if (fs.existsSync(p)) {
          quickstartContent = fs.readFileSync(p, 'utf-8');
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    const googleOAuth = {
      clientId: !!process.env.GOOGLE_CLIENT_ID,
      clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: !!process.env.GOOGLE_CALLBACK_URL,
    };

    const aiKeys = {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      googleAi: !!process.env.GOOGLE_AI_API_KEY,
    };

    const hasAnyAiKey = Object.values(aiKeys).some(Boolean);
    const hasGoogleOAuth = googleOAuth.clientId && googleOAuth.clientSecret;

    return {
      complete: checks.canStart && hasGoogleOAuth && hasAnyAiKey,
      checks: {
        googleOAuth,
        aiKeys,
        sessionKey: !!process.env.SESSION_KEY,
        databaseUrl: !!process.env.DATABASE_URL,
      },
      missing: {
        googleOAuth: !hasGoogleOAuth,
        aiKey: !hasAnyAiKey,
        sessionKey: !process.env.SESSION_KEY,
      },
      errors: checks.errors,
      warnings: checks.warnings,
      quickstartContent,
    };
  });
}

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
    // Auto-seed reference data (quota presets, scenarios) in all environments
    try {
      if (await isDatabaseEmpty(prisma)) {
        const logOpts = { log: (msg: string) => fastify.log.info(msg) };
        await seedReferenceData(prisma, logOpts);
        // Only seed test data (test admin, test invitation) in development
        if (isDev) {
          await seedTestData(prisma, logOpts);
        }
      }
    } catch (seedErr) {
      fastify.log.error({ err: seedErr }, 'Database seeding failed; continuing without seed data');
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
