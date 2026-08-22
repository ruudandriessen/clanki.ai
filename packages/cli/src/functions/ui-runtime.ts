import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAnalysisReport, buildAnalysisReportFromConfig } from "../project";
import type { ClankiConfig } from "../model/config";
import { validateConfig } from "../loadConfig";

export interface ClankiUiRuntimeOptions {
  configPath: string;
  projectPath: string;
}

export interface WriteConfigOptions {
  skipRebuild?: boolean;
}

export interface ClankiUiRuntime {
  initialize: () => Promise<void>;
  getReportError: () => string | null;
  getReportJson: () => string | null;
  readConfig: () => Promise<ClankiConfig>;
  rebuildReport: () => Promise<void>;
  writeConfig: (
    rawConfig: ClankiConfig,
    options?: WriteConfigOptions,
  ) => Promise<{ config: ClankiConfig; rebuildError: string | null }>;
}

export function createUiRuntime(options: ClankiUiRuntimeOptions): ClankiUiRuntime {
  const configPath = path.resolve(options.configPath);
  const projectPath = path.resolve(options.projectPath);
  let reportError: string | null = null;
  let reportJson: string | null = null;

  const runtime: ClankiUiRuntime = {
    initialize: async () => {
      try {
        await runtime.rebuildReport();
      } catch (error) {
        process.stderr.write(
          `Warning: initial report build failed:\n${formatRuntimeErrorForLog(error)}\n`,
        );
      }
    },
    getReportError: () => reportError,
    getReportJson: () => reportJson,
    readConfig: async (): Promise<ClankiConfig> =>
      validateConfig(JSON.parse(await readFile(configPath, "utf-8"))),
    rebuildReport: async () => {
      try {
        const report = await buildAnalysisReport(projectPath, configPath, { enforceStrict: false });
        reportJson = `${JSON.stringify(report, null, 2)}\n`;
        reportError = null;
      } catch (error) {
        reportJson = null;
        reportError = formatRuntimeError(error);
        throw error;
      }
    },
    writeConfig: async (rawConfig: unknown, writeOptions?: WriteConfigOptions) => {
      const config = validateConfig(rawConfig);
      const configJson = `${JSON.stringify(config, null, 2)}\n`;

      if (writeOptions?.skipRebuild === true) {
        await writeFile(configPath, configJson, "utf-8");
        return { config, rebuildError: null };
      }

      let nextReportJson: string | null = null;

      let rebuildError: string | null = null;

      try {
        const report = await buildAnalysisReportFromConfig(projectPath, config, configPath, {
          enforceStrict: false,
        });
        nextReportJson = `${JSON.stringify(report, null, 2)}\n`;
      } catch (error) {
        rebuildError = formatRuntimeError(error);
        process.stderr.write(`Report rebuild failed:\n${formatRuntimeErrorForLog(error)}\n`);
      }

      if (rebuildError !== null || nextReportJson === null) {
        return { config, rebuildError };
      }

      await writeFile(configPath, configJson, "utf-8");
      reportJson = nextReportJson;
      reportError = null;

      return { config, rebuildError };
    },
  };

  return runtime;
}

export function formatRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function formatRuntimeErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return "Unknown error";
}
