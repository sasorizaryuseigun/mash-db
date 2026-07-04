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
  constructor(expected: string, received: string) {
    super(`Group ID mismatch: expected ${expected}, received ${received}`);
    this.name = 'GroupIdMismatchError';
  }
}
