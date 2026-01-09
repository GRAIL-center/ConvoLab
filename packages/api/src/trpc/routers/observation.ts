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
        sessionId: z.number().optional(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify invitation exists
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      // If sessionId provided, verify it belongs to this invitation
      if (input.sessionId) {
        const session = await ctx.prisma.conversationSession.findUnique({
          where: { id: input.sessionId },
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
          sessionId: input.sessionId,
          researcherId: ctx.user.id,
          content: input.content,
        },
      });
    }),

  /**
   * List observation notes for an invitation, optionally filtered by session.
   */
  list: staffProcedure
    .input(
      z.object({
        invitationId: z.string(),
        sessionId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.observationNote.findMany({
        where: {
          invitationId: input.invitationId,
          ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        },
        include: {
          researcher: {
            select: { id: true, name: true },
          },
        },
        orderBy: { timestamp: 'desc' },
      });
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
