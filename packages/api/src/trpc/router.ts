import { router } from './procedures.js';
import { authRouter } from './routers/auth.js';
import { feedbackRouter } from './routers/feedback.js';
import { invitationRouter } from './routers/invitation.js';
import { observationRouter } from './routers/observation.js';
import { scenarioRouter } from './routers/scenario.js';
import { sessionRouter } from './routers/session.js';
import { telemetryRouter } from './routers/telemetry.js';
import { userRouter } from './routers/user.js';


export const appRouter = router({
  auth: authRouter,
  feedback: feedbackRouter,
  invitation: invitationRouter,
  observation: observationRouter,
  scenario: scenarioRouter,
  session: sessionRouter,
  telemetry: telemetryRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

