import { oc, z } from "./common";

export const installationSchema = z.object({
  installationId: z.number(),
  accountLogin: z.string(),
  accountType: z.string(),
  createdAt: z.number(),
  deletedAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
});

export const gitHubRepoSchema = z.object({
  id: z.number(),
  fullName: z.string(),
  name: z.string(),
  htmlUrl: z.string(),
  private: z.boolean(),
});

export const installationsContract = {
  list: oc.output(z.array(installationSchema)),
  repos: oc
    .input(
      z.object({
        installationId: z.number().int(),
      }),
    )
    .output(z.array(gitHubRepoSchema)),
};

export type Installation = z.infer<typeof installationSchema>;
export type GitHubRepo = z.infer<typeof gitHubRepoSchema>;
