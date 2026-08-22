import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getMigrationsFolder } from "./migrations-folder";
import * as schema from "./schema";
import { getSqlitePath } from "./sqlite-path";
import { reapStaleAiRuns } from "@/server/lib/reap-stale-ai-runs";

export type AppDb = LibSQLDatabase<typeof schema>;

type DbClientCacheEntry = {
  path: string;
  dbPromise: Promise<AppDb>;
};

type GlobalWithDbCache = typeof globalThis & {
  __clankiDbClientCache?: DbClientCacheEntry;
  __clankiDbStartupDone?: boolean;
};

const globalWithDbCache = globalThis as GlobalWithDbCache;

async function createDb(sqlitePath: string): Promise<AppDb> {
  const client: Client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await client.execute("PRAGMA foreign_keys = ON");
  if (!globalWithDbCache.__clankiDbStartupDone) {
    await reapStaleAiRuns(db);
    globalWithDbCache.__clankiDbStartupDone = true;
  }
  return db;
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
