import { Command } from "commander";
import { initCommand } from "./init.js";
import { specCommand } from "./spec.js";
import { verifyCommand } from "./verify.js";
import { loopCommand } from "./loop.js";

const program = new Command();

program
  .name("litmus")
  .description(
    "Generate exhaustive behavioral scenarios and iterate until they all pass"
  )
  .version("0.1.0");

program
  .command("init")
  .description("Initialize litmus in your project")
  .action(initCommand);

program
  .command("spec")
  .description("Interview about a feature and generate scenarios")
  .argument("<description>", "High-level description of the feature")
  .option("-m, --model <model>", "Claude model to use")
  .action(specCommand);

program
  .command("verify")
  .description("Run all scenarios against the running app")
  .option("--headed", "Run browser in headed mode (visible)")
  .option("-f, --filter <pattern>", "Only run scenarios matching pattern")
  .action(verifyCommand);

program
  .command("loop")
  .description(
    "Run the ralph loop: code until all scenarios pass"
  )
  .option(
    "-n, --max-iterations <n>",
    "Maximum iterations before stopping",
    "15"
  )
  .option("--max-cost <dollars>", "Maximum cost in dollars", "5")
  .option("-m, --model <model>", "Claude model for coding agent")
  .action(loopCommand);

program.parse();
