import { defineConfig } from "drizzle-kit";
import { getSqlitePath } from "./src/server/db/sqlite-path";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: getSqlitePath(),
  },
});
