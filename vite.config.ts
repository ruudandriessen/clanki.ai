import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { Readable } from "node:stream";
import basicSsl from "@vitejs/plugin-basic-ssl";

const DEV_API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:8787";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  if (typeof error === "object" && error !== null) {
    const maybeError = error as { name?: string; code?: string };
    return maybeError.name === "AbortError" || maybeError.code === "ABORT_ERR";
  }
  return false;
}

function devApiProxyPlugin(target: string): Plugin {
  return {
    name: "dev-api-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api")) {
          next();
          return;
        }

        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value === undefined) {
            continue;
          }
          if (key.startsWith(":") || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            continue;
          }
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        // Keep upstream responses uncompressed so fetch/body/header stay consistent.
        headers.set("accept-encoding", "identity");

        const abortController = new AbortController();
        const abortProxyRequest = () => {
          if (!abortController.signal.aborted) {
            abortController.abort();
          }
        };
        req.once("aborted", abortProxyRequest);
        res.once("close", abortProxyRequest);

        const requestInit: RequestInit & { duplex?: "half" } = {
          method: req.method,
          headers,
          redirect: "manual",
          signal: abortController.signal,
        };

        if (req.method !== "GET" && req.method !== "HEAD") {
          requestInit.body = req as unknown as BodyInit;
          requestInit.duplex = "half";
        }

        try {
          const response = await fetch(new URL(url, target), requestInit);

          res.statusCode = response.status;
          for (const [key, value] of response.headers.entries()) {
            const normalizedKey = key.toLowerCase();
            if (
              normalizedKey.startsWith(":") ||
              normalizedKey === "set-cookie" ||
              normalizedKey === "content-encoding" ||
              normalizedKey === "content-length" ||
              HOP_BY_HOP_HEADERS.has(normalizedKey)
            ) {
              continue;
            }
            res.setHeader(key, value);
          }

          const setCookies = response.headers.getSetCookie?.() ?? [];
          if (setCookies.length > 0) {
            res.setHeader("set-cookie", setCookies);
          }

          if (!response.body) {
            res.end();
            return;
          }

          const upstreamBody = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
          upstreamBody.on("error", (streamError) => {
            if (isAbortError(streamError) || abortController.signal.aborted || res.destroyed) {
              if (!res.writableEnded) {
                res.end();
              }
              return;
            }
            next(streamError);
          });
          upstreamBody.pipe(res);
        } catch (error) {
          if (isAbortError(error) && abortController.signal.aborted) {
            return;
          }
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  root: "frontend",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./frontend/src", import.meta.url)),
    },
  },
  plugins: [
    tanstackRouter({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    devApiProxyPlugin(DEV_API_TARGET),
    basicSsl(),
  ],
  server: {
    https: {},
  },
});
