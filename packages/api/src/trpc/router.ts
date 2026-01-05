import { router } from './procedures.js';
import { authRouter } from './routers/auth.js';
import { invitationRouter } from './routers/invitation.js';
import { scenarioRouter } from './routers/scenario.js';
import { sessionRouter } from './routers/session.js';
import { telemetryRouter } from './routers/telemetry.js';
import { userRouter } from './routers/user.js';

export const appRouter = router({
  auth: authRouter,
  invitation: invitationRouter,
  scenario: scenarioRouter,
  session: sessionRouter,
  telemetry: telemetryRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
