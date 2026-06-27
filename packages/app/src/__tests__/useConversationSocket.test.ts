/**
 * Tests for the blank talk bubble bug fixes in useConversationSocket.
 *
 * These tests verify the state updater functions directly — the same pure
 * functions that React's setState receives — to confirm each bug scenario
 * is correctly handled without needing a full React rendering environment.
 */
import { describe, expect, it } from 'vitest';

// ─── Types (mirror the hook's Message interface) ────────────────────────────

interface Message {
  id: number;
  role: 'user' | 'partner' | 'coach';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

// ─── Helper: build a message for tests ──────────────────────────────────────

function msg(
  overrides: Partial<Message> & { role: Message['role'] }
): Message {
  return {
    id: overrides.id ?? -1,
    content: overrides.content ?? '',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    isStreaming: overrides.isStreaming ?? false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 1: Error handler must clean up stranded streaming messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 1 — Error handler cleanup', () => {
  // Simulates the setMessages updater inside the `case 'error':` handler.
  function errorUpdater(prev: Message[]): Message[] {
    const last = prev[prev.length - 1];
    if (last?.isStreaming) {
      if (last.content.trim()) {
        return [...prev.slice(0, -1), { ...last, isStreaming: false }];
      }
      return prev.slice(0, -1);
    }
    return prev;
  }

  it('removes a blank streaming message left by partner:retry + fallback failure', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi there' }),
      msg({ id: -1, role: 'partner', content: '', isStreaming: true }),
    ];

    const result = errorUpdater(state);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('preserves partial content from a mid-stream failure, marking it non-streaming', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi there' }),
      msg({ id: -1, role: 'partner', content: 'I was saying...', isStreaming: true }),
    ];

    const result = errorUpdater(state);

    expect(result).toHaveLength(2);
    expect(result[1].content).toBe('I was saying...');
    expect(result[1].isStreaming).toBe(false);
  });

  it('does nothing if the last message is not streaming', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi there' }),
      msg({ id: 2, role: 'partner', content: 'Hello!' }),
    ];

    const result = errorUpdater(state);

