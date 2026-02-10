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
 * Navigate to a URL and capture a concise snapshot of the page structure.
 * Used to give the translator context about the actual DOM.
 */
export async function getPageSnapshot(
  url: string,
  headed?: boolean
): Promise<string> {
  const b = await ensureBrowser(headed);
  const context = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Give JS frameworks a moment to hydrate
    await page.waitForTimeout(2000);

    // Build a concise snapshot using the accessibility tree
    const snapshot = await page.evaluate(() => {
      const lines: string[] = [];
      const seen = new Set<string>();

      function walk(el: Element, depth: number) {
        if (depth > 6) return;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const ariaLabel = el.getAttribute("aria-label");
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
          ? el.childNodes[0].textContent?.trim().slice(0, 80) : "";

        // Skip invisible elements and scripts
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return;
        if (["script", "style", "link", "meta", "noscript"].includes(tag)) return;

        // Build description
        const indent = "  ".repeat(depth);
        const parts: string[] = [];
        if (role) parts.push(`role="${role}"`);
        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          const labelEl = document.getElementById(ariaLabelledBy);
          const labelText = labelEl?.textContent?.trim().slice(0, 80);
          parts.push(`aria-labelledby="${ariaLabelledBy}" → accessible-name="${labelText}"`);
        } else if (ariaLabel) {
          parts.push(`aria-label="${ariaLabel}"`);
        }
        if (el.id) parts.push(`id="${el.id}"`);
        if (tag === "input" || tag === "select" || tag === "textarea") {
          const type = el.getAttribute("type") || tag;
          const name = el.getAttribute("name");
          const placeholder = el.getAttribute("placeholder");
          parts.push(`type="${type}"`);
          if (name) parts.push(`name="${name}"`);
          if (placeholder) parts.push(`placeholder="${placeholder}"`);
        }
        if (tag === "a") {
          const href = el.getAttribute("href");
          if (href) parts.push(`href="${href}"`);
        }
        if (tag === "button" || role === "button") {
          parts.push(`text="${el.textContent?.trim().slice(0, 60)}"`);
        }
        if (text && !["button"].includes(tag)) {
          parts.push(`"${text}"`);
        }

        const desc = `${indent}<${tag}${parts.length ? " " + parts.join(" ") : ""}>`;
        const key = desc.trim();
        if (!seen.has(key)) {
          seen.add(key);
          // Only include semantically meaningful elements
          if (role || ariaLabel || ["h1","h2","h3","h4","h5","h6","button","a","input","select","textarea","table","thead","tbody","tr","th","td","form","nav","main","header","footer","section","label","option","li","ul","ol","svg","img"].includes(tag) || text) {
            lines.push(desc);
          }
        }

        for (const child of el.children) {
          walk(child, depth + 1);
        }
      }

      walk(document.body, 0);
      return lines.join("\n");
    });

    return snapshot.slice(0, 6000); // Keep it under token limits
  } finally {
    await context.close().catch(() => {});
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
      // Wait for client-side frameworks to hydrate
      await page.waitForTimeout(1500);
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
      // Check if this is a native <select> or a custom dropdown
      const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      if (tagName === "select") {
        await locator.selectOption(action.value!, { timeout });
      } else {
        // Custom dropdown: click the trigger to open, then click the option text
        await locator.click({ timeout });
        await page.waitForTimeout(300); // Let dropdown animate open
        const option = page.getByText(action.value!, { exact: false }).first();
        await option.click({ timeout });
      }
      break;
    }

    case "wait": {
      if (action.selector?.match(/^\d+$/)) {
        await page.waitForTimeout(parseInt(action.selector));
      } else if (action.selector) {
        const locator = resolveLocator(page, action.selector);
        try {
          await locator.waitFor({ state: "visible", timeout });
        } catch {
          // Fallback: try relaxed selector (role without name constraint)
          const relaxed = tryRelaxedLocator(page, action.selector);
          if (relaxed) {
            try {
              await relaxed.waitFor({ state: "visible", timeout });
              break;
            } catch {
              // Try attached state as last resort
              const attached = await relaxed.count().catch(() => 0);
              if (attached > 0) break;
            }
          }
          // Try attached state on original locator
          const count = await locator.count().catch(() => 0);
          if (count > 0) break;
          throw new Error(`Wait failed — element not found: ${action.selector}`);
        }
      } else {
        await page.waitForTimeout(1000);
      }
      break;
    }

    case "assert": {
      const selector = action.selector!;

      // Extract text to search for from either action.value or text-based selectors
      const searchText = action.value || extractTextFromSelector(selector);

      const locator = resolveLocator(page, selector);
      let locatorVisible = false;

      try {
        await locator.waitFor({ state: "visible", timeout });
        locatorVisible = true;
      } catch {
        // Locator not visible — try fallback strategies
      }

      if (locatorVisible) {
        // Primary path: locator is visible, check value if present
        if (action.value) {
          const text = await locator.textContent({ timeout });
          if (!text?.includes(action.value)) {
            // Fallback: check if the value exists anywhere visible on the page
            const exists = await page
              .getByText(action.value, { exact: false })
              .first()
              .isVisible()
              .catch(() => false);
            if (!exists) {
              throw new Error(
                `Expected text "${action.value}" but got "${text?.slice(0, 100)}"`
              );
            }
          }
        }
        break;
      }

      // Fallback 1: If we have text to search for, look for it anywhere visible on the page
      if (searchText) {
        const textVisible = await page
          .getByText(searchText, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (textVisible) break;
      }

      // Fallback 2: Try relaxed selector (e.g., role without name constraint)
      const relaxed = tryRelaxedLocator(page, selector);
      if (relaxed) {
        const relaxedVisible = await relaxed.first().isVisible().catch(() => false);
        if (relaxedVisible) break;
        // Check bounding box (SVGs may not pass Playwright's visibility check)
        const box = await relaxed.first().boundingBox().catch(() => null);
        if (box && box.width > 0 && box.height > 0) break;
      }

      // Fallback 3: Check if original locator exists in DOM with non-zero bounding box
      const isAttached = await locator.count().catch(() => 0);
      if (isAttached > 0) {
        const box = await locator.boundingBox().catch(() => null);
        if (box && box.width > 0 && box.height > 0) break;
      }

      // Fallback 3: Check the whole page body for the search text
      if (searchText) {
        const bodyText = await page.locator("body").textContent().catch(() => "");
        if (bodyText?.includes(searchText)) break;
      }

      throw new Error(
        `Assertion failed — element not found or not visible: ${selector}${searchText ? ` (searched for "${searchText}")` : ""}`
      );
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

/**
 * Try to create a relaxed version of a selector when the exact one matches nothing.
 * For role-based selectors, removes the name constraint.
 * Returns null if no relaxed version can be created.
 */
function tryRelaxedLocator(page: Page, selector: string): ReturnType<Page["locator"]> | null {
  // role=X[name="Y"] → try role=X (without name)
  const roleWithName = selector.match(/^role=(\w+)\[name=/);
  if (roleWithName) {
    return page.getByRole(roleWithName[1] as Parameters<Page["getByRole"]>[0]).first();
  }
  // button[name="Y"], link[name="Y"], etc. → try the role without name
  const bracketRole = selector.match(
    /^(button|link|textbox|checkbox|radio|heading|img|dialog|alert|navigation|main|form|region|list|listitem|table|row|cell|option|combobox|menu|menuitem)\[name=/
  );
  if (bracketRole) {
    return page.getByRole(bracketRole[1] as Parameters<Page["getByRole"]>[0]).first();
  }
  return null;
}

/**
 * Extract the text portion from a text-based selector.
 * e.g., "text=2017" -> "2017", "text=/pattern/" -> undefined
 */
function extractTextFromSelector(selector: string): string | undefined {
  if (selector.startsWith("text=")) {
    const value = selector.slice(5);
    // Don't extract regex patterns
    if (value.startsWith("/")) return undefined;
    return value;
  }
  return undefined;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
