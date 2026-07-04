// SPDX-License-Identifier: AGPL-3.0-only

import { describe, test, expect, afterEach } from 'vitest';
import { createLanSyncDb } from '../src/index.js';
import { makeTempDir, removeDir } from './helpers.js';

describe('seed', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      removeDir(dir);
    }
    tempDirs.length = 0;
  });

  test('seeds data into empty store', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db = await createLanSyncDb({
      dir,
      tables: { users: { primaryKey: 'uid' } },
      sync: { discovery: false, transport: false },
      seed: {
        users: [
          { uid: 'alice', name: 'Alice', age: 30 },
          { uid: 'bob', name: 'Bob', age: 25 },
        ],
      },
    });
    const all = await db.table('users').findAll();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.uid === 'alice')?.name).toBe('Alice');
    expect(all.find((r) => r.uid === 'bob')?.age).toBe(25);
    await db.close();
  });

  test('does not seed when store already has data', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);

    const db1 = await createLanSyncDb({
      dir,
      tables: { users: { primaryKey: 'uid' } },
      sync: { discovery: false, transport: false },
    });
    await db1.table('users').upsert({ uid: 'existing', name: 'Existing' });
    await db1.close();

    const db2 = await createLanSyncDb({
      dir,
      tables: { users: { primaryKey: 'uid' } },
      sync: { discovery: false, transport: false },
      seed: {
        users: [{ uid: 'new', name: 'New' }],
      },
    });
    const all = await db2.table('users').findAll();
    expect(all).toHaveLength(1);
    expect(all[0].uid).toBe('existing');
    await db2.close();
  });

  test('seed data persists after restart', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);

    const db1 = await createLanSyncDb({
      dir,
      tables: { users: { primaryKey: 'uid' } },
      sync: { discovery: false, transport: false },
      seed: {
        users: [{ uid: 'persist', name: 'Persisted' }],
      },
    });
    await db1.close();

    const db2 = await createLanSyncDb({
      dir,
      tables: { users: { primaryKey: 'uid' } },
      sync: { discovery: false, transport: false },
    });
    const all = await db2.table('users').findAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Persisted');
    await db2.close();
  });

  test('seeds multiple tables', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db = await createLanSyncDb({
      dir,
      tables: {
        a: { primaryKey: 'id' },
        b: { primaryKey: 'id' },
      },
      sync: { discovery: false, transport: false },
      seed: {
        a: [{ id: 'a1', val: 1 }],
        b: [
          { id: 'b1', val: 2 },
          { id: 'b2', val: 3 },
        ],
      },
    });
    expect(await db.table('a').findAll()).toHaveLength(1);
    expect(await db.table('b').findAll()).toHaveLength(2);
    await db.close();
  });

  test('empty seed array does nothing', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const db = await createLanSyncDb({
      dir,
      tables: { t: { primaryKey: 'id' } },
      sync: { discovery: false, transport: false },
      seed: { t: [] },
    });
    expect(await db.table('t').findAll()).toHaveLength(0);
    await db.close();
  });

  test('unknown table in seed throws', async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    await expect(
      createLanSyncDb({
        dir,
        tables: { t: { primaryKey: 'id' } },
        sync: { discovery: false, transport: false },
        seed: { unknownTable: [{ id: 'x' }] },
      }),
    ).rejects.toThrow('Unknown table: unknownTable');
  });
});
