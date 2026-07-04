// SPDX-License-Identifier: AGPL-3.0-only

import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { AddressInfo } from 'node:net';
import { GroupIdMismatchError } from './errors.js';
import type { HelloMessage } from './types.js';

export type PeerConnection = {
  peerId: string;
  onSync(cb: (msg: string) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: Error) => void): void;
  send(msg: string): void;
  close(): void;
};

export type TransportOptions = {
  groupId: string | undefined;
  peerId: string;
  port?: number;
};

export type TransportHandle = {
  port: number;
  onPeer(cb: (conn: PeerConnection) => void): void;
  connect(host: string, port: number): Promise<void>;
  close(): Promise<void>;
};

function makeHello(groupId: string | undefined, peerId: string): string {
  return JSON.stringify({
    type: 'hello',
    groupId,
    peerId,
    protocol: 1,
  } satisfies HelloMessage);
}

export function createTransport(
  opts: TransportOptions,
): TransportHandle & Promise<void> {
  const { groupId, peerId } = opts;
  let onPeerCb: ((conn: PeerConnection) => void) | null = null;
  let server: WebSocketServer | null = null;
  let resolvedPort = opts.port ?? 0;
  let closing = false;
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((err: Error) => void) | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const wss = new WebSocketServer({ port: opts.port ?? 0 });

  wss.on('listening', () => {
    const addr = wss.address() as AddressInfo;
    resolvedPort = addr.port;
    resolveReady?.();
  });

  wss.on('error', (err) => {
    rejectReady?.(err);
  });

  wss.on('connection', (ws) => {
    if (closing) {
      ws.close();
      return;
    }
    handleConnection(ws, false)
      .then((pc) => {
        onPeerCb?.(pc);
      })
      .catch((err) => {
        console.warn(`[mesh-db] handshake failed: ${err}`);
      });
  });

  server = wss;

  const promise = readyPromise.then(() => {});
  Object.defineProperties(promise, {
    port: {
      get() {
        return resolvedPort;
      },
      enumerable: true,
    },
    onPeer: {
      value(cb: (conn: PeerConnection) => void) {
        onPeerCb = cb;
      },
      enumerable: true,
    },
    connect: {
      async value(host: string, port: number) {
        const url = `ws://${host}:${port}`;
        const ws = new WebSocket(url);

        await new Promise<void>((resolve, reject) => {
          ws.once('open', () => resolve());
          ws.once('error', (err) => reject(err));
        });

        const pc = await handleConnection(ws, true);
        onPeerCb?.(pc);
      },
      enumerable: true,
    },
    close: {
      async value() {
        resolveReady?.();
        if (server) {
          closing = true;
          for (const client of server.clients) {
            client.close();
          }
          const CLOSE_TIMEOUT_MS = 5_000;
          await Promise.race([
            new Promise<void>((resolve) => {
              server!.close(() => resolve());
            }),
            new Promise<void>((resolve) =>
              setTimeout(() => {
                console.warn(
                  `[mesh-db] WebSocket server close timed out after ${CLOSE_TIMEOUT_MS}ms`,
                );
                resolve();
              }, CLOSE_TIMEOUT_MS),
            ),
          ]);
          server = null;
        }
      },
    },
  });

  return promise as unknown as TransportHandle & Promise<void>;

  async function handleConnection(
    ws: WebSocket,
    isInitiator: boolean,
  ): Promise<PeerConnection> {
    let syncCallback: ((msg: string) => void) | null = null;
    let onCloseCb: (() => void) | null = null;
    let onErrorCb: ((err: Error) => void) | null = null;
    const syncBuffer: string[] = [];

    const remotePeerId = await new Promise<string>((resolve, reject) => {
      const HANDSHAKE_TIMEOUT_MS = 10_000;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const onClose = () =>
        reject(new Error('Connection closed during handshake'));
      const onError = (err: Error) => reject(err);

      const removeHandlers = () => {
        if (timeout) clearTimeout(timeout);
        ws.off('close', onClose);
        ws.off('error', onError);
        ws.off('message', onMessage);
      };

      const onMessage = (raw: RawData) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          removeHandlers();
          ws.close();
          reject(new Error('Invalid handshake message: not valid JSON'));
          return;
        }

        if (msg.type === 'error') {
          removeHandlers();
          ws.close();
          if (msg.code === 'GROUP_ID_MISMATCH') {
            reject(
              new GroupIdMismatchError(
                msg.expectedGroupId as string,
                msg.receivedGroupId as string,
              ),
            );
          } else {
            reject(
              new Error(
                `Handshake error: ${(msg.message as string) ?? 'Unknown error'}`,
              ),
            );
          }
          return;
        }

        if (msg.type !== 'hello') {
          removeHandlers();
          ws.close();
          reject(new Error('Invalid handshake message: expected hello type'));
          return;
        }

        const hello = msg as unknown as HelloMessage;

        const sameGroup =
          groupId !== undefined &&
          hello.groupId !== undefined &&
          hello.groupId === groupId;
        const bothUngrouped =
          groupId === undefined && hello.groupId === undefined;

        if (!sameGroup && !bothUngrouped) {
          removeHandlers();
          ws.send(
            JSON.stringify({
              type: 'error',
              code: 'GROUP_ID_MISMATCH',
              expectedGroupId: groupId,
              receivedGroupId: hello.groupId,
            }),
          );
          ws.close();
          reject(new GroupIdMismatchError(groupId, hello.groupId));
          return;
        }

        if (!isInitiator) {
          ws.send(makeHello(groupId, peerId));
        }

        removeHandlers();

        // After hello, forward all messages to buffer/callback
        ws.on('message', (raw: RawData) => {
          const str = raw.toString();
          if (syncCallback) {
            syncCallback(str);
          } else {
            syncBuffer.push(str);
          }
        });

        ws.on('close', () => {
          syncBuffer.length = 0;
          onCloseCb?.();
        });

        ws.on('error', (err) => {
          onErrorCb?.(err);
        });

        resolve(hello.peerId);
        return;
      };

      timeout = setTimeout(() => {
        removeHandlers();
        ws.close();
        reject(new Error('Handshake timed out'));
      }, HANDSHAKE_TIMEOUT_MS);

      ws.on('message', onMessage);
      ws.on('close', onClose);
      ws.on('error', onError);

      if (isInitiator) {
        ws.send(makeHello(groupId, peerId));
      }
    });

    return {
      peerId: remotePeerId,

      onSync(cb: (msg: string) => void) {
        syncCallback = cb;
        for (const buffered of syncBuffer) {
          syncCallback(buffered);
        }
        syncBuffer.length = 0;
      },

      onClose(cb: () => void) {
        onCloseCb = cb;
      },

      onError(cb: (err: Error) => void) {
        onErrorCb = cb;
      },

      send(msg: string) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        } else {
          console.warn(
            `[mesh-db] Dropping message to ${remotePeerId}: WebSocket not OPEN (state=${ws.readyState})`,
          );
        }
      },

      close() {
        ws.close();
      },
    };
  }
}
