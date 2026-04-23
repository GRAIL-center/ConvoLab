import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from the repo root for local development.
// No-op if the file doesn't exist (Docker sets env vars via compose environment:).
config({ path: resolve(process.cwd(), '../../.env') });
