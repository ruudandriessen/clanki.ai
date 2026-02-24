import { type ExtractTablesWithRelations, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { AppDb } from "./client";

type DbSchema = typeof import("./schema");

export type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  DbSchema,
  ExtractTablesWithRelations<DbSchema>
>;

async function getTxId(tx: Tx): Promise<number> {
  // We need the raw 32-bit xid so it matches values used by Electric replication.
  const result = await tx.execute(
    sql<{ txid: string }>`select pg_current_xact_id()::xid::text as txid`,
  );
  const txid = (result[0] as { txid: string } | undefined)?.txid;
  if (txid === undefined) {
    throw new Error("Failed to resolve postgres txid");
  }

  const parsedTxid = Number.parseInt(txid, 10);
  if (!Number.isFinite(parsedTxid)) {
    throw new Error("Failed to resolve postgres txid");
  }

  return parsedTxid;
}

export async function withTransaction<T>(
  db: AppDb,
  callback: (tx: Tx, txid: number) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const typedTx = tx as Tx;
    const txid = await getTxId(typedTx);
    return callback(typedTx, txid);
  });
}
