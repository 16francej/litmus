import { chat } from "../utils/claude.js";
import { log, spinner } from "../utils/logger.js";
import { writeScenarioFile, type ScenarioInput } from "../scenarios/writer.js";
import type { ScenarioMetadata } from "../scenarios/types.js";
import { EXPANSION_PROMPT } from "./prompts.js";

interface RawScenario {
  name: string;
  category: string;
  context: string[];
  steps: string[];
  expected: string[];
  metadata: ScenarioMetadata;
}

/**
 * Generate exhaustive scenarios from a requirements summary using Claude.
 * Writes scenario files to the scenarios directory.
 */
export async function expandScenarios(
  requirements: string,
  codebaseContext: string,
  options: {
    scenariosDir: string;
    model?: string;
  }
): Promise<{ total: number; byCategory: Record<string, number>; byConfidence: Record<string, number> }> {
  const s = spinner("Generating scenarios...");

  const response = await chat(
    [
      {
        role: "user",
        content: `## Requirements\n\n${requirements}\n\n## Codebase Context\n\n${codebaseContext}\n\nGenerate the exhaustive scenario set as a JSON array. Return ONLY the JSON array, no other text.`,
      },
    ],
    {
      system: EXPANSION_PROMPT,
      model: options.model ?? "claude-sonnet-4-5-20250929",
      maxTokens: 16384,
    }
  );

  s.text = "Parsing scenarios...";

  // Extract JSON from response (handle potential markdown code blocks)
  let jsonStr = response.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let scenarios: RawScenario[];
  try {
    scenarios = JSON.parse(jsonStr);
  } catch {
    s.fail("Failed to parse generated scenarios");
    throw new Error(
      `Failed to parse scenario JSON from Claude response. Raw response:\n${response.slice(0, 500)}`
    );
  }

  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    s.fail("No scenarios generated");
    throw new Error("Claude returned an empty or invalid scenario array");
  }

  s.text = `Writing ${scenarios.length} scenario files...`;

  const byCategory: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};

  for (const scenario of scenarios) {
    const input: ScenarioInput = {
      name: scenario.name,
      category: scenario.category,
      context: scenario.context ?? [],
      steps: scenario.steps ?? [],
      expected: scenario.expected ?? [],
      metadata: {
        priority: scenario.metadata?.priority ?? "medium",
        type: scenario.metadata?.type ?? "happy-path",
        confidence: scenario.metadata?.confidence ?? "expanded",
      },
    };

    writeScenarioFile(input, options.scenariosDir);

    byCategory[input.category] = (byCategory[input.category] ?? 0) + 1;
    byConfidence[input.metadata.confidence] =
      (byConfidence[input.metadata.confidence] ?? 0) + 1;
  }

  s.succeed(`Generated ${scenarios.length} scenarios`);

  return {
    total: scenarios.length,
    byCategory,
    byConfidence,
  };
}
