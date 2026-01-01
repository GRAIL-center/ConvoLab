import { router } from './procedures.js';
import { authRouter } from './routers/auth.js';
import { scenarioRouter } from './routers/scenario.js';

export const appRouter = router({
  auth: authRouter,
  scenario: scenarioRouter,
});

export type AppRouter = typeof appRouter;
