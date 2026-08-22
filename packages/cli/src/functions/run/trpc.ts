import { initTRPC } from "@trpc/server";
import type { ClankiUiRuntime } from "../ui-runtime";

export interface RunTrpcContext {
  runtime: ClankiUiRuntime;
}

export const t = initTRPC.context<RunTrpcContext>().create();

export function createRunTrpcContext(runtime: ClankiUiRuntime): RunTrpcContext {
  return { runtime };
}
