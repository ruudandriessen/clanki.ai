import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function getDataDirectory(): string {
  const directory = path.join(os.homedir(), "clanki");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
