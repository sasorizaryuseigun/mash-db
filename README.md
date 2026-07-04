# MeshDB

LAN内自動同期つき組み込みテーブルDBです。Node.jsアプリケーションに組み込んで使います。

## 特徴

- CRUD: テーブル単位の挿入・更新・削除・検索
- LAN同期： 同一LAN内のpeerをmDNSで自動発見し、データを同期する
- 後追い参加： 後から起動したpeerも既存peerに追いつける
- 永続化： ローカルファイルへの自動保存、再起動後も状態維持
- グループ管理： `groupKey`で同期グループを区別し、異なるグループのpeerは無視する
- 単一バイナリ対応： native addon不使用、Bun `bun build --compile`で動作

## インストール

```bash
npm install lan-sync-db
# または
pnpm add lan-sync-db
```

## クイックスタート

```ts
import { createLanSyncDb } from 'lan-sync-db';

const db = await createLanSyncDb({
  groupKey: process.env.LAN_SYNC_GROUP_KEY!,
  dir: './data/demo-db',
  tables: {
    users: { primaryKey: 'uid' },
    sessions: { primaryKey: 'id' },
  },
});

// 書き込み
await db.table('users').upsert({
  uid: 'mk24taro',
  displayName: 'Taro Yamada',
});

// 読み込み
const users = await db.table('users').findAll();

// 手動で他peerに接続（mDNSがない環境でも可）
await db.connect('192.168.1.100', 9876);

// 終了
await db.close();
```

## API

### `createLanSyncDb(options)`

```ts
type Options = {
  groupKey: string; // 同期グループ識別キー（SHA-256ハッシュでgroupIdに変換される）
  dir: string; // 永続化ディレクトリ
  tables: Record<string, { primaryKey: string }>;
  sync?: {
    discovery?: boolean; // mDNS自動発見（デフォルト: true）
    transport?: boolean; // WebSocketサーバー起動（デフォルト: true）
    port?: number; // WebSocketサーバーポート（0は空きポート、指定なければ0扱い）
    serviceType?: string; // mDNS service type（デフォルト: '_lan-sync-db._tcp'）
    peerId?: string; // 永続peerIdの明示設定（指定時はpeer-idファイルに保存される）
  };
};
```

### LanSyncDb

```ts
type LanSyncDb = {
  peerId: string; // このpeerのID（永続化される）
  groupId: string; // groupKeyのSHA-256ハッシュ
  port: number | undefined; // WebSocketサーバーポート（transport:false時はundefined）
  table(name: string): TableHandle; // テーブルハンドルの取得
  connect(host: string, port: number): Promise<void>; // 他peerへ手動接続（transport:false時は呼び出せない）
  getPeers(): PeerInfo[]; // 接続済みpeer一覧
  close(): Promise<void>; // 全リソース解放
};
```

### TableHandle

```ts
type TableHandle = {
  insert(row: Record<string, unknown>): Promise<void>; // 挿入（PK重複でエラー）
  upsert(row: Record<string, unknown>): Promise<void>; // 挿入または上書き
  update(id: string, patch: Record<string, unknown>): Promise<void>; // 部分更新
  delete(id: string): Promise<void>; // 削除
  get(id: string): Promise<Record<string, unknown> | undefined>; // 取得
  findAll(): Promise<Record<string, unknown>[]>; // 全件取得
};
```

### Errors

各メソッドは以下のエラーをthrowすることがあります。`instanceof`で判別できます。

| エラークラス             | 発生条件                                   |
| ------------------------ | ------------------------------------------ |
| `PrimaryKeyMissingError` | `insert`/`upsert`にprimary keyが含まれない |
| `RowAlreadyExistsError`  | `insert`で既存のprimary keyと重複          |
| `RowNotFoundError`       | `update`で存在しない行を指定               |
| `GroupIdMismatchError`   | 異なる`groupKey`のpeerに接続しようとした   |

## アーキテクチャ

```text
createLanSyncDb()
  ↓
LanSyncDb facade
  ├── TinyBase MergeableStore  ─── テーブル管理・CRUD
  ├── FilePersister             ─── store.jsonへの永続化
  ├── PeerManager               ─── peer接続管理・Synchronizer生成
  │    └── createCustomSynchronizer  ─── データ同期プロトコル
  ├── Transport (WebSocket)     ─── hello handshake + メッセージ配送
  └── Discovery (mDNS)          ─── 同一LAN内peer発見
```

車輪の再発明を避け、次の既存ライブラリを活用しています。

| 領域           | ライブラリ                          |
| -------------- | ----------------------------------- |
| データモデル   | TinyBase `MergeableStore`           |
| 永続化         | TinyBase `FilePersister`            |
| 同期プロトコル | TinyBase `createCustomSynchronizer` |
| LAN発見        | `bonjour-service`                   |
| トランスポート | `ws`                                |
| ハッシュ       | Node.js標準`crypto`                 |

自前実装は「LAN peer discovery」「peer接続管理」「hello handshake」「CRUD facade」の4点のみです。

## 同期の流れ

1. 各peerがWebSocketサーバーを起動します
2. mDNSで同一`groupId`のpeerを発見します
3. 発見されたpeerへWebSocket接続します
4. helloメッセージで`groupId`・`peerId`を交換します
5. `createCustomSynchronizer`でMergeableStoreの同期を開始します
6. 以降、データ変更はTinyBaseの同期プロトコルで自動的にpeer間を伝搬します

## 永続化

起動時に指定した`dir`配下には次のファイルを作成します。

```text
<dir>/
  peer-id      # peer識別子（再起動後も同一）
  store.json   # TinyBaseの永続化状態
```

`peer-id`は初回起動時に自動生成され、2回目以降は同じIDで参加します。`sync.peerId`を指定した場合は、その値が`peer-id`ファイルに保存され、以降も同一IDが使われます。

## 開発

```bash
# ビルド
pnpm build

# テスト
pnpm test

# ウォッチ
pnpm test:watch
```
