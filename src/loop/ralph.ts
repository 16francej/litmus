import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { invokeCodingAgent } from "./coding-agent.js";
import { runAllScenarios, formatFailureReport, printSummary } from "../runner/scenario-runner.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { log, spinner } from "../utils/logger.js";
import { closeBrowser } from "../runner/executor.js";
import { stopDevServer } from "../utils/dev-server.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { VerificationSummary } from "../scenarios/types.js";

export interface LoopOptions {
  maxIterations: number;
  maxCost: number;
  model?: string;
}

export interface LoopResult {
  success: boolean;
  iterations: number;
  finalSummary: VerificationSummary;
  stoppedReason?: string;
}

/**
 * Run the ralph loop: code → verify → iterate until all scenarios pass.
 */
export async function runRalphLoop(
  config: ResolvedConfig,
  options: LoopOptions
): Promise<LoopResult> {
  const cwd = process.cwd();
  const litmusDir = join(cwd, ".litmus");
  mkdirSync(litmusDir, { recursive: true });

  const circuitBreaker = new CircuitBreaker(5);
  let lastFailureReport: string | undefined;
  let lastSummary: VerificationSummary | undefined;

  log.heading(
    `Starting ralph loop (max ${options.maxIterations} iterations, budget $${options.maxCost})`
  );
  console.log("");

  try {
    for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
      log.heading(`── Iteration ${iteration} ──`);

      // Step 1: Invoke coding agent
      const agentResult = await invokeCodingAgent({
        model: options.model,
        cwd,
        scenariosDir: config.scenariosDir,
        failureReport: lastFailureReport,
        iteration,
      });

      // Save agent output for debugging
      writeFileSync(
        join(litmusDir, `agent-output-${iteration}.md`),
        agentResult.output,
        "utf-8"
      );

      if (!agentResult.success) {
        log.warn(`Coding agent returned non-zero exit code (iteration ${iteration})`);
      }

      // Step 2: Verify all scenarios
      log.info("Verifying scenarios...");

      try {
        lastSummary = await runAllScenarios(config, {
          model: options.model,
        });
      } catch (error) {
        log.fail(
          `Verification failed: ${error instanceof Error ? error.message : error}`
        );
        // If verification itself crashes, still continue the loop
        continue;
      }

      // Step 3: Report results
      const { total, passed, failed } = lastSummary;
      if (failed === 0) {
        log.success(`All ${total} scenarios passing!`);
        printSummary(lastSummary);
        return {
          success: true,
          iterations: iteration,
          finalSummary: lastSummary,
        };
      }

      log.info(`${passed}/${total} passing (${failed} failing)`);

      // Step 4: Check circuit breaker
      circuitBreaker.record(iteration, lastSummary);
      const stopReason = circuitBreaker.shouldStop();

      if (stopReason) {
        log.warn(`Circuit breaker: ${stopReason}`);

        const stuckScenarios = circuitBreaker.getStuckScenarios();
        if (stuckScenarios.length > 0) {
          log.heading("Persistently failing scenarios:");
          for (const s of stuckScenarios) {
            log.dim(`  ${s}`);
          }
        }

        printSummary(lastSummary);
        return {
          success: false,
          iterations: iteration,
          finalSummary: lastSummary,
          stoppedReason: stopReason,
        };
      }

      // Step 5: Format failures for next iteration
      lastFailureReport = formatFailureReport(lastSummary);

      // Save failure report
      writeFileSync(
        join(litmusDir, `failures-${iteration}.md`),
        lastFailureReport,
        "utf-8"
      );

      log.dim("Failures fed back to coding agent.\n");
    }

    // Hit max iterations
    log.warn(`Reached maximum iterations (${options.maxIterations})`);
    if (lastSummary) {
      printSummary(lastSummary);
    }

    return {
      success: false,
      iterations: options.maxIterations,
      finalSummary: lastSummary!,
      stoppedReason: `Reached maximum iterations (${options.maxIterations})`,
    };
  } finally {
    await closeBrowser();
    stopDevServer();
  }
}
