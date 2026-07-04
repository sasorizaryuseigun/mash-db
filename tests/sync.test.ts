import { describe, test, expect, afterEach } from 'vitest';
import { createLanSyncDb } from '../src/index.js';
import { makeTempDir, removeDir, waitFor } from './helpers.js';

describe('sync', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      removeDir(dir);
    }
    tempDirs.length = 0;
  });

  test('two peers connect', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    tempDirs.push(dirA, dirB);

    const dbA = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirA,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });
    const portA = dbA.port!;

    const dbB = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirB,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });

    await dbB.connect('127.0.0.1', portA);

    await dbA.close();
    await dbB.close();
  });

  test('A to B sync', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    tempDirs.push(dirA, dirB);

    const dbA = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirA,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });
    const portA = dbA.port!;

    const dbB = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirB,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });

    await dbB.connect('127.0.0.1', portA);
    await waitFor(
      () => dbA.getPeers().some((p) => p.peerId === dbB.peerId),
      3000,
    );

    await dbA.table('items').upsert({ id: 'a1', value: 'from-A' });

    await waitFor(async () => {
      const rows = await dbB.table('items').findAll();
      return rows.some((r) => r.id === 'a1' && r.value === 'from-A');
    }, 6000);

    await dbA.close();
    await dbB.close();
  });

  test('B to A sync', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    tempDirs.push(dirA, dirB);

    const dbA = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirA,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });
    const portA = dbA.port!;

    const dbB = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirB,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });

    await dbB.connect('127.0.0.1', portA);
    await waitFor(
      () => dbA.getPeers().some((p) => p.peerId === dbB.peerId),
      3000,
    );

    await dbB.table('items').upsert({ id: 'b1', value: 'from-B' });

    await waitFor(async () => {
      const rows = await dbA.table('items').findAll();
      return rows.some((r) => r.id === 'b1' && r.value === 'from-B');
    }, 6000);

    await dbA.close();
    await dbB.close();
  });

  test('late joiner catches up', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    tempDirs.push(dirA, dirB);

    const dbA = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirA,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });
    const portA = dbA.port!;

    // Write data before B connects
    await dbA
      .table('items')
      .upsert({ id: 'existing', value: 'before-connect' });

    const dbB = await createLanSyncDb({
      groupKey: 'sync-test',
      dir: dirB,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });

    await dbB.connect('127.0.0.1', portA);

    await waitFor(async () => {
      const rows = await dbB.table('items').findAll();
      return rows.some((r) => r.id === 'existing');
    }, 6000);

    await dbA.close();
    await dbB.close();
  });

  test('different group keys do not sync', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    tempDirs.push(dirA, dirB);

    const dbA = await createLanSyncDb({
      groupKey: 'group-alpha',
      dir: dirA,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });
    const portA = dbA.port!;

    const dbB = await createLanSyncDb({
      groupKey: 'group-beta',
      dir: dirB,
      tables: { items: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });

    await expect(dbB.connect('127.0.0.1', portA)).rejects.toThrow();

    await dbA.close();
    await dbB.close();
  });

  test('close does not hang', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    tempDirs.push(dirA, dirB);

    const dbA = await createLanSyncDb({
      groupKey: 'close-test',
      dir: dirA,
      tables: { t: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });
    const portA = dbA.port!;

    const dbB = await createLanSyncDb({
      groupKey: 'close-test',
      dir: dirB,
      tables: { t: { primaryKey: 'id' } },
      sync: { port: 0, discovery: false },
    });

    await dbB.connect('127.0.0.1', portA);
    await waitFor(
      () => dbA.getPeers().some((p) => p.peerId === dbB.peerId),
      3000,
    );

    const start = Date.now();
    await dbA.close();
    await dbB.close();
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
