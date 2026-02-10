import { loadConfig } from "../config/loader.js";
import { runAllScenarios, printSummary } from "../runner/scenario-runner.js";
import { stopDevServer } from "../utils/dev-server.js";
import { log } from "../utils/logger.js";

export async function verifyCommand(options: {
  headed?: boolean;
  filter?: string;
}): Promise<void> {
  const cwd = process.cwd();

  const config = await loadConfig(cwd);

  try {
    const summary = await runAllScenarios(config, {
      headed: options.headed,
      filter: options.filter,
    });

    printSummary(summary);

    if (summary.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    log.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    stopDevServer();
  }
}
