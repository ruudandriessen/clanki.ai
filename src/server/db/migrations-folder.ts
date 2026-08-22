import fs from "node:fs";
import path from "node:path";

export function getMigrationsFolder(): string {
  const folder = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(folder)) {
    throw new Error(`Drizzle migrations folder not found at ${folder}`);
  }

  return folder;
}
