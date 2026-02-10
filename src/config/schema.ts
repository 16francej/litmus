import { z } from "zod";

export const authConfigSchema = z.object({
  loginUrl: z.string().optional(),
  testUser: z
    .object({
      email: z.string(),
      password: z.string(),
    })
    .optional(),
  // Custom setup function is handled at runtime, not validated by Zod
});

export const loopConfigSchema = z.object({
  maxIterations: z.number().default(15),
  maxCost: z.number().default(5),
  model: z.string().default("claude-sonnet-4-5-20250929"),
});

export const configSchema = z.object({
  baseUrl: z.string().url(),
  devCommand: z.string().optional(),
  auth: authConfigSchema.optional(),
  setup: z.string().optional(),
  model: z.string().default("claude-sonnet-4-5-20250929"),
  loop: loopConfigSchema.optional().default({}),
  scenariosDir: z.string().default("specs/scenarios"),
});

export type LitmusConfig = z.infer<typeof configSchema>;

export type AuthSetupFn = (page: import("playwright").Page) => Promise<void>;

export interface ResolvedConfig extends LitmusConfig {
  authSetup?: AuthSetupFn;
}
