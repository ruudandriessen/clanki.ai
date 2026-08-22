import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUiRuntime, type ClankiUiRuntime } from "./ui-runtime";
import { handleTrpcRequest } from "./run/trpc-handler";

export interface RunOptions {
  config: string;
  host: string;
  open: boolean;
  port: number;
  project: string;
  webDist?: string;
}

interface ResolvedWebAssets {
  distDirectory: string;
}

export async function run(options: RunOptions): Promise<void> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const resolvedConfigPath = path.resolve(options.config);
  const resolvedProjectPath = path.resolve(options.project);
  const webAssets = await resolveWebAssets({
    explicitWebDist: options.webDist,
    moduleDirectory,
  });
  const runtime = createUiRuntime({
    configPath: resolvedConfigPath,
    projectPath: resolvedProjectPath,
  });

  await runtime.initialize();

  const server = Bun.serve({
    fetch: async (request) => handleRequest(request, runtime, webAssets.distDirectory),
    hostname: options.host,
    port: options.port,
  });

  const address = `http://${options.host}:${server.port}`;
  process.stdout.write(`clanki UI running at ${address}\n`);
  process.stdout.write("Press Ctrl+C to stop.\n");

  if (options.open) {
    void openBrowser(address);
  }

  await new Promise<void>((resolve) => {
    const stop = () => {
      void server.stop(true);
      process.stdout.write("clanki UI stopped.\n");
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function handleRequest(
  request: Request,
  runtime: ClankiUiRuntime,
  webDistDirectory: string,
): Promise<Response> {
  const trpcResponse = await handleTrpcRequest(runtime, request);
  if (trpcResponse !== null) {
    return trpcResponse;
  }

  const url = new URL(request.url);
  return serveWebAsset(url.pathname, webDistDirectory);
}

async function resolveWebAssets(options: {
  explicitWebDist?: string;
  moduleDirectory: string;
}): Promise<ResolvedWebAssets> {
  const bundledWebDist = path.resolve(options.moduleDirectory, "../web-dist");
  const developmentWebDist = path.resolve(options.moduleDirectory, "../../../web/dist");
  const distCandidates = uniquePaths([
    options.explicitWebDist !== undefined ? path.resolve(options.explicitWebDist) : null,
    process.env.CLANKI_WEB_DIST !== undefined && process.env.CLANKI_WEB_DIST !== ""
      ? path.resolve(process.env.CLANKI_WEB_DIST)
      : null,
    bundledWebDist,
    developmentWebDist,
  ]);

  for (const distDirectory of distCandidates) {
    if (await isWebDistDirectory(distDirectory)) {
      return { distDirectory };
    }
  }

  throw new Error(
    "Unable to locate web assets. Provide --web-dist <path> (or CLANKI_WEB_DIST) pointing to a directory containing index.html.",
  );
}

async function serveWebAsset(pathname: string, webDistDirectory: string): Promise<Response> {
  const decodedPathname = decodeURIComponent(pathname);
  const normalizedPathname = decodedPathname === "/" ? "/index.html" : decodedPathname;
  const sanitizedRelativePath = path.posix.normalize(normalizedPathname).replace(/^\/+/, "");
  const directFilePath = path.resolve(webDistDirectory, sanitizedRelativePath);

  if (
    !directFilePath.startsWith(webDistDirectory + path.sep) &&
    directFilePath !== webDistDirectory
  ) {
    return new Response("Not found", { status: 404 });
  }

  const directFile = Bun.file(directFilePath);

  if (await directFile.exists()) {
    return new Response(directFile);
  }

  const indexFile = Bun.file(path.resolve(webDistDirectory, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return new Response("Missing web build output. Run `bun run build`.", { status: 500 });
}

async function isWebDistDirectory(distDirectory: string): Promise<boolean> {
  return await Bun.file(path.resolve(distDirectory, "index.html")).exists();
}

function uniquePaths(paths: Array<string | null | undefined>): string[] {
  return [...new Set(paths.filter((entry): entry is string => Boolean(entry)))];
}

async function openBrowser(url: string): Promise<void> {
  const openCommand = resolveOpenCommand(url);

  if (!openCommand) {
    return;
  }

  const child = spawn(openCommand.command, openCommand.args, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

function resolveOpenCommand(url: string): { command: string; args: string[] } | null {
  if (process.platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  if (process.platform === "linux") {
    return { command: "xdg-open", args: [url] };
  }

  return null;
}
