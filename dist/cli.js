#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";

// src/cli/init.ts
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve, join } from "path";

// src/utils/logger.ts
import chalk from "chalk";
import ora from "ora";
var log = {
  info: (msg) => console.log(chalk.blue("info") + " " + msg),
  success: (msg) => console.log(chalk.green("pass") + " " + msg),
  fail: (msg) => console.log(chalk.red("fail") + " " + msg),
  warn: (msg) => console.log(chalk.yellow("warn") + " " + msg),
  dim: (msg) => console.log(chalk.dim(msg)),
  heading: (msg) => console.log("\n" + chalk.bold(msg)),
  scenario: (name, passed) => console.log(
    `  ${passed ? chalk.green("\u2713") : chalk.red("\u2717")} ${name}`
  )
};
function spinner(text) {
  return ora({ text, color: "cyan" }).start();
}

// src/cli/init.ts
var CONFIG_TEMPLATE = `import { defineConfig } from "litmus";

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
var EXAMPLE_SCENARIO = `---
priority: high
type: happy-path
confidence: direct
---

# Example \u2014 Homepage loads successfully

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
var GITIGNORE_ENTRY = `
# Litmus
.litmus/
`;
async function initCommand() {
  const cwd = process.cwd();
  log.heading("Initializing litmus...");
  const configPath = resolve(cwd, "litmus.config.ts");
  if (existsSync(configPath)) {
    log.warn("litmus.config.ts already exists, skipping");
  } else {
    writeFileSync(configPath, CONFIG_TEMPLATE);
    log.success("Created litmus.config.ts");
  }
  const scenariosDir = resolve(cwd, "specs/scenarios");
  mkdirSync(scenariosDir, { recursive: true });
  log.success("Created specs/scenarios/");
  const examplePath = join(scenariosDir, "example-homepage.md");
  if (!existsSync(examplePath)) {
    writeFileSync(examplePath, EXAMPLE_SCENARIO);
    log.success("Created example scenario: specs/scenarios/example-homepage.md");
  }
  const litmusDir = resolve(cwd, ".litmus");
  mkdirSync(litmusDir, { recursive: true });
  mkdirSync(join(litmusDir, "failures"), { recursive: true });
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

// src/cli/spec.ts
import { resolve as resolve3 } from "path";

// src/config/loader.ts
import { readFileSync as readFileSync2, existsSync as existsSync2, writeFileSync as writeFileSync2, unlinkSync } from "fs";
import { resolve as resolve2, join as join2 } from "path";
import { pathToFileURL } from "url";

// src/config/schema.ts
import { z } from "zod";
var authConfigSchema = z.object({
  loginUrl: z.string().optional(),
  testUser: z.object({
    email: z.string(),
    password: z.string()
  }).optional()
  // Custom setup function is handled at runtime, not validated by Zod
});
var loopConfigSchema = z.object({
  maxIterations: z.number().default(15),
  maxCost: z.number().default(5),
  model: z.string().default("claude-sonnet-4-5-20250929")
});
var configSchema = z.object({
  baseUrl: z.string().url(),
  devCommand: z.string().optional(),
  auth: authConfigSchema.optional(),
  setup: z.string().optional(),
  model: z.string().default("claude-sonnet-4-5-20250929"),
  loop: loopConfigSchema.optional().default({}),
  scenariosDir: z.string().default("specs/scenarios")
});

// src/config/loader.ts
import { tmpdir } from "os";
import { randomUUID } from "crypto";
var CONFIG_FILENAMES = [
  "litmus.config.ts",
  "litmus.config.js",
  "litmus.config.mjs"
];
async function loadConfig(cwd) {
  let configPath;
  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve2(cwd, filename);
    if (existsSync2(candidate)) {
      configPath = candidate;
      break;
    }
  }
  if (!configPath) {
    throw new Error(
      `No litmus config file found. Run \`litmus init\` to create one.`
    );
  }
  let rawConfig;
  if (configPath.endsWith(".ts")) {
    rawConfig = await loadTsConfig(configPath);
  } else {
    const mod = await import(pathToFileURL(configPath).href);
    rawConfig = mod.default ?? mod;
  }
  const authSetup = typeof rawConfig?.auth === "object" && rawConfig.auth !== null && "setup" in rawConfig.auth && typeof rawConfig.auth.setup === "function" ? rawConfig.auth.setup : void 0;
  if (authSetup && typeof rawConfig.auth === "object" && rawConfig.auth !== null) {
    const authCopy = { ...rawConfig.auth };
    delete authCopy.setup;
    rawConfig = { ...rawConfig, auth: authCopy };
  }
  const parsed = configSchema.parse(rawConfig);
  return {
    ...parsed,
    authSetup
  };
}
async function loadTsConfig(configPath) {
  const content = readFileSync2(configPath, "utf-8");
  const jsContent = content.replace(
    /import\s*\{[^}]*\}\s*from\s*["'][^"']*["'];?\s*/g,
    "const defineConfig = (c) => c;\n"
  ).replace(/:\s*\w+(\[\])?\s*(?=[,;=)\n])/g, "").replace(/export\s+default\s+/, "export default ");
  const tmpFile = join2(tmpdir(), `litmus-config-${randomUUID()}.mjs`);
  writeFileSync2(tmpFile, jsContent, "utf-8");
  try {
    const mod = await import(pathToFileURL(tmpFile).href);
    return mod.default ?? mod;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
    }
  }
}

// src/interview/interviewer.ts
import { createInterface } from "readline";

