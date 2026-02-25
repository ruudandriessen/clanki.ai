import { Readable } from "node:stream";

type AppServer = {
  fetch(request: Request): Promise<Response>;
};

let appServerPromise: Promise<AppServer> | null = null;

async function loadServer(): Promise<AppServer> {
  if (!appServerPromise) {
    // @ts-expect-error - generated at build time by `vite build`
    appServerPromise = import("../dist/server/server.js").then((mod) => mod.default as AppServer);
  }

  return appServerPromise;
}

function collectBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function toRequest(req: any): Promise<Request> {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const host = String(req.headers.host ?? "localhost");
  const url = `${proto}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, String(item));
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const method = String(req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  if (!hasBody) {
    return new Request(url, { method, headers });
  }

  const body = await collectBody(req);
  return new Request(url, { method, headers, body });
}

async function sendResponse(res: any, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const nodeStream = Readable.fromWeb(response.body as any);
    nodeStream.on("error", reject);
    res.on("error", reject);
    res.on("finish", resolve);
    nodeStream.pipe(res);
  });
}

export default async function handler(req: any, res: any) {
  try {
    const appServer = await loadServer();
    const request = await toRequest(req);
    const response = await appServer.fetch(request);
    await sendResponse(res, response);
  } catch (error) {
    console.error("Failed to handle request", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
