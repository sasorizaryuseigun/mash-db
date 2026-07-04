import type { MergeableStore } from 'tinybase';
import { createCustomSynchronizer } from 'tinybase/synchronizers';
import type { Synchronizer } from 'tinybase/synchronizers';

type ConnectionInfo = {
  peerId: string;
  synchronizer: Synchronizer;
};

export type PeerConnectionHandle = {
  receive(msg: string): void;
  destroy(): void;
};

export type PeerManagerHandle = {
  addPeer(
    peerId: string,
    onSend: (msg: string) => void,
  ): PeerConnectionHandle | null;
  isConnected(peerId: string): boolean;
  close(): void;
  getPeers(): string[];
};

export function createPeerManager(
  store: MergeableStore,
  ourPeerId: string,
): PeerManagerHandle {
  const connections = new Map<string, ConnectionInfo>();

  return {
    addPeer(peerId, onSend) {
      if (connections.has(peerId)) return null;

      let receiveCallback: ((msg: string) => void) | null = null;

      // WebSocket connection is 1:1, so toClientId is always our peer
      const synchronizer = createCustomSynchronizer(
        store,
        (_toClientId, requestId, message, body) => {
          onSend(
            JSON.stringify({
              fromClientId: ourPeerId,
              requestId,
              message,
              body,
            }),
          );
        },
        (receive) => {
          receiveCallback = (msg: string) => {
            try {
              const parsed = JSON.parse(msg);
              receive(
                parsed.fromClientId,
                parsed.requestId,
                parsed.message,
                parsed.body,
              );
            } catch {
              // ignore malformed messages
            }
          };
        },
        () => {
          // synchronizer destroy callback
        },
        30_000,
      );

      synchronizer.startSync();

      connections.set(peerId, {
        peerId,
        synchronizer,
      });

      return {
        receive(msg: string) {
          receiveCallback?.(msg);
        },
        destroy() {
          if (!connections.has(peerId)) return;
          synchronizer.destroy();
          connections.delete(peerId);
        },
      };
    },

    isConnected(peerId) {
      return connections.has(peerId);
    },

    close() {
      for (const conn of connections.values()) {
        conn.synchronizer.destroy();
      }
      connections.clear();
    },

    getPeers() {
      return Array.from(connections.keys());
    },
  };
}