// src/utils/claude.ts
import Anthropic from "@anthropic-ai/sdk";
var client;
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required. Set it with: export ANTHROPIC_API_KEY=sk-..."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
async function chat(messages, options = {}) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: options.model ?? "claude-sonnet-4-5-20250929",
    max_tokens: options.maxTokens ?? 8192,
    system: options.system,
    messages
  });
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text ?? "";
}
async function* chatStream(messages, options = {}) {
  const anthropic = getClient();
  const stream = anthropic.messages.stream({
    model: options.model ?? "claude-sonnet-4-5-20250929",
    max_tokens: options.maxTokens ?? 8192,
    system: options.system,
    messages
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// src/interview/codebase-reader.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, readdirSync, statSync } from "fs";
import { join as join3 } from "path";
function readCodebaseContext(cwd) {
  const context = {
    stack: [],
    routes: [],
    schema: [],
    components: [],
    existingTests: [],
    packageInfo: null
  };
  const pkgPath = join3(cwd, "package.json");
  if (existsSync3(pkgPath)) {
    try {
      context.packageInfo = JSON.parse(readFileSync3(pkgPath, "utf-8"));
      context.stack.push(...detectStack(context.packageInfo));
    } catch {
    }
  }
  const appDir = join3(cwd, "app");
  const srcAppDir = join3(cwd, "src", "app");
  const pagesDir = join3(cwd, "pages");
  const srcPagesDir = join3(cwd, "src", "pages");
  for (const dir of [appDir, srcAppDir]) {
    if (existsSync3(dir)) {
      context.routes.push(...findNextAppRoutes(dir, dir));
    }
  }
  for (const dir of [pagesDir, srcPagesDir]) {
    if (existsSync3(dir)) {
      context.routes.push(...findNextPageRoutes(dir, dir));
    }
  }
  const prismaPath = join3(cwd, "prisma", "schema.prisma");
  if (existsSync3(prismaPath)) {
    const schema = readFileSync3(prismaPath, "utf-8");
    context.schema.push(truncate(schema, 3e3));
    context.stack.push("Prisma ORM");
  }
  const drizzleFiles = findFiles(
    cwd,
    (f) => f.includes("schema") && (f.endsWith(".ts") || f.endsWith(".js")) && f.includes("drizzle")
  );
  for (const f of drizzleFiles.slice(0, 3)) {
    context.schema.push(truncate(readFileSync3(f, "utf-8"), 2e3));
    if (!context.stack.includes("Drizzle ORM")) context.stack.push("Drizzle ORM");
  }
  const componentDirs = ["components", "src/components", "app/components"];
  for (const dir of componentDirs) {
    const fullDir = join3(cwd, dir);
    if (existsSync3(fullDir)) {
      context.components.push(
        ...listFilesShallow(fullDir).map((f) => f.replace(cwd + "/", ""))
      );
    }
  }
  const testPatterns = ["__tests__", "tests", "test", "spec", "*.test.*", "*.spec.*"];
  const testFiles = findFiles(cwd, (f) => {
    const lower = f.toLowerCase();
    return (lower.includes(".test.") || lower.includes(".spec.") || lower.includes("__tests__")) && !lower.includes("node_modules");
  });
  context.existingTests = testFiles.slice(0, 20).map((f) => f.replace(cwd + "/", ""));
  return context;
}
function detectStack(pkg) {
  const stack = [];
  const deps = {
    ...pkg.dependencies ?? {},
    ...pkg.devDependencies ?? {}
  };
  if (deps["next"]) stack.push(`Next.js ${deps["next"]}`);
  if (deps["react"]) stack.push("React");
  if (deps["vue"]) stack.push("Vue");
  if (deps["svelte"] || deps["@sveltejs/kit"]) stack.push("Svelte/SvelteKit");
  if (deps["express"]) stack.push("Express");
  if (deps["@supabase/supabase-js"]) stack.push("Supabase");
  if (deps["firebase"]) stack.push("Firebase");
  if (deps["stripe"]) stack.push("Stripe");
  if (deps["@auth/core"] || deps["next-auth"]) stack.push("NextAuth/Auth.js");
  if (deps["@clerk/nextjs"]) stack.push("Clerk Auth");
  if (deps["tailwindcss"]) stack.push("Tailwind CSS");
  if (deps["prisma"] || deps["@prisma/client"]) stack.push("Prisma");
  if (deps["drizzle-orm"]) stack.push("Drizzle ORM");
  return stack;
}
function findNextAppRoutes(dir, baseDir) {
  const routes = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join3(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        if (!entry.startsWith("_") && !entry.startsWith(".")) {
          routes.push(...findNextAppRoutes(fullPath, baseDir));
        }
      } else if (entry.startsWith("page.")) {
        const route = dir.replace(baseDir, "").replace(/\\/g, "/") || "/";
        routes.push(route);
      }
    }
  } catch {
  }
  return routes;
}
function findNextPageRoutes(dir, baseDir) {
  const routes = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join3(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        routes.push(...findNextPageRoutes(fullPath, baseDir));
      } else if (/\.(tsx?|jsx?)$/.test(entry) && !entry.startsWith("_")) {
        const route = fullPath.replace(baseDir, "").replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "").replace(/\/index$/, "/");
        routes.push(route);
      }
    }
  } catch {
  }
  return routes;
}
function findFiles(dir, predicate, maxDepth = 4, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".git" || entry === ".next" || entry === "dist") {
        continue;
      }
      const fullPath = join3(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findFiles(fullPath, predicate, maxDepth, currentDepth + 1));
      } else if (predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  } catch {
  }
  return results;
}
function listFilesShallow(dir) {
  try {
    return readdirSync(dir).map((f) => join3(dir, f)).filter((f) => statSync(f).isFile()).slice(0, 30);
  } catch {
    return [];
  }
}
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n... (truncated)";
}
function formatCodebaseContext(ctx) {
  const parts = [];
  if (ctx.stack.length > 0) {
    parts.push(`**Tech Stack:** ${ctx.stack.join(", ")}`);
  }
  if (ctx.routes.length > 0) {
    parts.push(`**Routes:** ${ctx.routes.join(", ")}`);
  }
  if (ctx.components.length > 0) {
    parts.push(`**Components:** ${ctx.components.slice(0, 15).join(", ")}`);
  }
  if (ctx.schema.length > 0) {
    parts.push(`**Database Schema:**
\`\`\`
${ctx.schema.join("\n\n")}
\`\`\``);
  }
  if (ctx.existingTests.length > 0) {
    parts.push(`**Existing Tests:** ${ctx.existingTests.join(", ")}`);
  }
  return parts.join("\n\n");
}

