import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listOpencodeModels } from "@/server/lib/list-opencode-models";

export const listTaskOpencodeModels = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      directory: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    return await listOpencodeModels({ directory: data.directory });
  });
