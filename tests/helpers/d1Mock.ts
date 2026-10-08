interface DatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): { changes?: number; lastInsertRowid?: number | bigint } | void;
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
}

export function createD1Mock(db: DatabaseSyncInstance): D1Database {
  const d1Instance: D1Database = {
    prepare(query: string) {
      let boundArgs: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          boundArgs = args;
          return this;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const stmt = db.prepare(query);
          const row = stmt.get(...boundArgs) as Record<string, unknown> | undefined;
          if (!row) return null;
          if (colName) return row[colName] as T;
          return row as T;
        },
        async all<T = unknown>(): Promise<D1Result<T>> {
          const stmt = db.prepare(query);
          const results = stmt.all(...boundArgs) as T[];
          return {
            results,
            success: true,
            meta: {
              duration: 1,
              rows_read: results.length,
              rows_written: 0,
              last_row_id: 0,
              changes: 0,
              served_by: 'local-test-sqlite',
              size_after: 0,
              changed_db: false,
            },
          };
        },
        async run(): Promise<D1Response> {
          const stmt = db.prepare(query);
          const runRes = stmt.run(...boundArgs) as { changes?: number; lastInsertRowid?: number | bigint } | undefined;
          const changes = typeof runRes?.changes === 'number' ? runRes.changes : 1;
          const lastRowId = typeof runRes?.lastInsertRowid === 'number' ? runRes.lastInsertRowid : Number(runRes?.lastInsertRowid ?? 0);
          return {
            success: true,
            meta: {
              duration: 1,
              rows_read: 0,
              rows_written: changes,
              last_row_id: lastRowId,
              changes: changes,
              served_by: 'local-test-sqlite',
              size_after: 0,
              changed_db: changes > 0,
            },
          };
        },
      } as unknown as D1PreparedStatement;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        results.push(await stmt.all<T>());
      }
      return results;
    },
    async exec(query: string): Promise<D1ExecResult> {
      db.exec(query);
      return { count: 1, duration: 1 };
    },
    withSession(_token?: string): D1DatabaseSession {
      return {
        ...d1Instance,
        getBookmark(): string | null {
          return null;
        },
      } as unknown as D1DatabaseSession;
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error('Not implemented in mock');
    },
  };

  return d1Instance;
}
