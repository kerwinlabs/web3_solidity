import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const CURSOR_KEY = 'transfer_cursor';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp INTEGER,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers (from_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers (to_address, block_number DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * ERC20 Transfer 事件索引的 SQLite 存储。
 *
 * - transfers：每条 Transfer 一行，金额以十进制字符串保存，避免 uint256 精度丢失；
 * - sync_state：保存已索引到的区块号，重启后从下一个区块继续。
 */
export class TransferIndex {
  constructor(dbPath) {
    const path = dbPath === ':memory:' ? dbPath : resolve(dbPath);
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);

    this.insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO transfers (
        tx_hash, log_index, block_number, block_timestamp,
        from_address, to_address, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    this.cursorStmt = this.db.prepare('SELECT value FROM sync_state WHERE key = ?');
    this.upsertCursorStmt = this.db.prepare(`
      INSERT INTO sync_state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  /** 已索引到的区块号；还没有索引过则返回 null。 */
  getCursor() {
    const row = this.cursorStmt.get(CURSOR_KEY);
    return row ? Number(row.value) : null;
  }

  /**
   * 在一个事务中写入一批 Transfer，并把游标推进到 toBlock。
   * @returns {number} 实际新增的行数（重复事件会被忽略）
   */
  saveBatch(rows, toBlock) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let inserted = 0;
      for (const row of rows) {
        const result = this.insertStmt.run(
          row.txHash,
          row.logIndex,
          row.blockNumber,
          row.blockTimestamp,
          row.fromAddress,
          row.toAddress,
          row.amount,
        );
        inserted += Number(result.changes);
      }
      this.upsertCursorStmt.run(CURSOR_KEY, String(toBlock));
      this.db.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * 查询某个地址的转账记录（from 或 to 命中）。
   * @param {{ address: string, direction?: 'all'|'in'|'out', limit?: number, offset?: number }} options
   */
  getTransfers({ address, direction = 'all', limit = 50, offset = 0 }) {
    let where;
    let params;
    if (direction === 'in') {
      where = 'to_address = ?';
      params = [address];
    } else if (direction === 'out') {
      where = 'from_address = ?';
      params = [address];
    } else {
      where = '(from_address = ? OR to_address = ?)';
      params = [address, address];
    }

    const { count } = this.db
      .prepare(`SELECT COUNT(*) AS count FROM transfers WHERE ${where}`)
      .get(...params);

    const rows = this.db
      .prepare(`
        SELECT
          tx_hash AS txHash,
          log_index AS logIndex,
          block_number AS blockNumber,
          block_timestamp AS blockTimestamp,
          from_address AS fromAddress,
          to_address AS toAddress,
          amount
        FROM transfers
        WHERE ${where}
        ORDER BY block_number DESC, log_index DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    return { total: Number(count), rows };
  }

  close() {
    this.db.close();
  }
}
