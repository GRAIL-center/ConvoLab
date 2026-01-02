import { prisma } from '@workspace/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { ConversationManager } from './conversation.js';
import { parseClientMessage, send } from './protocol.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Register WebSocket routes for conversation streaming.
 */
export async function registerWebSocketHandler(fastify: FastifyInstance): Promise<void> {
  // WebSocket route for conversations
  fastify.get(
    '/ws/conversation/:sessionId',
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest<{ Params: { sessionId: string } }>) => {
      const sessionId = parseInt(request.params.sessionId, 10);

      if (Number.isNaN(sessionId)) {
        send(socket, {
          type: 'error',
          code: 'SESSION_NOT_FOUND',
          message: 'Invalid session ID',
          recoverable: false,
        });
        socket.close(1008, 'Invalid session ID');
        return;
      }

      // Get user from session (if authenticated)
      const userId = (request.session as { userId?: string } | undefined)?.userId;

      // Load session with scenario and messages
      const session = await prisma.conversationSession.findUnique({
        where: { id: sessionId },
        include: {
          scenario: true,
          invitation: true,
          messages: {
            orderBy: { id: 'asc' },
          },
        },
      });

      if (!session) {
        send(socket, {
          type: 'error',
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
          recoverable: false,
        });
        socket.close(1008, 'Session not found');
        return;
      }

      // Auth check: session must belong to user or be accessible via invitation
      if (session.userId && session.userId !== userId) {
        send(socket, {
          type: 'error',
          code: 'AUTH_FAILED',
          message: 'Not authorized to access this session',
          recoverable: false,
        });
        socket.close(1008, 'Unauthorized');
        return;
      }

      // Create conversation manager
      const manager = new ConversationManager(socket, prisma, session);

      // Initialize (send connected + history)
      await manager.initialize();

      // Set up idle timeout
      let idleTimer = setTimeout(() => {
        socket.close(1000, 'Idle timeout');
      }, IDLE_TIMEOUT_MS);

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          socket.close(1000, 'Idle timeout');
        }, IDLE_TIMEOUT_MS);
      };

      // Handle incoming messages
      socket.on('message', async (data: Buffer) => {
        resetIdleTimer();

        const message = parseClientMessage(data.toString());
        if (!message) {
          send(socket, {
            type: 'error',
            code: 'INTERNAL_ERROR',
            message: 'Invalid message format',
            recoverable: true,
          });
          return;
        }

        switch (message.type) {
          case 'message':
            if (typeof message.content === 'string' && message.content.trim()) {
              await manager.handleUserMessage(message.content.trim());
            }
            break;

          case 'ping':
            // Just reset idle timer, already done above
            break;

          case 'resume':
            await manager.handleResume(message.afterMessageId);
            break;

          default:
            send(socket, {
              type: 'error',
              code: 'INTERNAL_ERROR',
              message: 'Unknown message type',
              recoverable: true,
            });
        }
      });

      socket.on('close', () => {
        clearTimeout(idleTimer);
        fastify.log.info({ sessionId }, 'WebSocket closed');
      });

      socket.on('error', (error) => {
        fastify.log.error({ sessionId, error }, 'WebSocket error');
        clearTimeout(idleTimer);
      });

      fastify.log.info({ sessionId, userId }, 'WebSocket connected');
    }
  );
}
