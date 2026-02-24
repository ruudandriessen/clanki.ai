import { waitUntil } from "@vercel/functions";

export function runInBackground(promise: Promise<unknown>): void {
  try {
    waitUntil(promise);
  } catch {
    void promise;
  }
}
