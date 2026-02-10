import chalk from "chalk";
import ora, { type Ora } from "ora";

export const log = {
  info: (msg: string) => console.log(chalk.blue("info") + " " + msg),
  success: (msg: string) => console.log(chalk.green("pass") + " " + msg),
  fail: (msg: string) => console.log(chalk.red("fail") + " " + msg),
  warn: (msg: string) => console.log(chalk.yellow("warn") + " " + msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  heading: (msg: string) => console.log("\n" + chalk.bold(msg)),
  scenario: (name: string, passed: boolean) =>
    console.log(
      `  ${passed ? chalk.green("✓") : chalk.red("✗")} ${name}`
    ),
};

export function spinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}
