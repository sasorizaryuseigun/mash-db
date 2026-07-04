// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function makeTempDir(prefix = 'lan-sync-test-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitFor(
  fn: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await fn();
    if (ok) return;
    await sleep(intervalMs);
  }
  throw new Error('waitFor timed out after ' + timeoutMs + 'ms');
}
