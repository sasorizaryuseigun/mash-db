// SPDX-License-Identifier: AGPL-3.0-only

import { describe, test, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLanSyncDb } from '../src/index.js';
import { makeTempDir, removeDir } from './helpers.js';

describe('persistence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      removeDir(dir);
    }
    tempDirs.length = 0;
  });

  test('peer-id file created on first run', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: { t: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
    });
    const peerIdFile = path.join(dir, 'peer-id');
    expect(existsSync(peerIdFile)).toBe(true);
    const stored = readFileSync(peerIdFile, 'utf-8').trim();
    expect(stored).toBe(db.peerId);
    await db.close();
  });

  test('peer-id survives restart', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db1 = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: { t: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
    });
    const pid = db1.peerId;
    await db1.close();

    const db2 = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: { t: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
    });
    expect(db2.peerId).toBe(pid);
    await db2.close();
  });

  test('store.json persists data', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db1 = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: { items: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
    });
    await db1.table('items').upsert({ id: 'x', value: 42 });
    await db1.table('items').upsert({ id: 'y', value: 99 });
    await db1.close();

    const db2 = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: { items: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
    });
    const all = await db2.table('items').findAll();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === 'x')?.value).toBe(42);
    expect(all.find((r) => r.id === 'y')?.value).toBe(99);
    await db2.close();
  });

  test('multiple tables persist correctly', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db1 = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: {
        users: { primaryKey: 'uid' },
        config: { primaryKey: 'key' },
      },
      sync: { discovery: false, transport: false },
    });
    await db1.table('users').upsert({ uid: 'a', name: 'Alice' });
    await db1.table('config').upsert({ key: 'theme', value: 'dark' });
    await db1.close();

    const db2 = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: {
        users: { primaryKey: 'uid' },
        config: { primaryKey: 'key' },
      },
      sync: { discovery: false, transport: false },
    });
    expect(await db2.table('users').findAll()).toHaveLength(1);
    expect(await db2.table('config').findAll()).toHaveLength(1);
    expect((await db2.table('users').get('a'))?.name).toBe('Alice');
    expect((await db2.table('config').get('theme'))?.value).toBe('dark');
    await db2.close();
  });

  test('close does not hang', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db = await createLanSyncDb({
      groupKey: 'test',
      dir,
      tables: { t: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
    });
    const start = Date.now();
    await db.close();
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
