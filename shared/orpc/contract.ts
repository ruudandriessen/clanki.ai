import { installationsContract } from "./contract/installations";
import { projectsContract } from "./contract/projects";
import { settingsContract } from "./contract/settings";
import { tasksContract } from "./contract/tasks";

export const apiContract = {
  installations: installationsContract,
  projects: projectsContract,
  tasks: tasksContract,
  settings: settingsContract,
};

export {
  gitHubRepoSchema,
  installationSchema,
  type GitHubRepo,
  type Installation,
} from "./contract/installations";
export {
  createProjectInputSchema,
  projectSchema,
  type CreateProjectInput,
  type Project,
} from "./contract/projects";
export {
  providerCredentialStatusSchema,
  providerOauthStartSchema,
  type ProviderCredentialStatus,
  type ProviderOauthStart,
} from "./contract/settings";
export {
  createTaskInputSchema,
  createTaskMessageInputSchema,
  taskMessageSchema,
  taskRunSchema,
  taskSchema,
  type CreateTaskInput,
  type CreateTaskMessageInput,
  type Task,
  type TaskMessage,
  type TaskRun,
} from "./contract/tasks";
