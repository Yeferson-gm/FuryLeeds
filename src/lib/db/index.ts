import type { SQL } from 'bun';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';
import { authSchema } from './auth-schema';
import * as crmSchema from './crm-schema';
import * as crmRelations from './relations';

export const schema = {
  ...authSchema,
  ...crmSchema,
  ...crmRelations,
};

type Database = BunSQLDatabase<typeof schema>;
type RuntimeState = { client: SQL; database: Database };

const globalForDatabase = globalThis as typeof globalThis & {
  crmDatabase?: RuntimeState;
};

function runtime(): RuntimeState {
  if (globalForDatabase.crmDatabase) return globalForDatabase.crmDatabase;
  if (typeof Bun === 'undefined') {
    throw new Error('La base de datos requiere ejecutar la aplicación con Bun');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL no está configurada');

  const client = new Bun.SQL({
    url: connectionString,
    max: 10,
    idleTimeout: 30,
    connectionTimeout: 5,
  });
  const { drizzle } =
    require('drizzle-orm/bun-sql') as typeof import('drizzle-orm/bun-sql');
  const database = drizzle(client, { schema });
  const state = { client, database };
  globalForDatabase.crmDatabase = state;
  return state;
}

export async function closeDatabase(): Promise<void> {
  const state = globalForDatabase.crmDatabase;
  if (!state) return;

  delete globalForDatabase.crmDatabase;
  await state.client.close();
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const value = Reflect.get(runtime().database, property);
    return typeof value === 'function' ? value.bind(runtime().database) : value;
  },
});

export const sqlClient = new Proxy((() => undefined) as unknown as SQL, {
  apply(_target, thisArg, argumentsList) {
    return Reflect.apply(runtime().client, thisArg, argumentsList);
  },
  get(_target, property) {
    const value = Reflect.get(runtime().client, property);
    return typeof value === 'function' ? value.bind(runtime().client) : value;
  },
});
