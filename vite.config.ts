import { defineConfig, lazyPlugins } from "vite-plus";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  defaultPackage: ".",
  fmt: {
    ignorePatterns: ["dist/", "node_modules/", ".vercel/", ".astro/", "release/"],
  },
  lint: {
    plugins: ["typescript", "react", "import", "unicorn"],
    categories: {
      correctness: "warn",
      suspicious: "warn",
    },
    env: {
      browser: true,
    },
    globals: {
      Bun: "readonly",
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "import/no-unassigned-import": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    ignorePatterns: ["dist/", "node_modules/", ".vercel/", ".astro/", "release/"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["packages/runner/**", "packages/desktop-shell/**", "packages/ast-agent/**"],
        env: { node: true, browser: false },
      },
      {
        files: ["packages/marketing/**"],
        env: { node: true, browser: false },
      },
      {
        files: ["**/*.test.ts"],
        rules: {
          "typescript/no-explicit-any": "off",
        },
      },
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  staged: {
    "*": "vp check --fix",
  },
  run: {
    tasks: {
      typecheck: {
        command: "tsc --noEmit",
      },
    },
  },
  plugins: lazyPlugins(() => [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({}),
    nitro(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ]),
});
