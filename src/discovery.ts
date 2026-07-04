// SPDX-License-Identifier: AGPL-3.0-only

import Bonjour from 'bonjour-service';
import { DEFAULT_SERVICE_TYPE } from './group.js';

export type DiscoveryOptions = {
  groupId: string;
  peerId: string;
  port: number;
  serviceType?: string;
};

export type DiscoveryHandle = {
  close(): void;
};

function normalizeServiceType(type: string): string {
  return type.replace(/^_/, '').replace(/\._(tcp|udp)$/, '');
}

export function createDiscovery(
  opts: DiscoveryOptions,
  onPeer: (peerId: string, host: string, port: number) => void,
): DiscoveryHandle {
  const serviceType = normalizeServiceType(
    opts.serviceType ?? DEFAULT_SERVICE_TYPE,
  );
  let closed = false;

  const bonjour = new Bonjour();

  const service = bonjour.publish({
    name: `mesh-db-${opts.peerId}`,
    type: serviceType,
    protocol: 'tcp',
    port: opts.port,
    txt: {
      groupId: opts.groupId,
      peerId: opts.peerId,
      protocol: '1',
    },
  });

  service.on('error', (err: Error) => {
    console.warn(`[mesh-db] mDNS publish error: ${err.message}`);
  });

  const browser = bonjour.find({ type: serviceType }, (srv) => {
    if (closed) return;

    if (srv.name === `mesh-db-${opts.peerId}`) return;

    const txt = (srv.txt ?? {}) as Record<string, string>;
    if (txt.groupId !== opts.groupId) return;
    if (txt.peerId === opts.peerId) return;

    const host = srv.host ?? srv.addresses?.[0];
    if (!host) return;

    onPeer(txt.peerId, host, srv.port);
  });

  return {
    close() {
      closed = true;
      try {
        browser.stop();
      } catch {
        /* ignore */
      }
      try {
        service.stop();
      } catch {
        /* ignore */
      }
      try {
        bonjour.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
