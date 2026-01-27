import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@workspace/api/src/trpc/router.ts';

// By naming these clearly, it's easier to debug type inference
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export type { AppRouter };
