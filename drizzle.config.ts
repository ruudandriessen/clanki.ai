import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL as any;

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
