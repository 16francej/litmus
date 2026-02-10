import { resolve } from "path";
import { loadConfig } from "../config/loader.js";
import { runInterview } from "../interview/interviewer.js";
import { expandScenarios } from "../interview/expansion.js";
import {
  readCodebaseContext,
  formatCodebaseContext,
} from "../interview/codebase-reader.js";
import { log } from "../utils/logger.js";

export async function specCommand(
  description: string,
  options: { model?: string }
): Promise<void> {
  const cwd = process.cwd();

  let config;
  try {
    config = await loadConfig(cwd);
  } catch {
    log.warn("No litmus config found. Using defaults.");
    config = {
      baseUrl: "http://localhost:3000",
      scenariosDir: "specs/scenarios",
      model: "claude-sonnet-4-5-20250929",
      loop: { maxIterations: 15, maxCost: 5, model: "claude-sonnet-4-5-20250929" },
    };
  }

  const model = options.model ?? config.model;

  // Run the interview
  const { requirements } = await runInterview(description, {
    cwd,
    model,
  });

  // Get codebase context for expansion
  const codebaseCtx = readCodebaseContext(cwd);
  const contextStr = formatCodebaseContext(codebaseCtx);

  // Expand into scenarios
  const scenariosDir = resolve(cwd, config.scenariosDir);
  const result = await expandScenarios(requirements, contextStr, {
    scenariosDir,
    model,
  });

  // Print summary
  log.heading("Scenario Summary");
  log.info(`Total: ${result.total} scenarios`);

  log.heading("By Category:");
  for (const [cat, count] of Object.entries(result.byCategory)) {
    log.info(`  ${cat}: ${count}`);
  }

  log.heading("By Confidence:");
  for (const [conf, count] of Object.entries(result.byConfidence)) {
    log.info(`  ${conf}: ${count}`);
  }

  console.log("");
  log.info(
    `Scenarios written to ${config.scenariosDir}/`
  );
  log.info("Review and edit these files, then run: litmus loop");
}
