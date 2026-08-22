import { createServerFn } from "@tanstack/react-start";
import { getGhCliStatus } from "@/lib/external-clis/gh";
import { getOpencodeCliStatus } from "@/lib/external-clis/opencode";

export const getCliStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    gh: getGhCliStatus(),
    opencode: getOpencodeCliStatus(),
  };
});
