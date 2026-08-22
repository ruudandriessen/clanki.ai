import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { AppDb } from "./client";

type DbSchema = typeof import("./schema");

export type Tx = SQLiteTransaction<
  "async",
  unknown,
  DbSchema,
  ExtractTablesWithRelations<DbSchema>
>;

export async function withTransaction<T>(db: AppDb, callback: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => callback(tx as Tx));
}
