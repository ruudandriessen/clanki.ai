import { oc } from "@orpc/contract";
import { z } from "zod";

export const txidSchema = z.number().int().nonnegative();

export const mutationResultSchema = <TData extends z.ZodTypeAny>(data: TData) =>
  z.object({
    data,
    txid: txidSchema.optional(),
  });

export { oc, z };
