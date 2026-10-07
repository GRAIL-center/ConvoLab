import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntityId, Message, ScenarioInfo } from './useConversationSocket';
import { lastStreamingIndex, removeAt, replaceAt } from './streamingMessages';

// Reuse types from useConversationSocket
export type { Message, ScenarioInfo };

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

type ServerMessage =
  | { type: 'connected'; sessionId: string; scenario: ScenarioInfo }
  | { type: 'history'; messages: Message[] }
  | { type: 'partner:delta'; content: string }
  | { type: 'partner:done'; messageId: EntityId; usage: TokenUsage }
  | { type: 'coach:delta'; content: string }
  | { type: 'coach:retry' }
  | { type: 'coach:done'; messageId: EntityId; usage: TokenUsage }
  | { type: 'error'; code: string; message: string; recoverable: boolean };

type ClientMessage = { type: 'ping' };

export type ObserverStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ObserverError {
  code: string;
  message: string;
  recoverable: boolean;
}

interface UseObserverSocketResult {
  status: ObserverStatus;
  scenario: ScenarioInfo | null;
  messages: Message[];
  isStreaming: boolean;
  streamingRole: 'partner' | 'coach' | null;
  error: ObserverError | null;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Read-only WebSocket hook for observing a conversation session.
 * Similar to useConversationSocket but without message sending capability.
 */
export function useObserverSocket(
  sessionId: string | number | null | undefined
): UseObserverSocketResult {
  const [status, setStatus] = useState<ObserverStatus>('connecting');
  const [scenario, setScenario] = useState<ScenarioInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingRole, setStreamingRole] = useState<'partner' | 'coach' | null>(null);
  const [error, setError] = useState<ObserverError | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // One per speaker: the coach now streams while the partner is still replying.
  const partnerContentRef = useRef<string>('');
  const coachContentRef = useRef<string>('');
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (sessionId === null || sessionId === undefined || sessionId === '') return;

    function connect() {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/observe/${encodeURIComponent(String(sessionId))}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          send({ type: 'ping' });
        }, PING_INTERVAL_MS);
      };

      ws.onclose = (event) => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (event.code !== 1000) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
            reconnectAttemptsRef.current++;
            setStatus('connecting');
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          } else {
            setStatus('error');
            setError({
              code: 'CONNECTION_LOST',
              message: 'Connection lost. Please refresh the page.',
              recoverable: false,
            });
          }
        } else {
          setStatus('disconnected');
        }
      };

      ws.onerror = () => {
        // Error handling is done in onclose
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          setError({
            code: 'INVALID_MESSAGE',
            message: 'Received an invalid message from the server.',
            recoverable: true,
          });
          return;
        }

        switch (msg.type) {
          case 'connected':
            setScenario(msg.scenario);
            break;

          case 'history':
            // For observers, history messages are appended (used for both initial load and user message broadcasts)
            setMessages((prev) => {
              // Merge new messages, avoiding duplicates
              const existingIds = new Set(prev.map((m) => String(m.id)));
              const newMessages = msg.messages.filter((m) => !existingIds.has(String(m.id)));
              return [...prev, ...newMessages];
            });
            break;

          case 'coach:retry':
            coachContentRef.current = '';
            setMessages((prev) => {
              const i = lastStreamingIndex(prev, 'coach');
              if (i !== -1) {
                return removeAt(prev, i);
              }
              return prev;
            });
            break;

          case 'partner:delta':
            setIsStreaming(true);
            setStreamingRole('partner');
            partnerContentRef.current += msg.content;
            setMessages((prev) => {
              const i = lastStreamingIndex(prev, 'partner');
              if (i !== -1) {
                const last = prev[i];
                return replaceAt(prev, i, { ...last, content: partnerContentRef.current });
              }
              return [
                ...prev,
                {
                  id: -1,
                  role: 'partner',
                  content: partnerContentRef.current,
                  timestamp: new Date().toISOString(),
                  isStreaming: true,
                },
              ];
            });
            break;

          case 'partner:done':
            setMessages((prev) => {
              const i = lastStreamingIndex(prev, 'partner');
              if (i !== -1) {
                const last = prev[i];
                return replaceAt(prev, i, { ...last, id: msg.messageId, isStreaming: false });
              }
              return prev;
            });
            partnerContentRef.current = '';
            setIsStreaming(false);
            setStreamingRole(null);
            break;

          case 'coach:delta':
            setIsStreaming(true);
            setStreamingRole('coach');
            coachContentRef.current += msg.content;
            setMessages((prev) => {
              const i = lastStreamingIndex(prev, 'coach');
              if (i !== -1) {
                const last = prev[i];
                return replaceAt(prev, i, { ...last, content: coachContentRef.current });
              }
              return [
                ...prev,
                {
                  id: -1,
                  role: 'coach',
                  content: coachContentRef.current,
                  timestamp: new Date().toISOString(),
                  isStreaming: true,
                },
              ];
            });
            break;

          case 'coach:done':
            setMessages((prev) => {
              const i = lastStreamingIndex(prev, 'coach');
              if (i !== -1) {
                const last = prev[i];
                return replaceAt(prev, i, { ...last, id: msg.messageId, isStreaming: false });
              }
              return prev;
            });
            coachContentRef.current = '';
            setIsStreaming(false);
            setStreamingRole(null);
            break;

          case 'error':
            setError({ code: msg.code, message: msg.message, recoverable: msg.recoverable });
            if (!msg.recoverable) {
              setStatus('error');
            }
            setIsStreaming(false);
            setStreamingRole(null);
            break;
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [sessionId, send]);

  return {
    status,
    scenario,
    messages,
    isStreaming,
    streamingRole,
    error,
  };
}
