import { once } from 'node:events';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { WS_PROTOCOL } from '../auth/resolveUser.js';

/**
 * The real @fastify/websocket handshake with the handleProtocols option
 * server.ts now passes. The website's sockets offer no protocols, and a
 * regression here would break every live conversation, so this is tested
 * against a real server rather than asserted on.
 */

let app: ReturnType<typeof Fastify>;
let port: number;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(websocket, {
    options: {
      // Mirror of server.ts; keep in sync.
      handleProtocols: (protocols: Set<string>) =>
        protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false,
    },
  });
  app.get('/ws/echo', { websocket: true }, (socket) => {
    socket.send('hello');
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterEach(async () => {
  await app.close();
});

describe('websocket handshake with handleProtocols', () => {
  it('a browser-style socket offering no protocols connects (the website path)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/echo`);
    const [message] = await once(ws, 'message');
    expect(String(message)).toBe('hello');
    expect(ws.protocol).toBe('');
    ws.close();
  });

  it('a native socket gets convolab.v1 echoed and connects', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/echo`, [WS_PROTOCOL, 'bearer.sometoken']);
    const [message] = await once(ws, 'message');
    expect(String(message)).toBe('hello');
    expect(ws.protocol).toBe(WS_PROTOCOL);
    ws.close();
  });

  it('a socket offering only unknown protocols is refused', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/echo`, ['something.else']);
    const [error] = await once(ws, 'error');
    // The server echoes nothing it was offered, so the client aborts the
    // connection ("Server sent no subprotocol").
    expect(String(error)).toMatch(/subprotocol|invalid|handshake|400/i);
  });
});
