import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const targetTriple = resolveTargetTriple();
const bunPath = resolveBunPath();
const sidecarPath = join("src-tauri", "binaries", `bun-${targetTriple}`);

mkdirSync(dirname(sidecarPath), { recursive: true });
copyFileSync(bunPath, sidecarPath);
chmodSync(sidecarPath, 0o755);

if (!existsSync(".output/server/index.mjs")) {
  throw new Error("Missing .output/server/index.mjs. Run `bun run build` first.");
}

if (!existsSync(".output/public")) {
  throw new Error("Missing .output/public. Run `bun run build` first.");
}

console.log(`Prepared Bun sidecar for ${targetTriple} at ${sidecarPath}`);

function resolveTargetTriple() {
  const rustTarget = process.env.CARGO_BUILD_TARGET?.trim();
  if (rustTarget) {
    return rustTarget;
  }

  try {
    return execFileSync("rustc", ["--print", "host-tuple"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return `${mapArch(process.arch)}-${mapPlatform(process.platform)}`;
  }
}

function resolveBunPath() {
  const envPath = process.env.BUN_BINARY?.trim();
  if (envPath) {
    return envPath;
  }

  try {
    return execFileSync("which", ["bun"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("Could not resolve the Bun binary path.");
  }
}

function mapArch(arch) {
  if (arch === "arm64") {
    return "aarch64";
  }

  if (arch === "x64") {
    return "x86_64";
  }

  throw new Error(`Unsupported architecture for Tauri sidecar: ${arch}`);
}

function mapPlatform(platform) {
  if (platform === "darwin") {
    return "apple-darwin";
  }

  throw new Error(`Unsupported platform for Tauri sidecar: ${platform}`);
}
