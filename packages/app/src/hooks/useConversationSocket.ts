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
  messageType?: 'main' | 'aside';
  asideThreadId?: string;
}

export interface AsideMessage {
  id: number;
  role: 'user' | 'coach';
  content: string;
  timestamp: string;
  threadId: string;
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
  | { type: 'aside:delta'; threadId: string; content: string }
  | { type: 'aside:done'; threadId: string; messageId: number; usage: TokenUsage }
  | { type: 'aside:error'; threadId: string; error: string }
  | { type: 'error'; code: string; message: string; recoverable: boolean }
  | { type: 'quota:warning'; remaining: number; total: number }
  | { type: 'quota:exhausted' };

type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'ping' }
  | { type: 'resume'; afterMessageId?: number }
  | { type: 'aside:start'; content: string; threadId: string }
  | { type: 'aside:cancel'; threadId: string };

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

export interface AsideError {
  threadId: string;
  message: string;
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
  // Aside state
  asideMessages: AsideMessage[];
  isAsideStreaming: boolean;
  activeAsideThreadId: string | null;
  asideError: AsideError | null;
  // Aside actions
  startAside: (question: string) => string;
  cancelAside: () => void;
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

  // Aside state
  const [asideMessages, setAsideMessages] = useState<AsideMessage[]>([]);
  const [isAsideStreaming, setIsAsideStreaming] = useState(false);
  const [activeAsideThreadId, setActiveAsideThreadId] = useState<string | null>(null);
  const [asideError, setAsideError] = useState<AsideError | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMessageIdRef = useRef<number | null>(null);
  const streamingContentRef = useRef<string>('');
  const asideStreamingContentRef = useRef<string>('');
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreamingRef = useRef(false);
  const activeAsideThreadIdRef = useRef<string | null>(null);

  // Keep refs in sync with state for use in callbacks
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    activeAsideThreadIdRef.current = activeAsideThreadId;
  }, [activeAsideThreadId]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      // Use ref to avoid recreating callback on every isStreaming change
      if (!content.trim() || isStreamingRef.current) return;

      // Optimistically add user message
      const userMessage: Message = {
        id: Date.now(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
        messageType: 'main',
      };
      setMessages((prev) => [...prev, userMessage]);

      send({ type: 'message', content: content.trim() });
    },
    [send]
  );

  const startAside = useCallback(
    (question: string): string => {
      // Generate unique thread ID
      const threadId = `aside-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      if (!question.trim() || isStreamingRef.current || activeAsideThreadIdRef.current) {
        return threadId;
      }

      setAsideError(null);
      setActiveAsideThreadId(threadId);

      // Optimistically add user aside message
      const userMessage: AsideMessage = {
        id: Date.now(),
        role: 'user',
        content: question.trim(),
        timestamp: new Date().toISOString(),
        threadId,
      };
      setAsideMessages((prev) => [...prev, userMessage]);

      send({ type: 'aside:start', content: question.trim(), threadId });

      return threadId;
    },
    [send]
  );

  const cancelAside = useCallback(() => {
    const threadId = activeAsideThreadIdRef.current;
    if (threadId) {
      send({ type: 'aside:cancel', threadId });
    }
  }, [send]);

  useEffect(() => {
    function connect() {
      // Check for CONNECTING or OPEN state to avoid orphan sockets
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

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
            // Store timeout ref for cleanup
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

          case 'history': {
            // Separate main messages from aside messages
            const mainMessages = msg.messages.filter((m) => m.messageType !== 'aside');
            const newAsideMessages = msg.messages
              .filter((m) => m.messageType === 'aside')
              .map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'coach',
                content: m.content,
                timestamp: m.timestamp,
                threadId: m.asideThreadId ?? '',
              }));

            setMessages(mainMessages);
            if (newAsideMessages.length > 0) {
              setAsideMessages((prev) => [...prev, ...newAsideMessages]);
            }
            if (msg.messages.length > 0) {
              lastMessageIdRef.current = msg.messages[msg.messages.length - 1].id;
            }
            break;
          }

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

          case 'aside:delta':
            setIsAsideStreaming(true);
            asideStreamingContentRef.current += msg.content;
            setAsideMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === 'coach' && last.isStreaming && last.threadId === msg.threadId) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: asideStreamingContentRef.current },
                ];
              }
              return [
                ...prev,
                {
                  id: -1,
                  role: 'coach',
                  content: asideStreamingContentRef.current,
                  timestamp: new Date().toISOString(),
                  threadId: msg.threadId,
                  isStreaming: true,
                },
              ];
            });
            break;

          case 'aside:done':
            setAsideMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === 'coach' && last.isStreaming && last.threadId === msg.threadId) {
                return [...prev.slice(0, -1), { ...last, id: msg.messageId, isStreaming: false }];
              }
              return prev;
            });
            asideStreamingContentRef.current = '';
            setIsAsideStreaming(false);
            setActiveAsideThreadId(null);
            break;

          case 'aside:error':
            setAsideError({ threadId: msg.threadId, message: msg.error });
            asideStreamingContentRef.current = '';
            setIsAsideStreaming(false);
            setActiveAsideThreadId(null);
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
    }

    connect();

    return () => {
      // Clean up reconnection timeout
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
    sendMessage,
    isStreaming,
    streamingRole,
    quota,
    error,
    // Aside state
    asideMessages,
    isAsideStreaming,
    activeAsideThreadId,
    asideError,
    // Aside actions
    startAside,
    cancelAside,
  };
}
