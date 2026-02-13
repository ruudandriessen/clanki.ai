import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL as any;

export default defineConfig({
  out: "./worker/migrations-postgres",
  schema: "./worker/src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
