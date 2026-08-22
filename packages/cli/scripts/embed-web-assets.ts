import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const cliDirectory = path.resolve(import.meta.dirname, "..");
const webDistDirectory = path.resolve(cliDirectory, "../web/dist");
const bundledWebDistDirectory = path.resolve(cliDirectory, "dist/web-dist");

async function main(): Promise<void> {
  await ensureWebDistExists(webDistDirectory);
  await mkdir(path.resolve(cliDirectory, "dist"), { recursive: true });
  await rm(bundledWebDistDirectory, { recursive: true, force: true });
  await cp(webDistDirectory, bundledWebDistDirectory, { recursive: true });
}

async function ensureWebDistExists(distDirectory: string): Promise<void> {
  try {
    await access(path.resolve(distDirectory, "index.html"));
  } catch {
    throw new Error(
      "Missing packages/web/dist. Build web assets first (for example: `bun run --cwd packages/web build`).",
    );
  }
}

await main();
