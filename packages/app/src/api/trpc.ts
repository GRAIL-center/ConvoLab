import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@workspace/api/src/trpc/router.js';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export type { AppRouter };
