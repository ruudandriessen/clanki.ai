import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const cliDirectory = path.resolve(import.meta.dirname, "..");
const webDistDirectory = path.resolve(cliDirectory, "../web/dist");
const bundledWebDistDirectory = path.resolve(cliDirectory, "dist/web-dist");

async function main(): Promise<void> {
  if (!(await hasWebDist(webDistDirectory))) {
    process.stderr.write(
      "Skipping web asset embed: packages/web/dist is not built yet. `clanki run` can still use --web-dist or CLANKI_WEB_DIST.\n",
    );
    return;
  }

  await mkdir(path.resolve(cliDirectory, "dist"), { recursive: true });
  await rm(bundledWebDistDirectory, { recursive: true, force: true });
  await cp(webDistDirectory, bundledWebDistDirectory, { recursive: true });
}

async function hasWebDist(distDirectory: string): Promise<boolean> {
  try {
    await access(path.resolve(distDirectory, "index.html"));
    return true;
  } catch {
    return false;
  }
}

await main();
