import { spawn, spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve, join } from "path";
import { log, spinner } from "../utils/logger.js";

export interface CodingAgentOptions {
  model?: string;
  cwd: string;
  scenariosDir: string;
  failureReport?: string;
  iteration: number;
}

/**
 * Invoke the coding agent to implement or fix the feature.
 * Uses Claude Code in headless mode (-p flag).
 */
export async function invokeCodingAgent(
  options: CodingAgentOptions
): Promise<{ success: boolean; output: string }> {
  const { cwd } = options;

  const prompt = buildCodingPrompt(options);

  // Write the prompt to a temp file for debugging
  const promptPath = join(cwd, ".litmus", "last-prompt.md");
  writeFileSync(promptPath, prompt, "utf-8");

  if (!isClaudeCodeAvailable()) {
    throw new Error(
      "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code\n" +
        "Or ensure the `claude` command is available in your PATH."
    );
  }

  return invokeClaude(prompt, cwd);
}

function buildCodingPrompt(options: CodingAgentOptions): string {
  const { scenariosDir, failureReport, iteration, cwd } = options;
  const scenariosPath = resolve(cwd, scenariosDir);

  const parts: string[] = [];

  parts.push(`# Coding Agent — Iteration ${iteration}`);
  parts.push("");
  parts.push(
    "You are implementing a feature. Your goal is to make ALL behavioral scenarios pass."
  );
  parts.push("");
  parts.push("## Rules");
  parts.push("- Read the scenario files to understand what needs to be built");
  parts.push(
    "- NEVER modify scenario files in specs/scenarios/ — they are the specification"
  );
  parts.push("- Follow existing codebase patterns and conventions");
  parts.push("- Make the minimum changes necessary");
  parts.push("- If you need to install a package, do so");
  parts.push("- Focus on making failing scenarios pass without breaking passing ones");
  parts.push("");
  parts.push(`## Scenarios Directory: ${scenariosPath}`);
  parts.push("");

  if (iteration === 1) {
    parts.push("## Task");
    parts.push(
      "This is the first iteration. Read all scenario files and implement the feature from scratch."
    );
    parts.push(
      "Start by understanding the scenarios, then implement the code to make them all pass."
    );
  } else if (failureReport) {
    parts.push("## Previous Verification Results");
    parts.push("");
    parts.push(failureReport);
    parts.push("");
    parts.push("## Task");
    parts.push(
      "Fix the failing scenarios listed above. Read the failure details carefully,"
    );
    parts.push(
      "diagnose the root cause, and modify the code to make them pass."
    );
    parts.push("Do NOT break scenarios that were previously passing.");
  }

  return parts.join("\n");
}

function isClaudeCodeAvailable(): boolean {
  try {
    const result = spawnSync("which", ["claude"], { encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Invoke Claude Code CLI asynchronously with proper timeout handling.
 */
async function invokeClaude(
  prompt: string,
  cwd: string
): Promise<{ success: boolean; output: string }> {
  const s = spinner("Coding agent working...");

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const errChunks: string[] = [];

    const proc = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        "Read,Write,Edit,Bash(npm install:*),Bash(npx:*),Bash(node:*),Bash(npm run:*),Bash(cat:*),Bash(ls:*),Glob,Grep",
        "--output-format",
        "text",
      ],
      {
        cwd,
        env: { ...process.env, CLAUDECODE: "" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    proc.stdout?.on("data", (data: Buffer) => {
      chunks.push(data.toString());
    });

    proc.stderr?.on("data", (data: Buffer) => {
      errChunks.push(data.toString());
    });

    // 10 minute timeout per iteration
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      s.fail("Coding agent timed out (10 min)");
      resolve({
        success: false,
        output: chunks.join("") + "\n[TIMED OUT after 10 minutes]",
      });
    }, 600000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const output = chunks.join("");

      if (code === 0) {
        s.succeed("Coding agent completed");
        resolve({ success: true, output });
      } else {
        // Claude Code returns non-zero for various reasons, but may still have done work
        s.succeed("Coding agent completed (exit code " + code + ")");
        resolve({ success: code === 0, output: output || errChunks.join("") });
      }
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      s.fail("Coding agent error");
      resolve({
        success: false,
        output: error.message,
      });
    });
  });
}
