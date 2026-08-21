import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { db as prisma } from '../db/firestoreHelpers.js';
import { getFirestore } from '../lib/firestore.js';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const userId = req.session.get('userId') ?? null;
  const firestore = getFirestore();
  return { req, res, userId, prisma, firestore };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
