export type TableSchema = {
  primaryKey: string;
};

export type SyncOptions = {
  discovery?: boolean;
  transport?: boolean;
  port?: number;
  serviceType?: string;
  peerId?: string;
};

export type CreateLanSyncDbOptions = {
  groupKey: string;
  dir: string;
  tables: Record<string, TableSchema>;
  sync?: SyncOptions;
};

export type PeerInfo = {
  peerId: string;
  groupId: string;
  state: 'connected';
};

export type LanSyncDb = {
  peerId: string;
  groupId: string;
  port: number | undefined;
  table(name: string): TableHandle;
  connect(host: string, port: number): Promise<void>;
  getPeers(): PeerInfo[];
  close(): Promise<void>;
};

export type TableHandle = {
  insert(row: Record<string, unknown>): Promise<void>;
  upsert(row: Record<string, unknown>): Promise<void>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<Record<string, unknown> | undefined>;
  findAll(): Promise<Record<string, unknown>[]>;
};

export type GroupIdentity = {
  groupKey: string;
  groupId: string;
};

export type HelloMessage = {
  type: 'hello';
  groupId: string;
  peerId: string;
  protocol: number;
};
