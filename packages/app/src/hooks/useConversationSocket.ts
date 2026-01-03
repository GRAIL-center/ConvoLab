import { useCallback, useEffect, useRef, useState } from 'react';

// Mirror types from API protocol (no shared package yet)
export interface ScenarioInfo {
  id: number;
  name: string;
  description: string;
  partnerPersona: string;
}

export interface Message {
  id: number;
  role: 'user' | 'partner' | 'coach';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

type ServerMessage =
  | { type: 'connected'; sessionId: number; scenario: ScenarioInfo }
  | { type: 'history'; messages: Message[] }
  | { type: 'partner:delta'; content: string }
  | { type: 'partner:done'; messageId: number; usage: TokenUsage }
  | { type: 'coach:delta'; content: string }
  | { type: 'coach:done'; messageId: number; usage: TokenUsage }
  | { type: 'error'; code: string; message: string; recoverable: boolean }
  | { type: 'quota:warning'; remaining: number; total: number }
  | { type: 'quota:exhausted' };

type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'ping' }
  | { type: 'resume'; afterMessageId?: number };

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ConversationError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface QuotaState {
  remaining: number;
  total: number;
  exhausted: boolean;
}

interface UseConversationSocketResult {
  status: ConnectionStatus;
  scenario: ScenarioInfo | null;
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;
  streamingRole: 'partner' | 'coach' | null;
  quota: QuotaState | null;
  error: ConversationError | null;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function useConversationSocket(sessionId: number): UseConversationSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [scenario, setScenario] = useState<ScenarioInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingRole, setStreamingRole] = useState<'partner' | 'coach' | null>(null);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMessageIdRef = useRef<number | null>(null);
  const streamingContentRef = useRef<string>('');
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isStreaming) return;

      // Optimistically add user message
      const userMessage: Message = {
        id: Date.now(), // Temporary ID, will be replaced
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      send({ type: 'message', content: content.trim() });
    },
    [send, isStreaming]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/conversation/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setError(null);
      reconnectAttemptsRef.current = 0;

      // If reconnecting, request messages since last known
      if (lastMessageIdRef.current !== null) {
        send({ type: 'resume', afterMessageId: lastMessageIdRef.current });
      }

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
        // Not a clean close, attempt reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
          reconnectAttemptsRef.current++;
          setStatus('connecting');
          setTimeout(connect, delay);
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
      const msg = JSON.parse(event.data) as ServerMessage;

      switch (msg.type) {
        case 'connected':
          setScenario(msg.scenario);
          break;

        case 'history':
          setMessages(msg.messages);
          if (msg.messages.length > 0) {
            lastMessageIdRef.current = msg.messages[msg.messages.length - 1].id;
          }
          break;

        case 'partner:delta':
          setIsStreaming(true);
          setStreamingRole('partner');
          streamingContentRef.current += msg.content;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'partner' && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: streamingContentRef.current }];
            }
            return [
              ...prev,
              {
                id: -1, // Temporary
                role: 'partner',
                content: streamingContentRef.current,
                timestamp: new Date().toISOString(),
                isStreaming: true,
              },
            ];
          });
          break;

        case 'partner:done':
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'partner' && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, id: msg.messageId, isStreaming: false }];
            }
            return prev;
          });
          lastMessageIdRef.current = msg.messageId;
          streamingContentRef.current = '';
          setStreamingRole(null);
          // Don't set isStreaming false yet - coach will follow
          break;

        case 'coach:delta':
          setIsStreaming(true);
          setStreamingRole('coach');
          streamingContentRef.current += msg.content;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'coach' && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: streamingContentRef.current }];
            }
            return [
              ...prev,
              {
                id: -1,
                role: 'coach',
                content: streamingContentRef.current,
                timestamp: new Date().toISOString(),
                isStreaming: true,
              },
            ];
          });
          break;

        case 'coach:done':
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'coach' && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, id: msg.messageId, isStreaming: false }];
            }
            return prev;
          });
          lastMessageIdRef.current = msg.messageId;
          streamingContentRef.current = '';
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

        case 'quota:warning':
          setQuota({ remaining: msg.remaining, total: msg.total, exhausted: false });
          break;

        case 'quota:exhausted':
          setQuota((prev) =>
            prev ? { ...prev, exhausted: true } : { remaining: 0, total: 0, exhausted: true }
          );
          break;
      }
    };
  }, [sessionId, send]);

  useEffect(() => {
    connect();

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    status,
    scenario,
    messages,
    sendMessage,
    isStreaming,
    streamingRole,
    quota,
    error,
  };
}
