import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { resolveUserId } from '../auth/resolveUser.js';
import { db as prisma } from '../db/firestoreHelpers.js';
import { getFirestore } from '../lib/firestore.js';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  // Bearer token (native app) first, cookie session (website) second.
  const userId = resolveUserId(req);
  const firestore = getFirestore();
  return { req, res, userId, prisma, firestore };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
