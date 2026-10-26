import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getMessagesForSession, getSession, updateSession } from '../../data/index.js';
import type { VoiceSessionGrant } from '../../voice/contract.js';
import {
  createVoiceGrant,
  type HistoryTurn,
  type VoiceSessionSource,
} from '../../voice/startSession.js';
import { voiceApiKey } from '../../voice/voiceConfig.js';
import { protectedProcedure, router } from '../procedures.js';

export const voiceRouter = router({
  /** Whether the server can offer voice at all. The client shows text-only when false. */
  available: protectedProcedure.query(() => ({ available: !!voiceApiKey() })),

  /**
   * Grant for one Gemini Live connection to this session's partner. Call again
   * to reconnect: each grant opens one Live session, and history is rebuilt
   * from our stored messages each time.
   */
  startSession: protectedProcedure
    .input(z.object({ sessionId: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }): Promise<VoiceSessionGrant> => {
      const session = await getSession(input.sessionId);
      // Same answer for missing and not-yours, so ids cannot be probed.
      if (!session || session.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }
      const record = session as unknown as VoiceSessionSource & {
        status?: string;
        endedAt?: unknown;
      };
      if (record.endedAt || record.status === 'COMPLETED') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Session has ended' });
      }
      if (!record.scenario && !(record.customPartnerPrompt && record.customCoachPrompt)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Session has no partner' });
      }
      if (!voiceApiKey()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Voice mode is not configured',
        });
      }

      const history = (await getMessagesForSession(input.sessionId)) as unknown as HistoryTurn[];
      let grant: Awaited<ReturnType<typeof createVoiceGrant>>;
      try {
        grant = await createVoiceGrant(record, history);
      } catch (error) {
        ctx.req.log.error({ sessionId: input.sessionId, err: error }, '[voice] token mint failed');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Voice is unavailable' });
      }

      // Server-side record of the condition this session's voice ran under.
      // storeVoiceExchange stamps it on each turn next to the client's echo.
      await updateSession(input.sessionId, {
        voiceSessionVersion: grant.voiceSessionVersion,
      } as never);

      const { voiceName, ...clientGrant } = grant;
      ctx.req.log.info(
        { sessionId: input.sessionId, voiceName, version: grant.voiceSessionVersion },
        '[voice] grant issued'
      );
      return clientGrant;
    }),
});
