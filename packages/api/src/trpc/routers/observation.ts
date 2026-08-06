import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, staffProcedure } from '../procedures.js';

export const observationRouter = router({
  /**
   * Create an observation note for an invitation or session.
   */
  create: staffProcedure
    .input(
      z.object({
        invitationId: z.string(),
        sessionId: z.union([z.string(), z.number()]).optional(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sessionId = input.sessionId !== undefined ? String(input.sessionId) : undefined;

      // Verify invitation exists
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      // If sessionId provided, verify it belongs to this invitation
      if (sessionId) {
        const session = await ctx.prisma.conversationSession.findUnique({
          where: { id: sessionId } as any,
        });

        if (!session || session.invitationId !== input.invitationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Session does not belong to this invitation',
          });
        }
      }

      return ctx.prisma.observationNote.create({
        data: {
          invitationId: input.invitationId,
          sessionId,
          researcherId: ctx.user.id,
          content: input.content,
        } as any,
      });
    }),

  /**
   * List observation notes for an invitation, optionally filtered by session.
   */
  list: staffProcedure
    .input(
      z.object({
        invitationId: z.string(),
        sessionId: z.union([z.string(), z.number()]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const sessionId = input.sessionId !== undefined ? String(input.sessionId) : undefined;

      const notes = await ctx.prisma.observationNote.findMany({
        where: {
          invitationId: input.invitationId,
          ...(sessionId !== undefined ? { sessionId } : {}),
        } as any,
        orderBy: { timestamp: 'desc' },
      });

      // Firestore has no joins (the shim now throws on `include` rather than
      // silently dropping it — see docs/plans/15-firestore-shim-gaps.md), so
      // batch-fetch each distinct researcher once instead of one query per note.
      const researcherIds = [...new Set(notes.map((n: any) => n.researcherId))];
      const researchers = await Promise.all(
        researcherIds.map((id) =>
          ctx.prisma.user.findUnique({ where: { id }, select: { id: true, name: true } })
        )
      );
      const researcherById = new Map(researchers.filter(Boolean).map((r: any) => [r.id, r]));

      return notes.map((note: any) => ({
        ...note,
        researcher: researcherById.get(note.researcherId) ?? null,
      }));
    }),

  /**
   * Delete an observation note (only the researcher who created it).
   */
  delete: staffProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.observationNote.findUnique({
        where: { id: input.noteId },
      });

      if (!note) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
      }

      // Only the researcher who created the note can delete it
      if (note.researcherId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "Cannot delete another researcher's note",
        });
      }

      return ctx.prisma.observationNote.delete({
        where: { id: input.noteId },
      });
    }),
});
