import { createMiddleware } from "@tanstack/react-start";
import { getDb } from "./db/client";

export const dbMiddleware = createMiddleware().server(async ({ next }) => {
  return next({ context: { db: await getDb() } });
});
