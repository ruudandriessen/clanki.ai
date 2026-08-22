import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { ensureSchema } from "./ensure-schema";
import * as schema from "./schema";
import { getSqlitePath } from "./sqlite-path";

export type AppDb = LibSQLDatabase<typeof schema>;

type DbClientCacheEntry = {
  path: string;
  dbPromise: Promise<AppDb>;
};

type GlobalWithDbCache = typeof globalThis & {
  __clankiDbClientCache?: DbClientCacheEntry;
};

const globalWithDbCache = globalThis as GlobalWithDbCache;

async function createDb(sqlitePath: string): Promise<AppDb> {
  const client: Client = createClient({ url: `file:${sqlitePath}` });
  await ensureSchema(client);
  return drizzle({ client, schema });
}

export function getDb(): Promise<AppDb> {
  const sqlitePath = getSqlitePath();
  const cached = globalWithDbCache.__clankiDbClientCache;
  if (cached && cached.path === sqlitePath) {
    return cached.dbPromise;
  }

  const dbPromise = createDb(sqlitePath);
  globalWithDbCache.__clankiDbClientCache = { path: sqlitePath, dbPromise };
  return dbPromise;
}
