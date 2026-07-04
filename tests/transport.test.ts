// SPDX-License-Identifier: AGPL-3.0-only

import { describe, test, expect } from 'vitest';
import { createTransport } from '../src/transport.js';

describe('createTransport', () => {
  test('server starts and port resolves', async () => {
    const t = createTransport({
      groupId: 'g1',
      peerId: 'p-server',
      port: 0,
    });
    await t;
    expect(t.port).toBeGreaterThan(0);
    await t.close();
  });

  test('same groupId handshake succeeds', async () => {
    const tA = createTransport({
      groupId: 'group-x',
      peerId: 'peer-A',
      port: 0,
    });
    await tA;

    const tB = createTransport({
      groupId: 'group-x',
      peerId: 'peer-B',
      port: 0,
    });
    await tB;

    const connectPromise = new Promise<{ peerId: string }>((resolve) => {
      tA.onPeer((conn) => {
        resolve({ peerId: conn.peerId });
      });
    });

    await tB.connect('127.0.0.1', tA.port);
    const result = await connectPromise;
    expect(result.peerId).toBe('peer-B');

    await tA.close();
    await tB.close();
  });

  test('different groupId handshake fails', async () => {
    const tA = createTransport({
      groupId: 'group-A',
      peerId: 'peer-A',
      port: 0,
    });
    await tA;

    const tB = createTransport({
      groupId: 'group-B',
      peerId: 'peer-B',
      port: 0,
    });
    await tB;

    await expect(tB.connect('127.0.0.1', tA.port)).rejects.toThrow();

    await tA.close();
    await tB.close();
  });

  test('messages delivered via onSync', async () => {
    const tA = createTransport({ groupId: 'g', peerId: 'peer-A', port: 0 });
    await tA;

    const tB = createTransport({
      groupId: 'g',
      peerId: 'peer-B',
      port: 0,
    });
    await tB;

    let aConn: { onSync(cb: (msg: string) => void): void } | null = null;
    let bConn: { send(msg: string): void } | null = null;

    tA.onPeer((conn) => {
      aConn = conn;
    });
    tB.onPeer((conn) => {
      bConn = conn;
    });

    // Connect B to A (triggers both onPeers during the handshake)
    await tB.connect('127.0.0.1', tA.port);

    // Both onPeers have fired by now
    const received = new Promise<string>((resolve) => {
      aConn!.onSync((msg) => resolve(msg));
    });

    bConn!.send('hello-from-B');

    await expect(received).resolves.toBe('hello-from-B');

    await tA.close();
    await tB.close();
  });

  test('close does not hang', async () => {
    const t = createTransport({ groupId: 'g', peerId: 'p', port: 0 });
    await t;
    const start = Date.now();
    await t.close();
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('no groupId handshake succeeds', async () => {
    const tA = createTransport({
      groupId: undefined,
      peerId: 'peer-A',
      port: 0,
    });
    await tA;

    const tB = createTransport({
      groupId: undefined,
      peerId: 'peer-B',
      port: 0,
    });
    await tB;

    const connectPromise = new Promise<{ peerId: string }>((resolve) => {
      tA.onPeer((conn) => {
        resolve({ peerId: conn.peerId });
      });
    });

    await tB.connect('127.0.0.1', tA.port);
    const result = await connectPromise;
    expect(result.peerId).toBe('peer-B');

    await tA.close();
    await tB.close();
  });

  test('groupId mismatch when one side has no groupId', async () => {
    const tA = createTransport({
      groupId: 'group-A',
      peerId: 'peer-A',
      port: 0,
    });
    await tA;

    const tB = createTransport({
      groupId: undefined,
      peerId: 'peer-B',
      port: 0,
    });
    await tB;

    await expect(tB.connect('127.0.0.1', tA.port)).rejects.toThrow();

    await tA.close();
    await tB.close();
  });
});
