import * as playwright from 'playwright';
import { z } from 'zod';

declare const configSchema: z.ZodObject<{
    baseUrl: z.ZodString;
    devCommand: z.ZodOptional<z.ZodString>;
    auth: z.ZodOptional<z.ZodObject<{
        loginUrl: z.ZodOptional<z.ZodString>;
        testUser: z.ZodOptional<z.ZodObject<{
            email: z.ZodString;
            password: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            email: string;
            password: string;
        }, {
            email: string;
            password: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        loginUrl?: string | undefined;
        testUser?: {
            email: string;
            password: string;
        } | undefined;
    }, {
        loginUrl?: string | undefined;
        testUser?: {
            email: string;
            password: string;
        } | undefined;
    }>>;
    setup: z.ZodOptional<z.ZodString>;
    model: z.ZodDefault<z.ZodString>;
    loop: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        maxIterations: z.ZodDefault<z.ZodNumber>;
        maxCost: z.ZodDefault<z.ZodNumber>;
        model: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        model: string;
        maxIterations: number;
        maxCost: number;
    }, {
        model?: string | undefined;
        maxIterations?: number | undefined;
        maxCost?: number | undefined;
    }>>>;
    scenariosDir: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    baseUrl: string;
    model: string;
    loop: {
        model: string;
        maxIterations: number;
        maxCost: number;
    };
    scenariosDir: string;
    devCommand?: string | undefined;
    auth?: {
        loginUrl?: string | undefined;
        testUser?: {
            email: string;
            password: string;
        } | undefined;
    } | undefined;
    setup?: string | undefined;
}, {
    baseUrl: string;
    devCommand?: string | undefined;
    auth?: {
        loginUrl?: string | undefined;
        testUser?: {
            email: string;
            password: string;
        } | undefined;
    } | undefined;
    setup?: string | undefined;
    model?: string | undefined;
    loop?: {
        model?: string | undefined;
        maxIterations?: number | undefined;
        maxCost?: number | undefined;
    } | undefined;
    scenariosDir?: string | undefined;
}>;
type LitmusConfig = z.infer<typeof configSchema>;
type AuthSetupFn = (page: playwright.Page) => Promise<void>;
interface ResolvedConfig extends LitmusConfig {
    authSetup?: AuthSetupFn;
}

interface ScenarioMetadata {
    priority: "high" | "medium" | "low";
    type: "happy-path" | "edge-case" | "failure-mode" | "infrastructure";
    confidence: "direct" | "expanded" | "inferred";
}
interface Scenario {
    name: string;
    category: string;
    filePath: string;
    context: string[];
    steps: string[];
    expected: string[];
    metadata: ScenarioMetadata;
    raw: string;
}
interface StepResult {
    step: number;
    description: string;
    passed: boolean;
    error?: string;
    screenshotPath?: string;
}
interface VerificationResult {
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
interface VerificationSummary {
    total: number;
    passed: number;
    failed: number;
    results: VerificationResult[];
    duration: number;
}

/**
 * Helper for defining a litmus config with type checking.
 */
declare function defineConfig(config: LitmusConfig): LitmusConfig;

export { type LitmusConfig, type ResolvedConfig, type Scenario, type ScenarioMetadata, type VerificationResult, type VerificationSummary, defineConfig };
