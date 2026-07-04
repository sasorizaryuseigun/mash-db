import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/store.js';
import {
  PrimaryKeyMissingError,
  RowAlreadyExistsError,
  RowNotFoundError,
} from '../src/errors.js';

const tables = {
  users: { primaryKey: 'uid' },
  sessions: { primaryKey: 'id' },
};

describe('createStore', () => {
  test('throws for unknown table', () => {
    const { table } = createStore(tables);
    expect(() => table('nonexistent')).toThrow('Unknown table: nonexistent');
  });
});

describe('TableHandle CRUD', () => {
  let users: ReturnType<ReturnType<typeof createStore>['table']>;

  beforeEach(() => {
    const { table } = createStore(tables);
    users = table('users');
  });

  test('insert and get', async () => {
    await users.insert({ uid: 'alice', name: 'Alice', age: 30 });
    await expect(users.get('alice')).resolves.toEqual({
      uid: 'alice',
      name: 'Alice',
      age: 30,
    });
  });

  test('upsert creates new row', async () => {
    await users.upsert({ uid: 'bob', name: 'Bob' });
    await expect(users.get('bob')).resolves.toEqual({
      uid: 'bob',
      name: 'Bob',
    });
  });

  test('upsert overwrites existing row', async () => {
    await users.insert({ uid: 'carol', name: 'Carol', age: 25 });
    await users.upsert({ uid: 'carol', name: 'Carol Updated', age: 26 });
    await expect(users.get('carol')).resolves.toEqual({
      uid: 'carol',
      name: 'Carol Updated',
      age: 26,
    });
  });

  test('update partial fields', async () => {
    await users.insert({ uid: 'dave', name: 'Dave', age: 40 });
    await users.update('dave', { age: 41 });
    await expect(users.get('dave')).resolves.toEqual({
      uid: 'dave',
      name: 'Dave',
      age: 41,
    });
  });

  test('delete removes row', async () => {
    await users.insert({ uid: 'eve', name: 'Eve' });
    await users.delete('eve');
    await expect(users.get('eve')).resolves.toBeUndefined();
  });

  test('findAll returns all rows', async () => {
    await users.insert({ uid: 'f1', name: 'F1' });
    await users.insert({ uid: 'f2', name: 'F2' });
    const all = await users.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.uid).sort()).toEqual(['f1', 'f2']);
  });

  test('get returns undefined for missing row', async () => {
    await expect(users.get('nonexistent')).resolves.toBeUndefined();
  });
});

describe('TableHandle errors', () => {
  let users: ReturnType<ReturnType<typeof createStore>['table']>;

  beforeEach(() => {
    const { table } = createStore(tables);
    users = table('users');
  });

  test('insert missing primary key', async () => {
    await expect(users.insert({ name: 'NoPK' as never })).rejects.toThrow(
      PrimaryKeyMissingError,
    );
  });

  test('insert empty primary key', async () => {
    await expect(users.insert({ uid: '', name: 'Empty' })).rejects.toThrow(
      PrimaryKeyMissingError,
    );
  });

  test('insert duplicate primary key', async () => {
    await users.insert({ uid: 'dup', name: 'First' });
    await expect(users.insert({ uid: 'dup', name: 'Second' })).rejects.toThrow(
      RowAlreadyExistsError,
    );
  });

  test('update nonexistent row', async () => {
    await expect(users.update('no-such-id', { name: 'x' })).rejects.toThrow(
      RowNotFoundError,
    );
  });
});
