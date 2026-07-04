import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createFilePersister } from 'tinybase/persisters/persister-file';
import type { MergeableStore } from 'tinybase';

const SAVE_DEBOUNCE_MS = 300;

export type PersistenceHandle = {
  peerId: string;
  start(): Promise<void>;
  close(): Promise<void>;
};

export function initPersistence(
  store: MergeableStore,
  dir: string,
  existingPeerId?: string,
): PersistenceHandle {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const peerIdFile = path.join(dir, 'peer-id');
  let peerId: string;
  let loadedFromFile = false;
  if (existingPeerId) {
    peerId = existingPeerId;
  } else if (existsSync(peerIdFile)) {
    peerId = readFileSync(peerIdFile, 'utf-8').trim();
    loadedFromFile = true;
  } else {
    peerId = randomUUID();
  }
  if (!loadedFromFile) {
    writeFileSync(peerIdFile, peerId, 'utf-8');
  }

  const storeFile = path.join(dir, 'store.json');
  const persister = createFilePersister(store, storeFile);

  let pendingSave: Promise<unknown> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let listenerId: string | undefined;

  return {
    peerId,

    async start() {
      await persister.load();

      listenerId = store.addTablesListener(() => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          pendingSave = persister.save();
          await pendingSave;
          pendingSave = null;
        }, SAVE_DEBOUNCE_MS);
      });
    },

    async close() {
      if (listenerId != null) {
        store.delListener(listenerId);
        listenerId = undefined;
      }
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (pendingSave) {
        await pendingSave;
      }
      await persister.save();
      await persister.destroy();
    },
  };
}
