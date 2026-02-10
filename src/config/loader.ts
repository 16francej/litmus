import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { resolve, join, dirname } from "path";
import { pathToFileURL } from "url";
import { configSchema, type ResolvedConfig } from "./schema.js";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const CONFIG_FILENAMES = [
  "litmus.config.ts",
  "litmus.config.js",
  "litmus.config.mjs",
];

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  let configPath: string | undefined;

  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(cwd, filename);
    if (existsSync(candidate)) {
      configPath = candidate;
      break;
    }
  }

  if (!configPath) {
    throw new Error(
      `No litmus config file found. Run \`litmus init\` to create one.`
    );
  }

  let rawConfig: Record<string, unknown>;

  if (configPath.endsWith(".ts")) {
    rawConfig = await loadTsConfig(configPath);
  } else {
    const mod = await import(pathToFileURL(configPath).href);
    rawConfig = mod.default ?? mod;
  }

  // Extract the auth setup function before Zod validation (Zod can't validate functions)
  const authSetup =
    typeof rawConfig?.auth === "object" &&
    rawConfig.auth !== null &&
    "setup" in rawConfig.auth &&
    typeof (rawConfig.auth as Record<string, unknown>).setup === "function"
      ? ((rawConfig.auth as Record<string, unknown>).setup as ResolvedConfig["authSetup"])
      : undefined;

  // Remove the function from the raw config before Zod validation
  if (authSetup && typeof rawConfig.auth === "object" && rawConfig.auth !== null) {
    const authCopy = { ...rawConfig.auth } as Record<string, unknown>;
    delete authCopy.setup;
    rawConfig = { ...rawConfig, auth: authCopy };
  }

  const parsed = configSchema.parse(rawConfig);

  return {
    ...parsed,
    authSetup,
  };
}

/**
 * Load a TypeScript config file.
 * Strategy: strip the TS-specific syntax and write a temporary .mjs file, then import it.
 */
async function loadTsConfig(
  configPath: string
): Promise<Record<string, unknown>> {
  const content = readFileSync(configPath, "utf-8");

  // Strip TypeScript-specific syntax to create a plain JS version
  const jsContent = content
    // Remove import { defineConfig } from "litmus" — replace with identity function
    .replace(
      /import\s*\{[^}]*\}\s*from\s*["'][^"']*["'];?\s*/g,
      "const defineConfig = (c) => c;\n"
    )
    // Remove type annotations (simple cases)
    .replace(/:\s*\w+(\[\])?\s*(?=[,;=)\n])/g, "")
    // Convert export default to module.exports for compatibility
    .replace(/export\s+default\s+/, "export default ");

  // Write to a temp .mjs file and import it
  const tmpFile = join(tmpdir(), `litmus-config-${randomUUID()}.mjs`);
  writeFileSync(tmpFile, jsContent, "utf-8");

  try {
    const mod = await import(pathToFileURL(tmpFile).href);
    return mod.default ?? mod;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}