// src/interview/prompts.ts
var INTERVIEW_PROMPT = `You are a product specification expert helping a developer define behavioral scenarios for a feature.

Your job is to conduct a structured interview to extract all the information needed to generate exhaustive test scenarios. You need to understand:

1. **Intent** \u2014 What is being built and why
2. **User workflows** \u2014 Step-by-step what users do
3. **Edge cases** \u2014 What happens with unusual inputs, states, or timing
4. **Failure modes** \u2014 What happens when things go wrong
5. **Business rules** \u2014 Limits, permissions, restrictions
6. **Operational concerns** \u2014 Performance, scale, reliability expectations

## Interview Guidelines

- Ask one focused question at a time
- Build on previous answers \u2014 don't repeat what you already know
- Use the codebase context to ask informed questions (e.g., "I see you have a User model with an email field \u2014 should email changes require verification?")
- When the developer gives a brief answer, probe deeper on areas that commonly cause bugs
- After 5-8 exchanges, check if they feel the feature is well-defined enough to generate scenarios
- Keep the conversation natural and efficient \u2014 don't ask obvious questions

## When you have enough information

When you believe you have enough context, respond with a structured summary in this exact format:

\`\`\`requirements
FEATURE: <feature name>
DESCRIPTION: <1-2 sentence summary>

WORKFLOWS:
- <workflow 1>
- <workflow 2>

EDGE_CASES:
- <edge case 1>
- <edge case 2>

FAILURE_MODES:
- <failure mode 1>
- <failure mode 2>

BUSINESS_RULES:
- <rule 1>
- <rule 2>

OPERATIONAL:
- <concern 1>
- <concern 2>
\`\`\`

Only output this summary when the developer confirms they're ready to generate scenarios. Before that, keep interviewing.`;
var EXPANSION_PROMPT = `You are a scenario generation engine. Given a requirements summary and codebase context, generate an exhaustive set of behavioral scenarios.

## Generation Layers

**Layer 1 \u2014 Direct scenarios:** Straight translations of the stated requirements. Happy paths, explicit edge cases, stated failure modes.

**Layer 2 \u2014 Combinatorial expansion:** Expand each scenario across variable dimensions:
- User states (new, active, expired, suspended, admin, guest)
- Input variations (valid, empty, malformed, boundary values, unicode, extremely long)
- Timing conditions (mid-operation, concurrent, rapid succession)
- Data conditions (first item, many items, at limit, zero results)

**Layer 3 \u2014 Cross-cutting concerns:** Apply universally:
- Authentication states (logged out, expired session, wrong permissions)
- Empty and loading states
- Network/timeout handling
- Idempotency (double-click, double-submit, back button after submit)
- Accessibility basics (keyboard navigation, screen reader labels)

**Layer 4 \u2014 Inferred scenarios:** Speculative edge cases based on common failure patterns in similar features. Flag these as confidence: inferred.

## Output Format

Return a JSON array of scenario objects. Each object must have:

\`\`\`json
[
  {
    "name": "Descriptive scenario name",
    "category": "category-slug",
    "context": ["precondition 1", "precondition 2"],
    "steps": ["Step 1 description", "Step 2 description"],
    "expected": ["Expected outcome 1", "Expected outcome 2"],
    "metadata": {
      "priority": "high|medium|low",
      "type": "happy-path|edge-case|failure-mode|infrastructure",
      "confidence": "direct|expanded|inferred"
    }
  }
]
\`\`\`

## Rules

- Generate at MINIMUM 30 scenarios. Aim for 40-80 for a typical feature.
- Every happy path should have corresponding edge cases and failure modes.
- Group scenarios logically by category (e.g., "auth", "checkout", "profile").
- Steps should be written as user-facing actions ("Click the submit button", "Enter email address"), not code-level instructions.
- Expected outcomes should be observable in the browser ("User sees success message", "Form shows validation error").
- Be specific: "Enter 'test@example.com' in the email field" not "Enter an email".
- Mark inferred scenarios clearly so the developer can review them.`;

// src/interview/interviewer.ts
function ask(rl, prompt) {
  return new Promise((resolve6) => {
    rl.question(prompt, (answer) => resolve6(answer));
  });
}
async function runInterview(featureDescription, options) {
  const s = spinner("Reading codebase...");
  const codebaseContext = readCodebaseContext(options.cwd);
  s.succeed("Codebase analyzed");
  const contextStr = formatCodebaseContext(codebaseContext);
  if (contextStr) {
    log.dim(
      `Found: ${codebaseContext.stack.join(", ") || "unknown stack"}, ${codebaseContext.routes.length} routes`
    );
  }
  const systemPrompt = `${INTERVIEW_PROMPT}

## Codebase Context

${contextStr}`;
  const messages = [
    {
      role: "user",
      content: `I want to build the following feature: ${featureDescription}

Please interview me to understand all the requirements.`
    }
  ];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const model = options.model ?? "claude-sonnet-4-5-20250929";
  try {
    while (true) {
      process.stdout.write("\n");
      let fullResponse = "";
      for await (const chunk of chatStream(messages, {
        system: systemPrompt,
        model
      })) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
      process.stdout.write("\n");
      messages.push({ role: "assistant", content: fullResponse });
      if (fullResponse.includes("```requirements")) {
        const requirementsMatch = fullResponse.match(
          /```requirements\n([\s\S]*?)\n```/
        );
        if (requirementsMatch) {
          log.heading("Requirements captured. Generating scenarios...");
          rl.close();
          return {
            requirements: requirementsMatch[1],
            conversationHistory: messages
          };
        }
      }
      const userInput = await ask(rl, "\n> ");
      if (userInput.toLowerCase() === "done" || userInput.toLowerCase() === "generate") {
        messages.push({
          role: "user",
          content: "I think that covers it. Please generate the requirements summary now."
        });
      } else {
        messages.push({ role: "user", content: userInput });
      }
    }
  } finally {
    rl.close();
  }
}

