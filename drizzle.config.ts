import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./worker/migrations",
  schema: "./worker/src/db/schema.ts",
  dialect: "sqlite",
});
