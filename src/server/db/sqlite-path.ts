import path from "node:path";
import { getDataDirectory } from "./data-directory";

export function getSqlitePath(): string {
  return path.join(getDataDirectory(), "clanki.db");
}
