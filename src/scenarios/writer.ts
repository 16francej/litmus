import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { Scenario, ScenarioMetadata } from "./types.js";

export interface ScenarioInput {
  name: string;
  category: string;
  context: string[];
  steps: string[];
  expected: string[];
  metadata: ScenarioMetadata;
}

export function writeScenarioFile(
  scenario: ScenarioInput,
  scenariosDir: string
): string {
  const content = formatScenario(scenario);
  const fileName = slugify(scenario.name) + ".md";
  const filePath = join(scenariosDir, scenario.category, fileName);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");

  return filePath;
}

export function formatScenario(scenario: ScenarioInput): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`priority: ${scenario.metadata.priority}`);
  lines.push(`type: ${scenario.metadata.type}`);
  lines.push(`confidence: ${scenario.metadata.confidence}`);
  lines.push("---");
  lines.push("");

  // Heading
  lines.push(`# ${capitalize(scenario.category)} — ${scenario.name}`);
  lines.push("");

  // Context
  lines.push("## Context");
  for (const item of scenario.context) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  // Steps
  lines.push("## Steps");
  scenario.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  lines.push("");

  // Expected
  lines.push("## Expected");
  for (const item of scenario.expected) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  return lines.join("\n");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
