import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type AppDb = PostgresJsDatabase<typeof schema>;

type DbEnv = {
  DATABASE_URL: string;
};

const dbCache = new Map<string, AppDb>();

export function getDb(env: DbEnv): AppDb {
  const databaseUrl = env.DATABASE_URL;
  const cached = dbCache.get(databaseUrl);
  if (cached) {
    return cached;
  }

  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(sql, { schema });
  dbCache.set(databaseUrl, db);

  return db;
}
