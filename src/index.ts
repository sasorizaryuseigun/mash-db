import type { CreateLanSyncDbOptions, LanSyncDb } from './types.js';
import { createGroupIdentity, DEFAULT_SERVICE_TYPE } from './group.js';
import { createStore } from './store.js';
import { initPersistence } from './persistence.js';
import { createTransport } from './transport.js';
import type { PeerConnection } from './transport.js';
import { createDiscovery } from './discovery.js';
import { createPeerManager } from './peer-manager.js';

export async function createLanSyncDb(
  opts: CreateLanSyncDbOptions,
): Promise<LanSyncDb> {
  const group = createGroupIdentity(opts.groupKey);
  const syncOpts = opts.sync ?? {};
  const enableDiscovery = syncOpts.discovery !== false;
  const enableTransport = syncOpts.transport !== false;
  const serviceType = syncOpts.serviceType ?? DEFAULT_SERVICE_TYPE;

  const { store, table } = createStore(opts.tables);
  const persistence = initPersistence(store, opts.dir, syncOpts.peerId);

  await persistence.start();

  const peerManager = createPeerManager(store, persistence.peerId);

  const peerConnections: PeerConnection[] = [];
  const connectingPeers = new Set<string>();
  let transportConnect: ((host: string, port: number) => Promise<void>) | null =
    null;
  let transportCleanup: (() => Promise<void>) | null = null;
  let transportPort: number | undefined;
  let discoveryCleanup: (() => void) | null = null;

  function setupConnection(conn: PeerConnection) {
    if (conn.peerId === persistence.peerId) {
      conn.close();
      return;
    }

    if (peerManager.isConnected(conn.peerId)) {
      conn.close();
      return;
    }

    const peerConnection = peerManager.addPeer(conn.peerId, (msg) => {
      conn.send(msg);
    });

    if (!peerConnection) {
      conn.close();
      return;
    }

    peerConnections.push(conn);

    conn.onSync((msg) => {
      peerConnection.receive(msg);
    });

    conn.onClose(() => {
      const idx = peerConnections.indexOf(conn);
      if (idx >= 0) peerConnections.splice(idx, 1);
      peerConnection.destroy();
    });

    conn.onError(() => {
      const idx = peerConnections.indexOf(conn);
      if (idx >= 0) peerConnections.splice(idx, 1);
      peerConnection.destroy();
      conn.close();
    });
  }

  if (enableTransport) {
    const transport = createTransport({
      groupId: group.groupId,
      peerId: persistence.peerId,
      port: syncOpts.port,
    });

    transport.onPeer((conn) => {
      setupConnection(conn);
    });

    await transport;
    transportPort = transport.port;

    transportConnect = transport.connect.bind(transport);
    transportCleanup = async () => {
      await transport.close();
    };

    if (enableDiscovery) {
      const discovery = createDiscovery(
        {
          groupId: group.groupId,
          peerId: persistence.peerId,
          port: transport.port,
          serviceType,
        },
        (remotePeerId, host, port) => {
          if (peerManager.isConnected(remotePeerId)) return;
          if (remotePeerId === persistence.peerId) return;
          if (connectingPeers.has(remotePeerId)) return;

          connectingPeers.add(remotePeerId);
          transport.connect(host, port).finally(() => {
            connectingPeers.delete(remotePeerId);
          });
        },
      );

      discoveryCleanup = () => {
        discovery.close();
      };
    }
  }

  const db: LanSyncDb = {
    peerId: persistence.peerId,
    groupId: group.groupId,
    port: transportPort,

    table(name) {
      return table(name);
    },

    async connect(host, port) {
      if (!transportConnect) {
        throw new Error('Transport is disabled');
      }
      await transportConnect(host, port);
    },

    getPeers() {
      return peerManager.getPeers().map((pid) => ({
        peerId: pid,
        groupId: group.groupId,
        state: 'connected' as const,
      }));
    },

    async close() {
      await transportCleanup?.();
      try {
        discoveryCleanup?.();
      } catch {
        /* ignore cleanup errors */
      }
      for (const conn of [...peerConnections]) {
        conn.close();
      }
      peerConnections.length = 0;
      peerManager.close();
      await persistence.close();
    },
  };

  return db;
}

export type { LanSyncDb, PeerInfo, TableHandle } from './types.js';
export type {
  CreateLanSyncDbOptions,
  SyncOptions,
  TableSchema,
} from './types.js';

export {
  PrimaryKeyMissingError,
  RowAlreadyExistsError,
  RowNotFoundError,
  GroupIdMismatchError,
} from './errors.js';
