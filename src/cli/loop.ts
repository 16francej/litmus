import { loadConfig } from "../config/loader.js";
import { runRalphLoop } from "../loop/ralph.js";
import { log } from "../utils/logger.js";

export async function loopCommand(options: {
  maxIterations: string;
  maxCost: string;
  model?: string;
}): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  const maxIterations = parseInt(options.maxIterations, 10) || config.loop?.maxIterations || 15;
  const maxCost = parseFloat(options.maxCost) || config.loop?.maxCost || 5;
  const model = options.model ?? config.loop?.model ?? config.model;

  try {
    const result = await runRalphLoop(config, {
      maxIterations,
      maxCost,
      model,
    });

    if (result.success) {
      log.heading("Done!");
      log.success(
        `All scenarios passing after ${result.iterations} iteration${result.iterations === 1 ? "" : "s"}`
      );
    } else {
      log.heading("Loop stopped");
      if (result.stoppedReason) {
        log.warn(result.stoppedReason);
      }
      log.info(
        "Review the failing scenarios and either fix them or run `litmus loop` again."
      );
      process.exit(1);
    }
  } catch (error) {
    log.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
