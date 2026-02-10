import { resolve } from "path";
import { loadAllScenarios } from "../scenarios/loader.js";
import { translateScenario } from "./translator.js";
import { executeScenario, ensureBrowser, closeBrowser } from "./executor.js";
import { log, spinner } from "../utils/logger.js";
import type { Scenario, VerificationResult, VerificationSummary } from "../scenarios/types.js";
import type { ResolvedConfig } from "../config/schema.js";
import { ensureDevServer, stopDevServer } from "../utils/dev-server.js";
import { execSync } from "child_process";

export interface RunnerOptions {
  headed?: boolean;
  filter?: string;
  model?: string;
}

/**
 * Run all scenarios against the live application.
 */
export async function runAllScenarios(
  config: ResolvedConfig,
  options: RunnerOptions = {}
): Promise<VerificationSummary> {
  const start = Date.now();
  const cwd = process.cwd();
  const scenariosDir = resolve(cwd, config.scenariosDir);
  const screenshotDir = resolve(cwd, ".litmus", "failures");

  // Load scenarios
  let scenarios = loadAllScenarios(scenariosDir);
  if (scenarios.length === 0) {
    throw new Error(
      `No scenarios found in ${config.scenariosDir}/. Run \`litmus spec\` to generate some.`
    );
  }

  // Apply filter if provided
  if (options.filter) {
    const pattern = new RegExp(options.filter, "i");
    scenarios = scenarios.filter(
      (s) => pattern.test(s.name) || pattern.test(s.category) || pattern.test(s.filePath)
    );
    if (scenarios.length === 0) {
      throw new Error(`No scenarios match filter "${options.filter}"`);
    }
  }

  log.info(`Found ${scenarios.length} scenarios`);

  // Run setup command if configured
  if (config.setup) {
    const s = spinner(`Running setup: ${config.setup}`);
    try {
      execSync(config.setup, { cwd, stdio: "pipe" });
      s.succeed("Setup complete");
    } catch (error) {
      s.fail("Setup failed");
      throw error;
    }
  }

  // Ensure dev server is running
  const s = spinner(`Checking server at ${config.baseUrl}...`);
  try {
    await ensureDevServer(config.baseUrl, config.devCommand, cwd);
    s.succeed(`Server ready at ${config.baseUrl}`);
  } catch (error) {
    s.fail("Server not available");
    throw error;
  }

  // Run scenarios
  const results: VerificationResult[] = [];
  const model = options.model ?? config.model;

  log.heading("Running scenarios\n");

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const prefix = `[${i + 1}/${scenarios.length}]`;

    try {
      // Translate scenario to Playwright actions
      const actions = await translateScenario(scenario, config.baseUrl, model);

      // Execute the actions
      const result = await executeScenario(scenario, actions, {
        baseUrl: config.baseUrl,
        headed: options.headed,
        screenshotDir,
      });

      results.push(result);
      log.scenario(`${prefix} ${scenario.category}/${scenario.name}`, result.passed);

      if (!result.passed && result.actual) {
        log.dim(`      ${result.actual.slice(0, 120)}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        scenario,
        passed: false,
        stepResults: [],
        consoleLogs: [],
        actual: errorMsg,
        duration: 0,
      });
      log.scenario(`${prefix} ${scenario.category}/${scenario.name}`, false);
      log.dim(`      ${errorMsg.slice(0, 120)}`);
    }
  }

  // Close browser
  await closeBrowser();

  const summary: VerificationSummary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
    duration: Date.now() - start,
  };

  return summary;
}

/**
 * Format a verification summary for terminal display.
 */
export function printSummary(summary: VerificationSummary): void {
  const { total, passed, failed, duration } = summary;

  log.heading("Results");

  if (failed === 0) {
    log.success(`All ${total} scenarios passing`);
  } else {
    log.fail(`${failed}/${total} scenarios failed`);

    log.heading("Failures:");
    for (const result of summary.results.filter((r) => !r.passed)) {
      console.log("");
      log.fail(`${result.scenario.category}/${result.scenario.name}`);
      if (result.failedStep) {
        log.dim(`  Step ${result.failedStep}: ${result.expected}`);
      }
      if (result.actual) {
        log.dim(`  Got: ${result.actual.slice(0, 200)}`);
      }
      if (result.screenshotPath) {
        log.dim(`  Screenshot: ${result.screenshotPath}`);
      }
    }
  }

  log.dim(`\nDuration: ${(duration / 1000).toFixed(1)}s`);
}

/**
 * Format failures into a structured report for the coding agent.
 */
export function formatFailureReport(summary: VerificationSummary): string {
  const lines: string[] = [];
  lines.push(
    `## Verification Results: ${summary.passed}/${summary.total} passing\n`
  );

  const failures = summary.results.filter((r) => !r.passed);
  if (failures.length === 0) return lines.join("\n");

  lines.push(`### ${failures.length} Failing Scenarios\n`);

  for (const result of failures) {
    lines.push(`#### ${result.scenario.filePath}`);
    lines.push(`**Scenario:** ${result.scenario.name}`);

    if (result.failedStep) {
      const step = result.scenario.steps[result.failedStep - 1];
      lines.push(`**Failed at step ${result.failedStep}:** ${step}`);
    }

    if (result.expected) {
      lines.push(`**Expected:** ${result.expected}`);
    }
    if (result.actual) {
      lines.push(`**Actual:** ${result.actual}`);
    }

    if (result.consoleLogs.length > 0) {
      lines.push(`**Console:**`);
      for (const logEntry of result.consoleLogs.slice(0, 5)) {
        lines.push(`  ${logEntry}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
