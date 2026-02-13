import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./worker/migrations-postgres",
  schema: "./worker/src/db/schema.ts",
  dialect: "postgresql",
});
