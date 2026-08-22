import { resolve } from "node:path";
import { defineConfig } from "vite";

const externalDependencies = ["commander", "minimatch", "typescript"];

export default defineConfig({
  build: {
    ssr: true,
    target: "node20",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      input: {
        bin: resolve(import.meta.dirname, "bin.ts"),
        index: resolve(import.meta.dirname, "index.ts"),
      },
      external: externalDependencies,
      output: {
        format: "es",
        entryFileNames: "[name].js",
        banner: (chunkInfo) => (chunkInfo.name === "bin" ? "#!/usr/bin/env node" : ""),
      },
    },
  },
});
