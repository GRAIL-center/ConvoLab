import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { db as prisma } from '../db/firestoreHelpers';
import { Firestore } from '@google-cloud/firestore';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const userId = req.session.get('userId') ?? null;
  const firestore = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
  return { req, res, userId, prisma, firestore };
}
