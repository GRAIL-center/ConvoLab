import type { PrismaClient } from '@workspace/database';
export interface SeedOptions {
    log?: (message: string) => void;
}
/**
 * Seeds reference data needed in ALL environments (including production).
 * Includes quota presets and scenarios.
 * Safe to call multiple times - uses upserts.
 */
export declare function seedReferenceData(prisma: PrismaClient, options?: SeedOptions): Promise<void>;
/**
 * Seeds test/development data (NOT for production).
 * Includes test admin user and test invitation.
 * Safe to call multiple times - uses upserts.
 */
export declare function seedTestData(prisma: PrismaClient, options?: SeedOptions): Promise<void>;
/**
 * Seeds the database with all data (reference + test).
 * For development use only.
 * Safe to call multiple times - uses upserts.
 */
export declare function seedDatabase(prisma: PrismaClient, options?: SeedOptions): Promise<void>;
/**
 * Checks if the database needs seeding (no scenarios or quota presets).
 */
export declare function isDatabaseEmpty(prisma: PrismaClient): Promise<boolean>;
/**
 * Seeds the database only if it's empty. Returns true if seeding was performed.
 */
export declare function seedIfEmpty(prisma: PrismaClient, options?: SeedOptions): Promise<boolean>;
//# sourceMappingURL=seedDatabase.d.ts.map