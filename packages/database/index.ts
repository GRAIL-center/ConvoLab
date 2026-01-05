import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Prevent multiple Prisma Client instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';

export interface CreatePrismaClientOptions {
  connectionString?: string;
  log?: PrismaLogLevel[];
}

/**
 * Creates a new PrismaClient instance with the Prisma 7 adapter pattern.
 * Use this for scripts (seed, migrations) that need their own instance.
 */
export function createPrismaClient(options: CreatePrismaClientOptions = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      options.log ??
      (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']),
  });
}

/**
 * Singleton PrismaClient instance for application use.
 * Uses global caching to prevent multiple instances in development with HMR.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types for use in other packages
export * from '@prisma/client';
// Re-export seed utilities
export {
  isDatabaseEmpty,
  seedDatabase,
  seedIfEmpty,
  seedReferenceData,
  seedTestData,
} from './seed/seedDatabase.js';
// Re-export application-level type definitions
export * from './types.js';
