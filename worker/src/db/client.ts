import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type AppDb = PostgresJsDatabase<typeof schema>;

type DbEnv = {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
  ENVIRONMENT?: string;
};

export function getDb(env: DbEnv): AppDb {
  const url = env.DATABASE_URL ?? env.HYPERDRIVE?.connectionString;
  if (!url) {
    throw new Error("Database connection string is missing");
  }

  const sql = postgres(url, {
    fetch_types: false,
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return drizzle({ client: sql, schema });
}
