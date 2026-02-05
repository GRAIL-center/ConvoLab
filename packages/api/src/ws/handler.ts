import { prisma } from '@workspace/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { ConversationManager } from './conversation.js';
import { ObserverManager, verifyObserverAccess } from './observer.js';
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

      // Auth check: must have valid session cookie and session must belong to that user
      if (!userId || session.userId !== userId) {
        send(socket, {
          type: 'error',
          code: 'AUTH_FAILED',
          message: 'Not authorized to access this session',
          recoverable: false,
        });
        socket.close(1008, 'Unauthorized');
        return;
      }

      // Session must have either a scenario OR custom prompts
      if (!session.scenario && !session.customPartnerPrompt) {
        send(socket, {
          type: 'error',
          code: 'NO_SCENARIO',
          message: 'Session has no scenario configured',
          recoverable: false,
        });
        socket.close(1008, 'No scenario');
        return;
      }

      // Create conversation manager
      const manager = new ConversationManager(
        socket,
        prisma,
        // biome-ignore lint/suspicious/noExplicitAny: legacy code
        { ...session, scenario: session.scenario, userId: userId as string } as any,
        fastify.log
      );

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
            message: "Invalid message format: expected JSON with 'type' field",
            recoverable: true,
          });
          return;
        }

        switch (message.type) {
          case 'message':
            if (typeof message.content === 'string' && message.content.trim()) {
              const content = message.content.trim();
              const MAX_MESSAGE_LENGTH = 10000;
              if (content.length > MAX_MESSAGE_LENGTH) {
                send(socket, {
                  type: 'error',
                  code: 'RATE_LIMITED',
                  message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
                  recoverable: true,
                });
                return;
              }
              await manager.handleUserMessage(content);
            }
            break;

          case 'ping':
            // Just reset idle timer, already done above
            break;

          case 'resume':
            await manager.handleResume(message.afterMessageId);
            break;

          case 'aside:start':
            if (typeof message.content === 'string' && message.content.trim() && message.threadId) {
              const content = message.content.trim();
              const MAX_ASIDE_LENGTH = 2000;
              if (content.length > MAX_ASIDE_LENGTH) {
                send(socket, {
                  type: 'aside:error',
                  threadId: message.threadId,
                  error: `Question too long (max ${MAX_ASIDE_LENGTH} characters)`,
                });
                return;
              }
              await manager.handleAsideStart(message.threadId, content);
            }
            break;

          case 'aside:cancel':
            if (message.threadId) {
              manager.handleAsideCancel(message.threadId);
            }
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

  // WebSocket route for observers (read-only, STAFF+ only)
  fastify.get(
    '/ws/observe/:sessionId',
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

      // Verify STAFF+ role
      const userId = (request.session as { userId?: string } | undefined)?.userId;
      const access = await verifyObserverAccess(prisma, userId);

      if (!access.allowed) {
        send(socket, {
          type: 'error',
          code: 'AUTH_FAILED',
          message: access.reason ?? 'Not authorized to observe sessions',
          recoverable: false,
        });
        socket.close(1008, 'Unauthorized');
        return;
      }

      // Create observer manager
      const observer = new ObserverManager(socket, prisma, sessionId, fastify.log);

      // Initialize (loads session, sends history, subscribes to broadcasts)
      await observer.initialize();

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

      // Handle incoming messages (only ping supported)
      socket.on('message', (data: Buffer) => {
        resetIdleTimer();

        const message = parseClientMessage(data.toString());
        if (message?.type === 'ping') {
          // Just reset idle timer, already done above
        }
        // Observers can't send other message types
      });

      socket.on('close', () => {
        clearTimeout(idleTimer);
        observer.cleanup();
        fastify.log.info({ sessionId, userId }, 'Observer WebSocket closed');
      });

      socket.on('error', (error) => {
        fastify.log.error({ sessionId, error }, 'Observer WebSocket error');
        clearTimeout(idleTimer);
        observer.cleanup();
      });

      fastify.log.info({ sessionId, userId }, 'Observer WebSocket connected');
    }
  );
}
