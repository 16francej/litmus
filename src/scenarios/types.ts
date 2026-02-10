export interface ScenarioMetadata {
  priority: "high" | "medium" | "low";
  type: "happy-path" | "edge-case" | "failure-mode" | "infrastructure";
  confidence: "direct" | "expanded" | "inferred";
}

export interface Scenario {
  name: string;
  category: string;
  filePath: string;
  context: string[];
  steps: string[];
  expected: string[];
  metadata: ScenarioMetadata;
  raw: string;
}

export interface StepResult {
  step: number;
  description: string;
  passed: boolean;
  error?: string;
  screenshotPath?: string;
}

export interface VerificationResult {
  scenario: Scenario;
  passed: boolean;
  stepResults: StepResult[];
  failedStep?: number;
  expected?: string;
  actual?: string;
  screenshotPath?: string;
  consoleLogs: string[];
  duration: number;
}

export interface VerificationSummary {
  total: number;
  passed: number;
  failed: number;
  results: VerificationResult[];
  duration: number;
}
