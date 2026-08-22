import { readFileSync } from "fs";
import { type ClankiConfig, clankiConfigSchema } from "./model/config";

export function loadConfig(configPath: string): ClankiConfig {
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return validateConfig(raw);
}

export function validateConfig(raw: unknown): ClankiConfig {
  const parsed = clankiConfigSchema.parse(raw);
  const { rules, ...rest } = parsed;

  return rules !== undefined && rules.length > 0 ? { ...rest, rules } : rest;
}
