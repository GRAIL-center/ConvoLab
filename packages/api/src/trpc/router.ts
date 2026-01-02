import { router } from './procedures.js';
import { authRouter } from './routers/auth.js';
import { invitationRouter } from './routers/invitation.js';
import { scenarioRouter } from './routers/scenario.js';
import { telemetryRouter } from './routers/telemetry.js';

export const appRouter = router({
  auth: authRouter,
  invitation: invitationRouter,
  scenario: scenarioRouter,
  telemetry: telemetryRouter,
});

export type AppRouter = typeof appRouter;
