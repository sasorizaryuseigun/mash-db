import { createHash } from 'node:crypto';
import type { GroupIdentity } from './types.js';

export function computeGroupId(groupKey: string): string {
  return createHash('sha256').update(groupKey, 'utf-8').digest('hex');
}

export function createGroupIdentity(groupKey: string): GroupIdentity {
  return {
    groupKey,
    groupId: computeGroupId(groupKey),
  };
}

export const DEFAULT_SERVICE_TYPE = '_lan-sync-db._tcp';