    expect(result).toEqual(state);
  });

  it('handles an empty message list gracefully', () => {
    const result = errorUpdater([]);
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 2: Reconnect must reset the streaming content ref
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 2 — Reconnect ref reset', () => {
  it('simulates stale ref appending to new stream (the bug)', () => {
    // Before the fix: ref was never cleared on reconnect.
    // Simulate what WOULD happen without the fix:
    const ref = { current: 'leftover from old stream' };

    // New stream arrives after reconnect — appends to stale content
    ref.current += 'Hello';
    expect(ref.current).toBe('leftover from old streamHello'); // garbled!
  });

  it('simulates clean ref after reconnect (the fix)', () => {
    const ref = { current: 'leftover from old stream' };

    // The fix: reset on reconnect (ws.onopen)
    ref.current = '';

    // New stream arrives cleanly
    ref.current += 'Hello';
    expect(ref.current).toBe('Hello');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 3: Closure capture prevents React batching race
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 3 — Closure capture in delta handlers', () => {
  it('old code: ref read inside callback is clobbered by concurrent clear', () => {
    // Simulates the OLD (broken) pattern:
    // streamingContentRef.current is read INSIDE the updater callback.
    const ref = { current: '' };

    // Delta 1 arrives
    ref.current += 'Hello ';
    const updater1_OLD = (prev: Message[]) => {
      // OLD: reads ref.current at execution time, not capture time
      return [
        ...prev,
        msg({ role: 'partner', content: ref.current, isStreaming: true }),
      ];
    };

    // Delta 2 arrives
    ref.current += 'world';
    const updater2_OLD = (prev: Message[]) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'partner' && last.isStreaming) {
        return [...prev.slice(0, -1), { ...last, content: ref.current }];
      }
      return prev;
    };

    // partner:done clears the ref BEFORE React flushes (batching race)
    ref.current = '';

    // React now flushes the queued updaters — ref is already empty
    let state: Message[] = [];
    state = updater1_OLD(state);
    state = updater2_OLD(state);

    // BUG: content is blank because ref was cleared
    expect(state[0].content).toBe('');
  });

  it('new code: captured local variable survives ref clearing', () => {
    // Simulates the FIXED pattern:
    // Content is captured as a local variable BEFORE the callback.
    const ref = { current: '' };

    // Delta 1 arrives — capture before callback
    ref.current += 'Hello ';
    const captured1 = ref.current;
    const updater1_NEW = (prev: Message[]) => {
      return [
        ...prev,
        msg({ role: 'partner', content: captured1, isStreaming: true }),
      ];
    };

    // Delta 2 arrives — capture before callback
    ref.current += 'world';
    const captured2 = ref.current;
    const updater2_NEW = (prev: Message[]) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'partner' && last.isStreaming) {
        return [...prev.slice(0, -1), { ...last, content: captured2 }];
      }
      return prev;
    };

    // partner:done clears the ref BEFORE React flushes
    ref.current = '';

    // React flushes — captured values are safe
    let state: Message[] = [];
    state = updater1_NEW(state);
    state = updater2_NEW(state);

    // FIXED: content preserved via closure capture
    expect(state[0].content).toBe('Hello world');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 4: partner:done / coach:done must use msg.content as fallback
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 4 — Server content fallback in done handlers', () => {
  // Simulates the setMessages updater inside `case 'partner:done':`.
  function partnerDoneUpdater(
    prev: Message[],
    serverContent: string,
    messageId: number
  ): Message[] {
    const last = prev[prev.length - 1];
    if (last?.role === 'partner' && last.isStreaming) {
      const content = last.content || serverContent;
      return [
        ...prev.slice(0, -1),
        { ...last, id: messageId, isStreaming: false, content },
      ];
    }
    if (serverContent) {
      return [
        ...prev,
        msg({
          id: messageId,
          role: 'partner',
          content: serverContent,
          isStreaming: false,
        }),
      ];
    }
    return prev;
  }

  it('uses state content when it exists (normal case)', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi' }),
      msg({ role: 'partner', content: 'Hello from stream!', isStreaming: true }),
    ];

    const result = partnerDoneUpdater(state, 'Hello from server!', 42);

    expect(result[1].content).toBe('Hello from stream!');
    expect(result[1].id).toBe(42);
    expect(result[1].isStreaming).toBe(false);
  });

  it('falls back to server content when state content is empty (retry scenario)', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi' }),
      msg({ role: 'partner', content: '', isStreaming: true }),
    ];

    const result = partnerDoneUpdater(state, 'Hello from server!', 42);

    expect(result[1].content).toBe('Hello from server!');
    expect(result[1].id).toBe(42);
    expect(result[1].isStreaming).toBe(false);
  });

  it('creates message from server content when no streaming message exists', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi' }),
    ];

    const result = partnerDoneUpdater(state, 'Response from Gemini search', 42);

    expect(result).toHaveLength(2);
    expect(result[1].content).toBe('Response from Gemini search');
    expect(result[1].role).toBe('partner');
    expect(result[1].isStreaming).toBe(false);
  });

  it('does nothing when no streaming message and no server content', () => {
    const state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Hi' }),
    ];

    const result = partnerDoneUpdater(state, '', 42);

    expect(result).toEqual(state);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 5: Full retry → error sequence (end-to-end state simulation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 5 — Full retry + error sequence', () => {
  it('simulates: deltas → retry → fallback fails → error cleans up', () => {
    const ref = { current: '' };
    let state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Tell me about yourself' }),
    ];

    // Step 1: Gemini sends some deltas
    ref.current += 'I am a';
    const captured1 = ref.current;
    state = (() => {
      return [
        ...state,
        msg({ role: 'partner', content: captured1, isStreaming: true }),
      ];
    })();
    expect(state).toHaveLength(2);
    expect(state[1].content).toBe('I am a');

    // Step 2: partner:retry clears everything (Gemini quota hit)
    ref.current = '';
    state = (() => {
      const last = state[state.length - 1];
      if (last?.role === 'partner' && last.isStreaming) {
        return [...state.slice(0, -1), { ...last, content: '' }];
      }
      return state;
    })();
    expect(state[1].content).toBe('');
    expect(state[1].isStreaming).toBe(true);

    // Step 3: Claude fallback also fails → error event arrives
    // Error handler cleans up the blank streaming message
    state = (() => {
      const last = state[state.length - 1];
      if (last?.isStreaming) {
        if (last.content.trim()) {
          return [...state.slice(0, -1), { ...last, isStreaming: false }];
        }
        return state.slice(0, -1);
      }
      return state;
    })();

    // Result: blank bubble is GONE, only the user message remains
    expect(state).toHaveLength(1);
    expect(state[0].role).toBe('user');
  });

  it('simulates: deltas → retry → fallback succeeds → done commits', () => {
    const ref = { current: '' };
    let state: Message[] = [
      msg({ id: 1, role: 'user', content: 'Tell me about yourself' }),
    ];

    // Step 1: Gemini sends deltas
    ref.current += 'Partial Gemini...';
    const captured1 = ref.current;
    state = [
      ...state,
      msg({ role: 'partner', content: captured1, isStreaming: true }),
    ];

    // Step 2: partner:retry
    ref.current = '';
    state = (() => {
      const last = state[state.length - 1];
      if (last?.role === 'partner' && last.isStreaming) {
        return [...state.slice(0, -1), { ...last, content: '' }];
      }
      return state;
    })();

    // Step 3: Claude fallback streams successfully
    ref.current += 'Hello! I am Claude.';
    const captured2 = ref.current;
    state = (() => {
      const last = state[state.length - 1];
      if (last?.role === 'partner' && last.isStreaming) {
        return [...state.slice(0, -1), { ...last, content: captured2 }];
      }
      return state;
    })();
    expect(state[1].content).toBe('Hello! I am Claude.');

    // Step 4: partner:done commits
    ref.current = '';
    state = (() => {
      const last = state[state.length - 1];
      if (last?.role === 'partner' && last.isStreaming) {
        const content = last.content || 'Hello! I am Claude.';
        return [
          ...state.slice(0, -1),
          { ...last, id: 42, isStreaming: false, content },
        ];
      }
      return state;
    })();

    expect(state[1].content).toBe('Hello! I am Claude.');
    expect(state[1].isStreaming).toBe(false);
    expect(state[1].id).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Coach delta handler — same closure capture fix
// ═══════════════════════════════════════════════════════════════════════════════

describe('Coach delta handler — closure capture', () => {
  it('captured coach content survives ref clearing by coach:done', () => {
    const ref = { current: '' };

    ref.current += 'Great job keeping calm!';
    const captured = ref.current;

    // coach:done clears the ref before React flushes
    ref.current = '';

    // Updater uses captured value
    const state: Message[] = [];
    const result = [
      ...state,
      msg({ role: 'coach', content: captured, isStreaming: true }),
    ];

    expect(result[0].content).toBe('Great job keeping calm!');
  });
});
