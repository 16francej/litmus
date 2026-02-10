import { readFileSync } from "fs";
import matter from "gray-matter";
import type { Scenario, ScenarioMetadata } from "./types.js";
import { basename, dirname, relative } from "path";

/**
 * Parse a scenario markdown file into a structured Scenario object.
 *
 * Expected format:
 * ---
 * priority: high
 * type: happy-path
 * confidence: direct
 * ---
 * # Category — Scenario Name
 *
 * ## Context
 * - precondition 1
 * - precondition 2
 *
 * ## Steps
 * 1. Step one
 * 2. Step two
 *
 * ## Expected
 * - Expected outcome 1
 * - Expected outcome 2
 */
export function parseScenarioFile(
  filePath: string,
  scenariosDir: string
): Scenario {
  const raw = readFileSync(filePath, "utf-8");
  return parseScenario(raw, filePath, scenariosDir);
}

export function parseScenario(
  raw: string,
  filePath: string,
  scenariosDir: string
): Scenario {
  const { data: frontmatter, content } = matter(raw);

  const metadata: ScenarioMetadata = {
    priority: frontmatter.priority ?? "medium",
    type: frontmatter.type ?? "happy-path",
    confidence: frontmatter.confidence ?? "direct",
  };

  // Parse the heading for name
  const headingMatch = content.match(/^#\s+(.+)$/m);
  const heading = headingMatch?.[1] ?? basename(filePath, ".md");

  // Extract category from directory structure or heading
  const relPath = relative(scenariosDir, filePath);
  const category = dirname(relPath) === "." ? "general" : dirname(relPath);

  // Parse name from heading (handles "Category — Name" format)
  const nameParts = heading.split("—").map((s) => s.trim());
  const name = nameParts.length > 1 ? nameParts[1] : nameParts[0];

  // Extract sections
  const context = extractSection(content, "Context");
  const steps = extractSection(content, "Steps");
  const expected = extractSection(content, "Expected");

  return {
    name,
    category,
    filePath,
    context,
    steps,
    expected,
    metadata,
    raw,
  };
}

function extractSection(content: string, sectionName: string): string[] {
  const sectionRegex = new RegExp(
    `##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i"
  );
  const match = content.match(sectionRegex);
  if (!match) return [];

  const sectionContent = match[1].trim();

  // Parse list items (both - and numbered)
  return sectionContent
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0);
}
