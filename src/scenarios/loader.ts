import { readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { parseScenarioFile } from "./parser.js";
import type { Scenario } from "./types.js";

/**
 * Recursively find and parse all scenario .md files in the scenarios directory.
 */
export function loadAllScenarios(scenariosDir: string): Scenario[] {
  const files = findMarkdownFiles(scenariosDir);
  return files.map((f) => parseScenarioFile(f, scenariosDir));
}

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (extname(entry) === ".md") {
      results.push(fullPath);
    }
  }

  return results.sort();
}