// src/scenarios/writer.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname2, join as join4 } from "path";
function writeScenarioFile(scenario, scenariosDir) {
  const content = formatScenario(scenario);
  const fileName = slugify(scenario.name) + ".md";
  const filePath = join4(scenariosDir, scenario.category, fileName);
  mkdirSync2(dirname2(filePath), { recursive: true });
  writeFileSync3(filePath, content, "utf-8");
  return filePath;
}
function formatScenario(scenario) {
  const lines = [];
  lines.push("---");
  lines.push(`priority: ${scenario.metadata.priority}`);
  lines.push(`type: ${scenario.metadata.type}`);
  lines.push(`confidence: ${scenario.metadata.confidence}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${capitalize(scenario.category)} \u2014 ${scenario.name}`);
  lines.push("");
  lines.push("## Context");
  for (const item of scenario.context) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Steps");
  scenario.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  lines.push("");
  lines.push("## Expected");
  for (const item of scenario.expected) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// src/interview/expansion.ts
async function expandScenarios(requirements, codebaseContext, options) {
  const s = spinner("Generating scenarios...");
  const response = await chat(
    [
      {
        role: "user",
        content: `## Requirements

${requirements}

## Codebase Context

${codebaseContext}

Generate the exhaustive scenario set as a JSON array. Return ONLY the JSON array, no other text.`
      }
    ],
    {
      system: EXPANSION_PROMPT,
      model: options.model ?? "claude-sonnet-4-5-20250929",
      maxTokens: 16384
    }
  );
  s.text = "Parsing scenarios...";
  let jsonStr = response.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  let scenarios;
  try {
    scenarios = JSON.parse(jsonStr);
  } catch {
    s.fail("Failed to parse generated scenarios");
    throw new Error(
      `Failed to parse scenario JSON from Claude response. Raw response:
${response.slice(0, 500)}`
    );
  }
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    s.fail("No scenarios generated");
    throw new Error("Claude returned an empty or invalid scenario array");
  }
  s.text = `Writing ${scenarios.length} scenario files...`;
  const byCategory = {};
  const byConfidence = {};
  for (const scenario of scenarios) {
    const input = {
      name: scenario.name,
      category: scenario.category,
      context: scenario.context ?? [],
      steps: scenario.steps ?? [],
      expected: scenario.expected ?? [],
      metadata: {
        priority: scenario.metadata?.priority ?? "medium",
        type: scenario.metadata?.type ?? "happy-path",
        confidence: scenario.metadata?.confidence ?? "expanded"
      }
    };
    writeScenarioFile(input, options.scenariosDir);
    byCategory[input.category] = (byCategory[input.category] ?? 0) + 1;
    byConfidence[input.metadata.confidence] = (byConfidence[input.metadata.confidence] ?? 0) + 1;
  }
  s.succeed(`Generated ${scenarios.length} scenarios`);
  return {
    total: scenarios.length,
    byCategory,
    byConfidence
  };
}

// src/cli/spec.ts
async function specCommand(description, options) {
  const cwd = process.cwd();
  let config;
  try {
    config = await loadConfig(cwd);
  } catch {
    log.warn("No litmus config found. Using defaults.");
    config = {
      baseUrl: "http://localhost:3000",
      scenariosDir: "specs/scenarios",
      model: "claude-sonnet-4-5-20250929",
      loop: { maxIterations: 15, maxCost: 5, model: "claude-sonnet-4-5-20250929" }
    };
  }
  const model = options.model ?? config.model;
  const { requirements } = await runInterview(description, {
    cwd,
    model
  });
  const codebaseCtx = readCodebaseContext(cwd);
  const contextStr = formatCodebaseContext(codebaseCtx);
  const scenariosDir = resolve3(cwd, config.scenariosDir);
  const result = await expandScenarios(requirements, contextStr, {
    scenariosDir,
    model
  });
  log.heading("Scenario Summary");
  log.info(`Total: ${result.total} scenarios`);
  log.heading("By Category:");
  for (const [cat, count] of Object.entries(result.byCategory)) {
    log.info(`  ${cat}: ${count}`);
  }
  log.heading("By Confidence:");
  for (const [conf, count] of Object.entries(result.byConfidence)) {
    log.info(`  ${conf}: ${count}`);
  }
  console.log("");
  log.info(
    `Scenarios written to ${config.scenariosDir}/`
  );
  log.info("Review and edit these files, then run: litmus loop");
}

// src/runner/scenario-runner.ts
import { resolve as resolve4 } from "path";

// src/scenarios/loader.ts
import { readdirSync as readdirSync2, statSync as statSync2 } from "fs";
import { join as join5, extname as extname2 } from "path";

