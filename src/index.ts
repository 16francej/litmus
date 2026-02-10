import type { LitmusConfig } from "./config/schema.js";

export type { LitmusConfig, ResolvedConfig } from "./config/schema.js";
export type {
  Scenario,
  ScenarioMetadata,
  VerificationResult,
  VerificationSummary,
} from "./scenarios/types.js";

/**
 * Helper for defining a litmus config with type checking.
 */
export function defineConfig(config: LitmusConfig): LitmusConfig {
  return config;
}
