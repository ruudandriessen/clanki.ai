import { getDb } from "@/server/db/client";
import { sqliteStream } from "@/server/lib/sqlite-stream-durability";

type SqliteStreamInit = {
  runId: string;
  offset?: string | null;
};

export function taskChatDurability(source: Request | SqliteStreamInit) {
  return sqliteStream(source, getDb);
}
