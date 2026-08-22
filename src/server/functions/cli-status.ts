import { createServerFn } from "@tanstack/react-start";
import { getGhCliStatus } from "@/server/lib/gh-cli-status";
import { getOpencodeCliStatus } from "@/server/lib/opencode-cli-status";
import type { CliStatus } from "@/shared/cli-status";

export const getCliStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<CliStatus> => {
    return {
      gh: getGhCliStatus(),
      opencode: getOpencodeCliStatus(),
    };
  },
);
