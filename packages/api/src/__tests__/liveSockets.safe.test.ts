import { describe, expect, it } from 'vitest';
import { registerSocket, socketFor, unregisterSocket } from '../ws/liveSockets.js';

function fakeSocket(open = true) {
  return { readyState: open ? 1 : 3, sent: [] as string[], send(d: string) { this.sent.push(d); } };
}

describe('socketFor', () => {
  it('keeps using the original socket while it is open', () => {
    const original = fakeSocket();
    const newer = fakeSocket();
    registerSocket('s1', original);
    registerSocket('s1', newer);
    expect(socketFor('s1', original)).toBe(original);
    unregisterSocket('s1', newer);
  });

  it("falls back to the session's newest open socket once the original has closed", () => {
    // The 3 Nov 2026 case: the reply finished after Cloud Run cut the socket.
    const original = fakeSocket(false);
    const reconnected = fakeSocket();
    registerSocket('s2', reconnected);
    expect(socketFor('s2', original)).toBe(reconnected);
    unregisterSocket('s2', reconnected);
  });

  it('stays on the original when no newer open socket exists', () => {
    const original = fakeSocket(false);
    expect(socketFor('s3', original)).toBe(original);
    const closedNewer = fakeSocket(false);
    registerSocket('s3', closedNewer);
    expect(socketFor('s3', original)).toBe(original);
    unregisterSocket('s3', closedNewer);
  });

  it('never crosses sessions, and an old socket closing does not drop a newer one', () => {
    const a = fakeSocket();
    registerSocket('s4', a);
    expect(socketFor('s5', fakeSocket(false))).not.toBe(a);
    const b = fakeSocket();
    registerSocket('s4', b);
    unregisterSocket('s4', a); // the older socket's close event fires late
    expect(socketFor('s4', fakeSocket(false))).toBe(b);
    unregisterSocket('s4', b);
  });
});