// src/scenarios/parser.ts
import { readFileSync as readFileSync4 } from "fs";
import matter from "gray-matter";
import { basename, dirname as dirname3, relative } from "path";
function parseScenarioFile(filePath, scenariosDir) {
  const raw = readFileSync4(filePath, "utf-8");
  return parseScenario(raw, filePath, scenariosDir);
}
function parseScenario(raw, filePath, scenariosDir) {
  const { data: frontmatter, content } = matter(raw);
  const metadata = {
    priority: frontmatter.priority ?? "medium",
    type: frontmatter.type ?? "happy-path",
    confidence: frontmatter.confidence ?? "direct"
  };
  const headingMatch = content.match(/^#\s+(.+)$/m);
  const heading = headingMatch?.[1] ?? basename(filePath, ".md");
  const relPath = relative(scenariosDir, filePath);
  const category = dirname3(relPath) === "." ? "general" : dirname3(relPath);
  const nameParts = heading.split("\u2014").map((s) => s.trim());
  const name = nameParts.length > 1 ? nameParts[1] : nameParts[0];
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
    raw
  };
}
function extractSection(content, sectionName) {
  const sectionRegex = new RegExp(
    `##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i"
  );
  const match = content.match(sectionRegex);
  if (!match) return [];
  const sectionContent = match[1].trim();
  return sectionContent.split("\n").map((line) => line.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "").trim()).filter((line) => line.length > 0);
}

// src/scenarios/loader.ts
function loadAllScenarios(scenariosDir) {
  const files = findMarkdownFiles(scenariosDir);
  return files.map((f) => parseScenarioFile(f, scenariosDir));
}
function findMarkdownFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync2(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join5(dir, entry);
    const stat = statSync2(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (extname2(entry) === ".md") {
      results.push(fullPath);
    }
  }
  return results.sort();
}

// src/runner/translator.ts
var TRANSLATION_SYSTEM = `You are a Playwright test translator. Given a behavioral scenario written in natural language and the current page's content, output a JSON array of Playwright actions.

Each action must be one of these types:

- navigate: Go to a URL. { "type": "navigate", "url": "/path", "description": "..." }
- click: Click an element. { "type": "click", "selector": "role/text selector", "description": "..." }
- fill: Type into an input. { "type": "fill", "selector": "role/text selector", "value": "text to type", "description": "..." }
- select: Select from a dropdown. { "type": "select", "selector": "role/text selector", "value": "option", "description": "..." }
- wait: Wait for something. { "type": "wait", "selector": "role/text selector or timeout", "description": "..." }
- assert: Verify something is visible/correct. { "type": "assert", "selector": "role/text selector", "value": "expected text (optional)", "description": "..." }
- keyboard: Press a key. { "type": "keyboard", "key": "Enter", "description": "..." }

For selectors, prefer accessible selectors that Playwright supports:
- getByRole: 'button[name="Submit"]', 'link[name="Home"]', 'textbox[name="Email"]'
- getByText: 'text=Welcome back'
- getByPlaceholder: 'placeholder=Enter your email'
- getByLabel: 'label=Email address'
- CSS as last resort: '.class-name', '#id'

Return ONLY a JSON array of actions. No other text.`;
async function translateScenario(scenario, baseUrl, model) {
  const prompt = `## Scenario: ${scenario.name}

## Context (preconditions)
${scenario.context.map((c) => `- ${c}`).join("\n")}

## Steps to execute
${scenario.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Expected outcomes to verify
${scenario.expected.map((e) => `- ${e}`).join("\n")}

## Base URL: ${baseUrl}

Translate ALL steps AND expected outcomes into Playwright actions. Start by navigating to the appropriate page. End with assert actions for each expected outcome. Return ONLY the JSON array.`;
  const response = await chat(
    [{ role: "user", content: prompt }],
    {
      system: TRANSLATION_SYSTEM,
      model: model ?? "claude-sonnet-4-5-20250929",
      maxTokens: 4096
    }
  );
  let jsonStr = response.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  try {
    const actions = JSON.parse(jsonStr);
    if (!Array.isArray(actions)) throw new Error("Not an array");
    return actions;
  } catch {
    throw new Error(
      `Failed to translate scenario "${scenario.name}" to Playwright actions.
Response: ${response.slice(0, 300)}`
    );
  }
}

// src/runner/executor.ts
import { chromium } from "playwright";
import { mkdirSync as mkdirSync3 } from "fs";
import { join as join6, dirname as dirname4 } from "path";
var browser;
async function ensureBrowser(headed) {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: !headed
    });
  }
  return browser;
}
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = void 0;
  }
}
async function executeScenario(scenario, actions, options) {
  const start = Date.now();
  const stepResults = [];
  const consoleLogs = [];
  let context;
  let page;
  try {
    const b = await ensureBrowser(options.headed);
    context = await b.newContext({
      viewport: { width: 1280, height: 720 }
    });
    page = await context.newPage();
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (error) => {
      consoleLogs.push(`[error] ${error.message}`);
    });
    const timeout = options.timeout ?? 1e4;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const stepResult = {
        step: i + 1,
        description: action.description,
        passed: false
      };
      try {
        await executeAction(page, action, options.baseUrl, timeout);
        stepResult.passed = true;
      } catch (error) {
        stepResult.passed = false;
        stepResult.error = error instanceof Error ? error.message : String(error);
        const screenshotName = `${slugify2(scenario.name)}-step${i + 1}.png`;
        const screenshotPath = join6(options.screenshotDir, screenshotName);
        mkdirSync3(dirname4(screenshotPath), { recursive: true });
        try {
          await page.screenshot({ path: screenshotPath });
          stepResult.screenshotPath = screenshotPath;
        } catch {
        }
        stepResults.push(stepResult);
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
          duration: Date.now() - start
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
      duration: Date.now() - start
    };
  } finally {
    if (context) {
      await context.close().catch(() => {
      });
    }
  }
}
async function executeAction(page, action, baseUrl, timeout) {
  switch (action.type) {
    case "navigate": {
      const url = action.url?.startsWith("http") ? action.url : `${baseUrl}${action.url}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      break;
    }
    case "click": {
      const locator = resolveLocator(page, action.selector);
      await locator.click({ timeout });
      break;
    }
    case "fill": {
      const locator = resolveLocator(page, action.selector);
      await locator.fill(action.value, { timeout });
      break;
    }
    case "select": {
      const locator = resolveLocator(page, action.selector);
      await locator.selectOption(action.value, { timeout });
      break;
    }
    case "wait": {
      if (action.selector?.match(/^\d+$/)) {
        await page.waitForTimeout(parseInt(action.selector));
      } else if (action.selector) {
        const locator = resolveLocator(page, action.selector);
        await locator.waitFor({ state: "visible", timeout });
      } else {
        await page.waitForTimeout(1e3);
      }
      break;
    }
    case "assert": {
      const locator = resolveLocator(page, action.selector);
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
      await page.keyboard.press(action.key);
      break;
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
function resolveLocator(page, selector) {
  if (selector.startsWith("timeout=") || selector.startsWith("timeout:")) {
    return page.locator("body");
  }
  const roleShorthand = selector.match(/^role=(\w+)(?:\[name=['"](.+?)['"]\])?$/);
  if (roleShorthand) {
    const opts = roleShorthand[2] ? { name: roleShorthand[2] } : void 0;
    return page.getByRole(roleShorthand[1], opts).first();
  }
  const roleMatch = selector.match(
    /^(button|link|textbox|checkbox|radio|heading|img|dialog|alert|navigation|main|form|region|list|listitem|table|row|cell|option|combobox|menu|menuitem)\[name=['"](.+?)['"]\]$/
  );
  if (roleMatch) {
    return page.getByRole(roleMatch[1], {
      name: roleMatch[2]
    }).first();
  }
  if (selector.startsWith("text=")) {
    const textValue = selector.slice(5);
    return page.getByText(maybeRegex(textValue)).first();
  }
  const regexMatch = selector.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (regexMatch) {
    return page.getByText(new RegExp(regexMatch[1], regexMatch[2])).first();
  }
  const getByTextRegex = selector.match(/^getByText\(\/(.+?)\/([gimsuy]*)\)$/);
  if (getByTextRegex) {
    return page.getByText(new RegExp(getByTextRegex[1], getByTextRegex[2])).first();
  }
  if (selector.startsWith("placeholder=")) {
    return page.getByPlaceholder(selector.slice(12)).first();
  }
  if (selector.startsWith("label=")) {
    return page.getByLabel(selector.slice(6)).first();
  }
  if (selector.startsWith("testid=")) {
    return page.getByTestId(selector.slice(7)).first();
  }
  return page.locator(selector).first();
}
function maybeRegex(text) {
  const match = text.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (match) {
    return new RegExp(match[1], match[2]);
  }
  return text;
}
function slugify2(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// src/utils/dev-server.ts
import { spawn, execSync } from "child_process";
var serverProcess;
async function isServerReady(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5e3),
      redirect: "follow"
    });
    return response.status < 500;
  } catch {
    return false;
  }
}
async function waitForServer(url, maxWaitMs = 9e4) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isServerReady(url)) return true;
    await new Promise((r) => setTimeout(r, 2e3));
  }
  return false;
}
function startDevServer(command, cwd) {
  killProcessOnPort(3e3);
  const [cmd, ...args] = command.split(" ");
  serverProcess = spawn(cmd, args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, PORT: "3000" },
    shell: true
  });
  serverProcess.stdout?.on("data", () => {
  });
  serverProcess.stderr?.on("data", () => {
  });
  serverProcess.on("exit", () => {
    serverProcess = void 0;
  });
  return serverProcess;
}
function stopDevServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {
    }
    serverProcess = void 0;
  }
  killProcessOnPort(3e3);
}
function killProcessOnPort(port) {
  try {
    const pids = execSync(`lsof -ti:${port} 2>/dev/null`, {
      encoding: "utf-8"
    }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try {
          process.kill(parseInt(pid), "SIGTERM");
        } catch {
        }
      }
      execSync("sleep 1");
    }
  } catch {
  }
}
async function ensureDevServer(baseUrl, devCommand, cwd = process.cwd()) {
  if (await isServerReady(baseUrl)) {
    return true;
  }
  if (!devCommand) {
    throw new Error(
      `No server running at ${baseUrl} and no devCommand configured. Either start your dev server manually or add devCommand to litmus.config.ts`
    );
  }
  stopDevServer();
  await new Promise((r) => setTimeout(r, 2e3));
  startDevServer(devCommand, cwd);
  const ready = await waitForServer(baseUrl);
  if (!ready) {
    stopDevServer();
    throw new Error(
      `Dev server failed to start within 90 seconds. Command: ${devCommand}`
    );
  }
  return true;
}

