export type GhCliStatus =
  | { status: "not-setup" }
  | { status: "setup"; version: string }
  | { status: "setup-no-auth"; version: string };

export type OpencodeCliStatus = { status: "not-setup" } | { status: "setup"; version: string };

export type CliStatus = {
  gh: GhCliStatus;
  opencode: OpencodeCliStatus;
};
