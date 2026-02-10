import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { log } from "../utils/logger.js";

const CONFIG_TEMPLATE = `import { defineConfig } from "litmus";

export default defineConfig({
  // Required: where is your app?
  baseUrl: "http://localhost:3000",

  // Optional: command to start your dev server
  // devCommand: "npm run dev",

  // Optional: auth setup for scenarios that need a logged-in user
  // auth: {
  //   loginUrl: "/login",
  //   testUser: { email: "test@example.com", password: "password123" },
  // },

  // Optional: command to seed test data before verification
  // setup: "npm run db:seed",
});
`;

const EXAMPLE_SCENARIO = `---
priority: high
type: happy-path
confidence: direct
---

# Example — Homepage loads successfully

## Context
- User is not logged in
- No special data requirements

## Steps
1. Navigate to the homepage
2. Wait for the page to fully load

## Expected
- Page title is visible
- No console errors
- Page loads within 3 seconds
`;

const GITIGNORE_ENTRY = `
# Litmus
.litmus/
`;

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();

  log.heading("Initializing litmus...");

  // Create config file
  const configPath = resolve(cwd, "litmus.config.ts");
  if (existsSync(configPath)) {
    log.warn("litmus.config.ts already exists, skipping");
  } else {
    writeFileSync(configPath, CONFIG_TEMPLATE);
    log.success("Created litmus.config.ts");
  }

  // Create scenarios directory
  const scenariosDir = resolve(cwd, "specs/scenarios");
  mkdirSync(scenariosDir, { recursive: true });
  log.success("Created specs/scenarios/");

  // Write example scenario
  const examplePath = join(scenariosDir, "example-homepage.md");
  if (!existsSync(examplePath)) {
    writeFileSync(examplePath, EXAMPLE_SCENARIO);
    log.success("Created example scenario: specs/scenarios/example-homepage.md");
  }

  // Create .litmus directory for internal state
  const litmusDir = resolve(cwd, ".litmus");
  mkdirSync(litmusDir, { recursive: true });
  mkdirSync(join(litmusDir, "failures"), { recursive: true });

  // Add to .gitignore
  const gitignorePath = resolve(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".litmus/")) {
      writeFileSync(gitignorePath, gitignore + GITIGNORE_ENTRY);
      log.success("Added .litmus/ to .gitignore");
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_ENTRY.trim() + "\n");
    log.success("Created .gitignore with .litmus/");
  }

  log.heading("Done! Next steps:");
  log.info("1. Edit litmus.config.ts with your app's URL and dev command");
  log.info(
    '2. Run `litmus spec "describe your feature"` to generate scenarios'
  );
  log.info("3. Review and edit the generated scenario files in specs/scenarios/");
  log.info("4. Run `litmus loop` to implement and verify");
}