// src/runner/scenario-runner.ts
import { execSync as execSync2 } from "child_process";
async function runAllScenarios(config, options = {}) {
  const start = Date.now();
  const cwd = process.cwd();
  const scenariosDir = resolve4(cwd, config.scenariosDir);
  const screenshotDir = resolve4(cwd, ".litmus", "failures");
  let scenarios = loadAllScenarios(scenariosDir);
  if (scenarios.length === 0) {
    throw new Error(
      `No scenarios found in ${config.scenariosDir}/. Run \`litmus spec\` to generate some.`
    );
  }
  if (options.filter) {
    const pattern = new RegExp(options.filter, "i");
    scenarios = scenarios.filter(
      (s2) => pattern.test(s2.name) || pattern.test(s2.category) || pattern.test(s2.filePath)
    );
    if (scenarios.length === 0) {
      throw new Error(`No scenarios match filter "${options.filter}"`);
    }
  }
  log.info(`Found ${scenarios.length} scenarios`);
  if (config.setup) {
    const s2 = spinner(`Running setup: ${config.setup}`);
    try {
      execSync2(config.setup, { cwd, stdio: "pipe" });
      s2.succeed("Setup complete");
    } catch (error) {
      s2.fail("Setup failed");
      throw error;
    }
  }
  const s = spinner(`Checking server at ${config.baseUrl}...`);
  try {
    await ensureDevServer(config.baseUrl, config.devCommand, cwd);
    s.succeed(`Server ready at ${config.baseUrl}`);
  } catch (error) {
    s.fail("Server not available");
    throw error;
  }
  const results = [];
  const model = options.model ?? config.model;
  log.heading("Running scenarios\n");
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const prefix = `[${i + 1}/${scenarios.length}]`;
    try {
      const actions = await translateScenario(scenario, config.baseUrl, model);
      const result = await executeScenario(scenario, actions, {
        baseUrl: config.baseUrl,
        headed: options.headed,
        screenshotDir
      });
      results.push(result);
      log.scenario(`${prefix} ${scenario.category}/${scenario.name}`, result.passed);
      if (!result.passed && result.actual) {
        log.dim(`      ${result.actual.slice(0, 120)}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        scenario,
        passed: false,
        stepResults: [],
        consoleLogs: [],
        actual: errorMsg,
        duration: 0
      });
      log.scenario(`${prefix} ${scenario.category}/${scenario.name}`, false);
      log.dim(`      ${errorMsg.slice(0, 120)}`);
    }
  }
  await closeBrowser();
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
    duration: Date.now() - start
  };
  return summary;
}
function printSummary(summary) {
  const { total, passed, failed, duration } = summary;
  log.heading("Results");
  if (failed === 0) {
    log.success(`All ${total} scenarios passing`);
  } else {
    log.fail(`${failed}/${total} scenarios failed`);
    log.heading("Failures:");
    for (const result of summary.results.filter((r) => !r.passed)) {
      console.log("");
      log.fail(`${result.scenario.category}/${result.scenario.name}`);
      if (result.failedStep) {
        log.dim(`  Step ${result.failedStep}: ${result.expected}`);
      }
      if (result.actual) {
        log.dim(`  Got: ${result.actual.slice(0, 200)}`);
      }
      if (result.screenshotPath) {
        log.dim(`  Screenshot: ${result.screenshotPath}`);
      }
    }
  }
  log.dim(`
Duration: ${(duration / 1e3).toFixed(1)}s`);
}
function formatFailureReport(summary) {
  const lines = [];
  lines.push(
    `## Verification Results: ${summary.passed}/${summary.total} passing
`
  );
  const failures = summary.results.filter((r) => !r.passed);
  if (failures.length === 0) return lines.join("\n");
  lines.push(`### ${failures.length} Failing Scenarios
`);
  for (const result of failures) {
    lines.push(`#### ${result.scenario.filePath}`);
    lines.push(`**Scenario:** ${result.scenario.name}`);
    if (result.failedStep) {
      const step = result.scenario.steps[result.failedStep - 1];
      lines.push(`**Failed at step ${result.failedStep}:** ${step}`);
    }
    if (result.expected) {
      lines.push(`**Expected:** ${result.expected}`);
    }
    if (result.actual) {
      lines.push(`**Actual:** ${result.actual}`);
    }
    if (result.consoleLogs.length > 0) {
      lines.push(`**Console:**`);
      for (const logEntry of result.consoleLogs.slice(0, 5)) {
        lines.push(`  ${logEntry}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/cli/verify.ts
async function verifyCommand(options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  try {
    const summary = await runAllScenarios(config, {
      headed: options.headed,
      filter: options.filter
    });
    printSummary(summary);
    if (summary.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    log.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    stopDevServer();
  }
}

// src/loop/ralph.ts
import { writeFileSync as writeFileSync5, mkdirSync as mkdirSync4 } from "fs";
import { join as join8 } from "path";

// src/loop/coding-agent.ts
import { spawn as spawn2, spawnSync } from "child_process";
import { writeFileSync as writeFileSync4 } from "fs";
import { resolve as resolve5, join as join7 } from "path";
async function invokeCodingAgent(options) {
  const { cwd } = options;
  const prompt = buildCodingPrompt(options);
  const promptPath = join7(cwd, ".litmus", "last-prompt.md");
  writeFileSync4(promptPath, prompt, "utf-8");
  if (!isClaudeCodeAvailable()) {
    throw new Error(
      "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code\nOr ensure the `claude` command is available in your PATH."
    );
  }
  return invokeClaude(prompt, cwd);
}
function buildCodingPrompt(options) {
  const { scenariosDir, failureReport, iteration, cwd } = options;
  const scenariosPath = resolve5(cwd, scenariosDir);
  const parts = [];
  parts.push(`# Coding Agent \u2014 Iteration ${iteration}`);
  parts.push("");
  parts.push(
    "You are implementing a feature. Your goal is to make ALL behavioral scenarios pass."
  );
  parts.push("");
  parts.push("## Rules");
  parts.push("- Read the scenario files to understand what needs to be built");
  parts.push(
    "- NEVER modify scenario files in specs/scenarios/ \u2014 they are the specification"
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
function isClaudeCodeAvailable() {
  try {
    const result = spawnSync("which", ["claude"], { encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
}
async function invokeClaude(prompt, cwd) {
  const s = spinner("Coding agent working...");
  return new Promise((resolve6) => {
    const chunks = [];
    const errChunks = [];
    const proc = spawn2(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        "Read,Write,Edit,Bash(npm install:*),Bash(npx:*),Bash(cat:*),Bash(ls:*),Glob,Grep",
        "--output-format",
        "text"
      ],
      {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    proc.stdout?.on("data", (data) => {
      chunks.push(data.toString());
    });
    proc.stderr?.on("data", (data) => {
      errChunks.push(data.toString());
    });
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      s.fail("Coding agent timed out (10 min)");
      resolve6({
        success: false,
        output: chunks.join("") + "\n[TIMED OUT after 10 minutes]"
      });
    }, 6e5);
    proc.on("close", (code) => {
      clearTimeout(timeout);
      const output = chunks.join("");
      if (code === 0) {
        s.succeed("Coding agent completed");
        resolve6({ success: true, output });
      } else {
        s.succeed("Coding agent completed (exit code " + code + ")");
        resolve6({ success: code === 0, output: output || errChunks.join("") });
      }
    });
    proc.on("error", (error) => {
      clearTimeout(timeout);
      s.fail("Coding agent error");
      resolve6({
        success: false,
        output: error.message
      });
    });
  });
}

// src/loop/circuit-breaker.ts
var CircuitBreaker = class {
  history = [];
  maxStagnantIterations;
  constructor(maxStagnantIterations = 5) {
    this.maxStagnantIterations = maxStagnantIterations;
  }
  record(iteration, summary) {
    this.history.push({
      iteration,
      passed: summary.passed,
      failed: summary.failed,
      failingScenarios: summary.results.filter((r) => !r.passed).map((r) => r.scenario.filePath)
    });
  }
  /**
   * Check if the loop should stop due to stagnation.
   * Returns a reason string if should stop, undefined otherwise.
   */
  shouldStop() {
    if (this.history.length < 3) return void 0;
    const recent = this.history.slice(-this.maxStagnantIterations);
    if (recent.length >= this.maxStagnantIterations) {
      const failCounts = recent.map((r) => r.failed);
      const allSame = failCounts.every((c) => c === failCounts[0]);
      if (allSame && failCounts[0] > 0) {
        return `No progress: ${failCounts[0]} scenarios have been failing for ${this.maxStagnantIterations} consecutive iterations.`;
      }
    }
    const bestSoFar = Math.min(...this.history.map((r) => r.failed));
    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];
    if (current.failed > previous.failed && current.failed > bestSoFar + 3) {
      return `Regression detected: ${current.failed} failures (was ${previous.failed}, best was ${bestSoFar}). The coding agent may be making things worse.`;
    }
    if (this.history.length >= 4) {
      const last4 = this.history.slice(-4);
      const pattern1 = JSON.stringify(last4[0].failingScenarios);
      const pattern3 = JSON.stringify(last4[2].failingScenarios);
      const pattern2 = JSON.stringify(last4[1].failingScenarios);
      const pattern4 = JSON.stringify(last4[3].failingScenarios);
      if (pattern1 === pattern3 && pattern2 === pattern4 && pattern1 !== pattern2) {
        return "Oscillation detected: the coding agent is alternating between two states. It may be fixing one scenario while breaking another.";
      }
    }
    return void 0;
  }
  /**
   * Get a summary of the stuck scenarios for the human.
   */
  getStuckScenarios() {
    if (this.history.length < 3) return [];
    const recentFailures = this.history.slice(-3);
    const scenarioSets = recentFailures.map((r) => new Set(r.failingScenarios));
    const firstSet = scenarioSets[0];
    return [...firstSet].filter(
      (s) => scenarioSets.every((set) => set.has(s))
    );
  }
  getHistory() {
    return [...this.history];
  }
};

// src/loop/ralph.ts
async function runRalphLoop(config, options) {
  const cwd = process.cwd();
  const litmusDir = join8(cwd, ".litmus");
  mkdirSync4(litmusDir, { recursive: true });
  const circuitBreaker = new CircuitBreaker(5);
  let lastFailureReport;
  let lastSummary;
  log.heading(
    `Starting ralph loop (max ${options.maxIterations} iterations, budget $${options.maxCost})`
  );
  console.log("");
  try {
    for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
      log.heading(`\u2500\u2500 Iteration ${iteration} \u2500\u2500`);
      const agentResult = await invokeCodingAgent({
        model: options.model,
        cwd,
        scenariosDir: config.scenariosDir,
        failureReport: lastFailureReport,
        iteration
      });
      writeFileSync5(
        join8(litmusDir, `agent-output-${iteration}.md`),
        agentResult.output,
        "utf-8"
      );
      if (!agentResult.success) {
        log.warn(`Coding agent returned non-zero exit code (iteration ${iteration})`);
      }
      log.info("Verifying scenarios...");
      try {
        lastSummary = await runAllScenarios(config, {
          model: options.model
        });
      } catch (error) {
        log.fail(
          `Verification failed: ${error instanceof Error ? error.message : error}`
        );
        continue;
      }
      const { total, passed, failed } = lastSummary;
      if (failed === 0) {
        log.success(`All ${total} scenarios passing!`);
        printSummary(lastSummary);
        return {
          success: true,
          iterations: iteration,
          finalSummary: lastSummary
        };
      }
      log.info(`${passed}/${total} passing (${failed} failing)`);
      circuitBreaker.record(iteration, lastSummary);
      const stopReason = circuitBreaker.shouldStop();
      if (stopReason) {
        log.warn(`Circuit breaker: ${stopReason}`);
        const stuckScenarios = circuitBreaker.getStuckScenarios();
        if (stuckScenarios.length > 0) {
          log.heading("Persistently failing scenarios:");
          for (const s of stuckScenarios) {
            log.dim(`  ${s}`);
          }
        }
        printSummary(lastSummary);
        return {
          success: false,
          iterations: iteration,
          finalSummary: lastSummary,
          stoppedReason: stopReason
        };
      }
      lastFailureReport = formatFailureReport(lastSummary);
      writeFileSync5(
        join8(litmusDir, `failures-${iteration}.md`),
        lastFailureReport,
        "utf-8"
      );
      log.dim("Failures fed back to coding agent.\n");
    }
    log.warn(`Reached maximum iterations (${options.maxIterations})`);
    if (lastSummary) {
      printSummary(lastSummary);
    }
    return {
      success: false,
      iterations: options.maxIterations,
      finalSummary: lastSummary,
      stoppedReason: `Reached maximum iterations (${options.maxIterations})`
    };
  } finally {
    await closeBrowser();
    stopDevServer();
  }
}

// src/cli/loop.ts
async function loopCommand(options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const maxIterations = parseInt(options.maxIterations, 10) || config.loop?.maxIterations || 15;
  const maxCost = parseFloat(options.maxCost) || config.loop?.maxCost || 5;
  const model = options.model ?? config.loop?.model ?? config.model;
  try {
    const result = await runRalphLoop(config, {
      maxIterations,
      maxCost,
      model
    });
    if (result.success) {
      log.heading("Done!");
      log.success(
        `All scenarios passing after ${result.iterations} iteration${result.iterations === 1 ? "" : "s"}`
      );
    } else {
      log.heading("Loop stopped");
      if (result.stoppedReason) {
        log.warn(result.stoppedReason);
      }
      log.info(
        "Review the failing scenarios and either fix them or run `litmus loop` again."
      );
      process.exit(1);
    }
  } catch (error) {
    log.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// src/cli/index.ts
var program = new Command();
program.name("litmus").description(
  "Generate exhaustive behavioral scenarios and iterate until they all pass"
).version("0.1.0");
program.command("init").description("Initialize litmus in your project").action(initCommand);
program.command("spec").description("Interview about a feature and generate scenarios").argument("<description>", "High-level description of the feature").option("-m, --model <model>", "Claude model to use").action(specCommand);
program.command("verify").description("Run all scenarios against the running app").option("--headed", "Run browser in headed mode (visible)").option("-f, --filter <pattern>", "Only run scenarios matching pattern").action(verifyCommand);
program.command("loop").description(
  "Run the ralph loop: code until all scenarios pass"
).option(
  "-n, --max-iterations <n>",
  "Maximum iterations before stopping",
  "15"
).option("--max-cost <dollars>", "Maximum cost in dollars", "5").option("-m, --model <model>", "Claude model for coding agent").action(loopCommand);
program.parse();
//# sourceMappingURL=cli.js.map