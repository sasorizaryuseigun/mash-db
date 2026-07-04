// SPDX-License-Identifier: AGPL-3.0-only

export class PrimaryKeyMissingError extends Error {
  constructor(key: string) {
    super(`Missing required primary key: ${key}`);
    this.name = 'PrimaryKeyMissingError';
  }
}

export class RowAlreadyExistsError extends Error {
  constructor(id: string) {
    super(`Row already exists: ${id}`);
    this.name = 'RowAlreadyExistsError';
  }
}

export class RowNotFoundError extends Error {
  constructor(id: string) {
    super(`Row not found: ${id}`);
    this.name = 'RowNotFoundError';
  }
}

export class GroupIdMismatchError extends Error {
  constructor(expected: string | undefined, received: string | undefined) {
    super(
      `Group ID mismatch: expected ${expected ?? '(none)'}, received ${received ?? '(none)'}`,
    );
    this.name = 'GroupIdMismatchError';
  }
}
