// SPDX-License-Identifier: AGPL-3.0-only

import { describe, test, expect } from 'vitest';
import {
  computeGroupId,
  createGroupIdentity,
  DEFAULT_SERVICE_TYPE,
} from '../src/group.js';

describe('computeGroupId', () => {
  test('sha256 hex length', () => {
    const id = computeGroupId('any-key');
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  test('deterministic for same key', () => {
    const a = computeGroupId('test-group-key');
    const b = computeGroupId('test-group-key');
    expect(a).toBe(b);
  });

  test('different for different keys', () => {
    const a = computeGroupId('key-alpha');
    const b = computeGroupId('key-beta');
    expect(a).not.toBe(b);
  });

  test('empty string produces a valid hash', () => {
    const id = computeGroupId('');
    expect(id).toHaveLength(64);
  });
});

describe('createGroupIdentity', () => {
  test('returns groupKey and groupId', () => {
    const g = createGroupIdentity('my-key');
    expect(g.groupKey).toBe('my-key');
    expect(g.groupId).toBe(computeGroupId('my-key'));
  });
});

describe('DEFAULT_SERVICE_TYPE', () => {
  test('is _mesh-db._tcp', () => {
    expect(DEFAULT_SERVICE_TYPE).toBe('_mesh-db._tcp');
  });
});
