import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Explicitly re-export everything from Prisma Client
export * from '@prisma/client';

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
 */
export function createPrismaClient(options: CreatePrismaClientOptions = {}) {
    const connectionString = options.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    // Use a standard PG adapter for Prisma 7
    const adapter = new PrismaPg({ connectionString });

    return new PrismaClient({
        adapter,
        log: options.log ?? (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']),
    });
}

/**
 * Singleton PrismaClient instance for application use.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Re-export seed utilities (Ensure the extension is .ts if using TypeScript)
export {
    isDatabaseEmpty,
    seedDatabase,
    seedIfEmpty,
    seedReferenceData,
    seedTestData,
} from './seed/seedDatabase.js';

// Re-export application-level type definitions
export * from './types.js';