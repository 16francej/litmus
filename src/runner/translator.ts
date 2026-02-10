import { chat } from "../utils/claude.js";
import type { Scenario } from "../scenarios/types.js";

export interface PlaywrightAction {
  type: "navigate" | "click" | "fill" | "select" | "wait" | "assert" | "keyboard";
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  description: string;
}

const TRANSLATION_SYSTEM = `You are a Playwright test translator. Given a behavioral scenario written in natural language, output a JSON array of Playwright actions.

Each action must be one of these types:

- navigate: Go to a URL. { "type": "navigate", "url": "/path", "description": "..." }
- click: Click an element. { "type": "click", "selector": "role/text selector", "description": "..." }
- fill: Type into an input. { "type": "fill", "selector": "role/text selector", "value": "text to type", "description": "..." }
- select: Select from a dropdown. { "type": "select", "selector": "role/text selector", "value": "option", "description": "..." }
  For custom dropdowns (button + options, not native <select>), use TWO actions: a click on the trigger button, then a click on the option text.
- wait: Wait for something. { "type": "wait", "selector": "role/text selector or timeout", "description": "..." }
- assert: Verify something is visible/correct. { "type": "assert", "selector": "role/text selector", "value": "expected text (optional)", "description": "..." }
- keyboard: Press a key. { "type": "keyboard", "key": "Enter", "description": "..." }

For selectors, prefer accessible selectors that Playwright supports:
- getByRole: 'button[name="Submit"]', 'link[name="Home"]', 'textbox[name="Email"]'
- getByText: 'text=Welcome back'
- getByPlaceholder: 'placeholder=Enter your email'
- getByLabel: 'label=Email address'
- CSS as last resort: '.class-name', '#id'

IMPORTANT rules:
- When asserting text exists, use selectors that target VISIBLE elements only. Avoid matching hidden elements like SVG <title> tags.
- For table content assertions, prefer targeting table cells (td, th) or rows (tr) rather than broad text searches.
- If a page snapshot is provided, use it to choose selectors that match the ACTUAL DOM structure.
- For custom dropdowns/filters (button + role="option" divs), do NOT use "select" type. Instead use "click" on the trigger, then "click" on the option.
- For native <select> elements, use the "select" type.

Return ONLY a JSON array of actions. No other text.`;

/**
 * Translate a scenario's steps + expected outcomes into Playwright actions.
 */
export async function translateScenario(
  scenario: Scenario,
  baseUrl: string,
  model?: string,
  pageSnapshot?: string
): Promise<PlaywrightAction[]> {
  const snapshotSection = pageSnapshot
    ? `\n## Page Structure (actual DOM snapshot)\n\`\`\`\n${pageSnapshot}\n\`\`\`\n\nUse this snapshot to choose selectors that match the real page structure. Prefer targeting visible text content in semantic elements (headings, table cells, buttons, labels) rather than SVG internals or hidden elements.\n`
    : "";

  const prompt = `## Scenario: ${scenario.name}

## Context (preconditions)
${scenario.context.map((c) => `- ${c}`).join("\n")}

## Steps to execute
${scenario.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Expected outcomes to verify
${scenario.expected.map((e) => `- ${e}`).join("\n")}

## Base URL: ${baseUrl}
${snapshotSection}
Translate ALL steps AND expected outcomes into Playwright actions. Start by navigating to the appropriate page. End with assert actions for each expected outcome. Return ONLY the JSON array.`;

  const response = await chat(
    [{ role: "user", content: prompt }],
    {
      system: TRANSLATION_SYSTEM,
      model: model ?? "claude-sonnet-4-5-20250929",
      maxTokens: 4096,
    }
  );

  // Extract JSON
  let jsonStr = response.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const actions = JSON.parse(jsonStr) as PlaywrightAction[];
    if (!Array.isArray(actions)) throw new Error("Not an array");
    return actions;
  } catch {
    throw new Error(
      `Failed to translate scenario "${scenario.name}" to Playwright actions.\nResponse: ${response.slice(0, 300)}`
    );
  }
}
