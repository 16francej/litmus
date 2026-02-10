import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import type { PlaywrightAction } from "./translator.js";
import type { Scenario, StepResult, VerificationResult } from "../scenarios/types.js";

export interface ExecutorOptions {
  baseUrl: string;
  headed?: boolean;
  screenshotDir: string;
  timeout?: number;
}

let browser: Browser | undefined;

export async function ensureBrowser(headed?: boolean): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: !headed,
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = undefined;
  }
}

/**
 * Execute a single scenario by running its translated Playwright actions.
 */
export async function executeScenario(
  scenario: Scenario,
  actions: PlaywrightAction[],
  options: ExecutorOptions
): Promise<VerificationResult> {
  const start = Date.now();
  const stepResults: StepResult[] = [];
  const consoleLogs: string[] = [];
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    const b = await ensureBrowser(options.headed);
    context = await b.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();

    // Capture console logs
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on("pageerror", (error) => {
      consoleLogs.push(`[error] ${error.message}`);
    });

    const timeout = options.timeout ?? 10000;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const stepResult: StepResult = {
        step: i + 1,
        description: action.description,
        passed: false,
      };

      try {
        await executeAction(page, action, options.baseUrl, timeout);
        stepResult.passed = true;
      } catch (error) {
        stepResult.passed = false;
        stepResult.error =
          error instanceof Error ? error.message : String(error);

        // Capture screenshot on failure
        const screenshotName = `${slugify(scenario.name)}-step${i + 1}.png`;
        const screenshotPath = join(options.screenshotDir, screenshotName);
        mkdirSync(dirname(screenshotPath), { recursive: true });

        try {
          await page.screenshot({ path: screenshotPath });
          stepResult.screenshotPath = screenshotPath;
        } catch {
          // Can't take screenshot, continue
        }

        stepResults.push(stepResult);

        // Stop executing remaining steps on failure
        return {
          scenario,
          passed: false,
          stepResults,
          failedStep: i + 1,
          expected: action.description,
          actual: stepResult.error,
          screenshotPath: stepResult.screenshotPath,
          consoleLogs: consoleLogs.filter(
            (l) => l.includes("[error]") || l.includes("[warning]")
          ),
          duration: Date.now() - start,
        };
      }

      stepResults.push(stepResult);
    }

    return {
      scenario,
      passed: true,
      stepResults,
      consoleLogs: consoleLogs.filter(
        (l) => l.includes("[error]") || l.includes("[warning]")
      ),
      duration: Date.now() - start,
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

async function executeAction(
  page: Page,
  action: PlaywrightAction,
  baseUrl: string,
  timeout: number
): Promise<void> {
  switch (action.type) {
    case "navigate": {
      const url = action.url?.startsWith("http")
        ? action.url
        : `${baseUrl}${action.url}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      break;
    }

    case "click": {
      const locator = resolveLocator(page, action.selector!);
      await locator.click({ timeout });
      break;
    }

    case "fill": {
      const locator = resolveLocator(page, action.selector!);
      await locator.fill(action.value!, { timeout });
      break;
    }

    case "select": {
      const locator = resolveLocator(page, action.selector!);
      await locator.selectOption(action.value!, { timeout });
      break;
    }

    case "wait": {
      if (action.selector?.match(/^\d+$/)) {
        await page.waitForTimeout(parseInt(action.selector));
      } else if (action.selector) {
        const locator = resolveLocator(page, action.selector);
        await locator.waitFor({ state: "visible", timeout });
      } else {
        await page.waitForTimeout(1000);
      }
      break;
    }

    case "assert": {
      const locator = resolveLocator(page, action.selector!);
      await locator.waitFor({ state: "visible", timeout });
      if (action.value) {
        const text = await locator.textContent({ timeout });
        if (!text?.includes(action.value)) {
          throw new Error(
            `Expected text "${action.value}" but got "${text?.slice(0, 100)}"`
          );
        }
      }
      break;
    }

    case "keyboard": {
      await page.keyboard.press(action.key!);
      break;
    }

    default:
      throw new Error(`Unknown action type: ${(action as PlaywrightAction).type}`);
  }
}

/**
 * Resolve a selector string into a Playwright Locator.
 * Handles various selector formats including common LLM-generated patterns.
 * Uses .first() to avoid strict mode violations.
 */
function resolveLocator(page: Page, selector: string) {
  // Handle timeout= patterns (invalid, treat as generic wait)
  if (selector.startsWith("timeout=") || selector.startsWith("timeout:")) {
    return page.locator("body");
  }

  // Handle role= shorthand: 'role=img', 'role=main', 'role=button'
  const roleShorthand = selector.match(/^role=(\w+)(?:\[name=['"](.+?)['"]\])?$/);
  if (roleShorthand) {
    const opts = roleShorthand[2] ? { name: roleShorthand[2] } : undefined;
    return page.getByRole(roleShorthand[1] as Parameters<Page["getByRole"]>[0], opts).first();
  }

  // Role-based: 'button[name="Submit"]'
  const roleMatch = selector.match(
    /^(button|link|textbox|checkbox|radio|heading|img|dialog|alert|navigation|main|form|region|list|listitem|table|row|cell|option|combobox|menu|menuitem)\[name=['"](.+?)['"]\]$/
  );
  if (roleMatch) {
    return page.getByRole(roleMatch[1] as Parameters<Page["getByRole"]>[0], {
      name: roleMatch[2],
    }).first();
  }

  // Text-based: 'text=...'
  if (selector.startsWith("text=")) {
    const textValue = selector.slice(5);
    return page.getByText(maybeRegex(textValue)).first();
  }

  // Regex-like text selector: '/pattern/flags'
  const regexMatch = selector.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (regexMatch) {
    return page.getByText(new RegExp(regexMatch[1], regexMatch[2])).first();
  }

  // Playwright getByText shorthand with regex: 'getByText(/pattern/i)'
  const getByTextRegex = selector.match(/^getByText\(\/(.+?)\/([gimsuy]*)\)$/);
  if (getByTextRegex) {
    return page.getByText(new RegExp(getByTextRegex[1], getByTextRegex[2])).first();
  }

  // Placeholder-based: 'placeholder=...'
  if (selector.startsWith("placeholder=")) {
    return page.getByPlaceholder(selector.slice(12)).first();
  }

  // Label-based: 'label=...'
  if (selector.startsWith("label=")) {
    return page.getByLabel(selector.slice(6)).first();
  }

  // Test ID: 'testid=...'
  if (selector.startsWith("testid=")) {
    return page.getByTestId(selector.slice(7)).first();
  }

  // CSS fallback — use .first() to avoid strict violations
  return page.locator(selector).first();
}

/**
 * Convert a string that looks like a regex (/pattern/flags) to a RegExp,
 * or return the string as-is for plain text matching.
 */
function maybeRegex(text: string): string | RegExp {
  const match = text.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (match) {
    return new RegExp(match[1], match[2]);
  }
  return text;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
