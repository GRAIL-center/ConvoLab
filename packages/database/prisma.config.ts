import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Use process.env directly to allow fallback for generate command (no DB needed)
const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/placeholder';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    path: './prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
