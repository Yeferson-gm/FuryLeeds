import { schema } from '@/lib/db';
import type { WhatsAppDb } from '@/lib/whatsapp/db';

const TABLES = {
  whatsappConfig: schema.whatsappConfig,
  messageTemplates: schema.messageTemplates,
  broadcasts: schema.broadcasts,
  broadcastRecipients: schema.broadcastRecipients,
  contacts: schema.contacts,
  conversations: schema.conversations,
  messages: schema.messages,
  messageReactions: schema.messageReactions,
  flowRuns: schema.flowRuns,
} as const;

export type TableName = keyof typeof TABLES;

function tableName(table: unknown): TableName {
  const found = Object.entries(TABLES).find(([, value]) => value === table);
  if (!found) throw new Error('Unexpected table in Drizzle mock');
  return found[0] as TableName;
}

export interface DbCall {
  kind: 'select' | 'insert' | 'update' | 'delete';
  table: TableName;
  values?: unknown;
}

export interface DrizzleFixture {
  select?: Partial<Record<TableName, unknown[][]>>;
  insert?: Partial<Record<TableName, unknown[][]>>;
  update?: Partial<Record<TableName, unknown[][]>>;
  insertErrors?: Partial<Record<TableName, unknown[]>>;
  transactionError?: unknown;
}

function nextRows(
  source: Partial<Record<TableName, unknown[][]>> | undefined,
  table: TableName
): unknown[] {
  const queue = source?.[table];
  if (!queue?.length) return [];
  return queue.length === 1 ? queue[0] : (queue.shift() ?? []);
}

function thenable<T extends object>(builder: T, rows: () => unknown[]): T {
  return Object.assign(builder, {
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally PromiseLike.
    then(
      resolve: (value: unknown[]) => unknown,
      reject: (error: unknown) => unknown
    ) {
      return Promise.resolve(rows()).then(resolve, reject);
    },
  });
}

export function createDrizzleMock(fixture: DrizzleFixture = {}) {
  const calls: DbCall[] = [];

  const database: Record<string, unknown> = {
    select() {
      let table: TableName;
      const builder = thenable(
        {
          from(value: unknown) {
            table = tableName(value);
            calls.push({ kind: 'select', table });
            return builder;
          },
          where() {
            return builder;
          },
          innerJoin() {
            return builder;
          },
          leftJoin() {
            return builder;
          },
          orderBy() {
            return builder;
          },
          limit() {
            return Promise.resolve(nextRows(fixture.select, table));
          },
        },
        () => nextRows(fixture.select, table)
      );
      return builder;
    },
    insert(value: unknown) {
      const table = tableName(value);
      const call: DbCall = { kind: 'insert', table };
      calls.push(call);
      const builder = thenable(
        {
          values(values: unknown) {
            call.values = values;
            const errors = fixture.insertErrors?.[table];
            if (errors?.length) throw errors.shift();
            return builder;
          },
          onConflictDoNothing() {
            return builder;
          },
          onConflictDoUpdate() {
            return builder;
          },
          returning() {
            return Promise.resolve(nextRows(fixture.insert, table));
          },
        },
        () => nextRows(fixture.insert, table)
      );
      return builder;
    },
    update(value: unknown) {
      const table = tableName(value);
      const call: DbCall = { kind: 'update', table };
      calls.push(call);
      const builder = thenable(
        {
          set(values: unknown) {
            call.values = values;
            return builder;
          },
          where() {
            return builder;
          },
          returning() {
            return Promise.resolve(nextRows(fixture.update, table));
          },
        },
        () => nextRows(fixture.update, table)
      );
      return builder;
    },
    delete(value: unknown) {
      const table = tableName(value);
      const call: DbCall = { kind: 'delete', table };
      calls.push(call);
      const builder = thenable(
        {
          where() {
            return builder;
          },
        },
        () => []
      );
      return builder;
    },
    async transaction(callback: (tx: unknown) => Promise<unknown>) {
      if (fixture.transactionError) throw fixture.transactionError;
      return callback(database);
    },
    execute() {
      return Promise.resolve([]);
    },
  };

  return { db: database as unknown as WhatsAppDb, calls };
}
