// SPDX-License-Identifier: AGPL-3.0-only

import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import type { TableSchema, TableHandle } from './types.js';
import {
  PrimaryKeyMissingError,
  RowAlreadyExistsError,
  RowNotFoundError,
} from './errors.js';

type CellValue = string | number | boolean;

export type StoreHandle = {
  store: MergeableStore;
  table(name: string): TableHandle;
};

export function createStore(tables: Record<string, TableSchema>): StoreHandle {
  const store = createMergeableStore();

  function getTableHandle(tableName: string): TableHandle {
    const schema = tables[tableName];
    if (!schema) {
      throw new Error(`Unknown table: ${tableName}`);
    }

    return {
      async insert(row) {
        const pkValue = extractPk(row, schema);
        if (store.hasRow(tableName, pkValue)) {
          throw new RowAlreadyExistsError(pkValue);
        }
        store.setRow(tableName, pkValue, toCells(row));
      },

      async upsert(row) {
        const pkValue = extractPk(row, schema);
        store.setRow(tableName, pkValue, toCells(row));
      },

      async update(id, patch) {
        const existing = store.getRow(tableName, id);
        if (!existing || Object.keys(existing).length === 0) {
          throw new RowNotFoundError(id);
        }
        const { [schema.primaryKey]: _primaryKey, ...safePatch } = patch;
        store.setRow(tableName, id, toCells({ ...existing, ...safePatch }));
      },

      async delete(id) {
        store.delRow(tableName, id);
      },

      async get(id) {
        const row = store.getRow(tableName, id);
        if (!row || Object.keys(row).length === 0) return undefined;
        return row as Record<string, unknown>;
      },

      async findAll() {
        const table = store.getTable(tableName);
        return Object.values(table).map(
          (row) => row as Record<string, unknown>,
        );
      },
    };
  }

  return { store, table: getTableHandle };
}

function extractPk(row: Record<string, unknown>, schema: TableSchema): string {
  const value = row[schema.primaryKey];
  if (value == null || value === '') {
    throw new PrimaryKeyMissingError(schema.primaryKey);
  }
  return String(value);
}

function toCells(row: Record<string, unknown>): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      cells[key] = value;
    } else {
      console.warn(
        `[mesh-db] Non-scalar value for cell "${key}": ${typeof value}. Only string, number, and boolean are supported. Skipping.`,
      );
    }
  }
  return cells;
}
