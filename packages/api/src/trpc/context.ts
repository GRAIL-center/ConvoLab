import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { prisma } from '@workspace/database';

// Import session plugin to get session type augmentation
import '../plugins/session.js';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const userId = req.session.get('userId') ?? null;
  return { req, res, userId, prisma };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
