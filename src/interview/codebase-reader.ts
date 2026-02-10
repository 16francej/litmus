import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

export interface CodebaseContext {
  stack: string[];
  routes: string[];
  schema: string[];
  components: string[];
  existingTests: string[];
  packageInfo: Record<string, unknown> | null;
}

/**
 * Scan the project to understand the codebase and provide context for the interview.
 */
export function readCodebaseContext(cwd: string): CodebaseContext {
  const context: CodebaseContext = {
    stack: [],
    routes: [],
    schema: [],
    components: [],
    existingTests: [],
    packageInfo: null,
  };

  // Read package.json
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      context.packageInfo = JSON.parse(readFileSync(pkgPath, "utf-8"));
      context.stack.push(...detectStack(context.packageInfo as Record<string, unknown>));
    } catch {
      // ignore
    }
  }

  // Detect Next.js app routes
  const appDir = join(cwd, "app");
  const srcAppDir = join(cwd, "src", "app");
  const pagesDir = join(cwd, "pages");
  const srcPagesDir = join(cwd, "src", "pages");

  for (const dir of [appDir, srcAppDir]) {
    if (existsSync(dir)) {
      context.routes.push(...findNextAppRoutes(dir, dir));
    }
  }

  for (const dir of [pagesDir, srcPagesDir]) {
    if (existsSync(dir)) {
      context.routes.push(...findNextPageRoutes(dir, dir));
    }
  }

  // Detect Prisma schema
  const prismaPath = join(cwd, "prisma", "schema.prisma");
  if (existsSync(prismaPath)) {
    const schema = readFileSync(prismaPath, "utf-8");
    context.schema.push(truncate(schema, 3000));
    context.stack.push("Prisma ORM");
  }

  // Detect Drizzle schema
  const drizzleFiles = findFiles(cwd, (f) =>
    f.includes("schema") && (f.endsWith(".ts") || f.endsWith(".js")) && f.includes("drizzle")
  );
  for (const f of drizzleFiles.slice(0, 3)) {
    context.schema.push(truncate(readFileSync(f, "utf-8"), 2000));
    if (!context.stack.includes("Drizzle ORM")) context.stack.push("Drizzle ORM");
  }

  // Find components
  const componentDirs = ["components", "src/components", "app/components"];
  for (const dir of componentDirs) {
    const fullDir = join(cwd, dir);
    if (existsSync(fullDir)) {
      context.components.push(
        ...listFilesShallow(fullDir).map((f) => f.replace(cwd + "/", ""))
      );
    }
  }

  // Find existing tests
  const testPatterns = ["__tests__", "tests", "test", "spec", "*.test.*", "*.spec.*"];
  const testFiles = findFiles(cwd, (f) => {
    const lower = f.toLowerCase();
    return (
      (lower.includes(".test.") || lower.includes(".spec.") || lower.includes("__tests__")) &&
      !lower.includes("node_modules")
    );
  });
  context.existingTests = testFiles.slice(0, 20).map((f) => f.replace(cwd + "/", ""));

  return context;
}

function detectStack(pkg: Record<string, unknown>): string[] {
  const stack: string[] = [];
  const deps = {
    ...(pkg.dependencies as Record<string, string> ?? {}),
    ...(pkg.devDependencies as Record<string, string> ?? {}),
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

function findNextAppRoutes(dir: string, baseDir: string): string[] {
  const routes: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
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
    // ignore
  }
  return routes;
}

function findNextPageRoutes(dir: string, baseDir: string): string[] {
  const routes: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        routes.push(...findNextPageRoutes(fullPath, baseDir));
      } else if (/\.(tsx?|jsx?)$/.test(entry) && !entry.startsWith("_")) {
        const route = fullPath
          .replace(baseDir, "")
          .replace(/\\/g, "/")
          .replace(/\.(tsx?|jsx?)$/, "")
          .replace(/\/index$/, "/");
        routes.push(route);
      }
    }
  } catch {
    // ignore
  }
  return routes;
}

function findFiles(
  dir: string,
  predicate: (filePath: string) => boolean,
  maxDepth: number = 4,
  currentDepth: number = 0
): string[] {
  if (currentDepth >= maxDepth) return [];
  const results: string[] = [];

  try {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".git" || entry === ".next" || entry === "dist") {
        continue;
      }
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findFiles(fullPath, predicate, maxDepth, currentDepth + 1));
      } else if (predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore
  }

  return results;
}

function listFilesShallow(dir: string): string[] {
  try {
    return readdirSync(dir)
      .map((f) => join(dir, f))
      .filter((f) => statSync(f).isFile())
      .slice(0, 30);
  } catch {
    return [];
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n... (truncated)";
}

/**
 * Format the codebase context into a string for the LLM system prompt.
 */
export function formatCodebaseContext(ctx: CodebaseContext): string {
  const parts: string[] = [];

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
    parts.push(`**Database Schema:**\n\`\`\`\n${ctx.schema.join("\n\n")}\n\`\`\``);
  }

  if (ctx.existingTests.length > 0) {
    parts.push(`**Existing Tests:** ${ctx.existingTests.join(", ")}`);
  }

  return parts.join("\n\n");
}
