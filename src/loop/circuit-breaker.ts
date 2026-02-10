import type { VerificationSummary } from "../scenarios/types.js";

export interface IterationRecord {
  iteration: number;
  passed: number;
  failed: number;
  failingScenarios: string[];
}

/**
 * Track iteration history and detect stagnation.
 */
export class CircuitBreaker {
  private history: IterationRecord[] = [];
  private maxStagnantIterations: number;

  constructor(maxStagnantIterations: number = 5) {
    this.maxStagnantIterations = maxStagnantIterations;
  }

  record(iteration: number, summary: VerificationSummary): void {
    this.history.push({
      iteration,
      passed: summary.passed,
      failed: summary.failed,
      failingScenarios: summary.results
        .filter((r) => !r.passed)
        .map((r) => r.scenario.filePath),
    });
  }

  /**
   * Check if the loop should stop due to stagnation.
   * Returns a reason string if should stop, undefined otherwise.
   */
  shouldStop(): string | undefined {
    if (this.history.length < 3) return undefined;

    // Check for no progress: same number of failures for N iterations
    const recent = this.history.slice(-this.maxStagnantIterations);
    if (recent.length >= this.maxStagnantIterations) {
      const failCounts = recent.map((r) => r.failed);
      const allSame = failCounts.every((c) => c === failCounts[0]);
      if (allSame && failCounts[0] > 0) {
        return `No progress: ${failCounts[0]} scenarios have been failing for ${this.maxStagnantIterations} consecutive iterations.`;
      }
    }

    // Check for regression: more failures than previous best
    const bestSoFar = Math.min(...this.history.map((r) => r.failed));
    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];
    if (
      current.failed > previous.failed &&
      current.failed > bestSoFar + 3
    ) {
      return `Regression detected: ${current.failed} failures (was ${previous.failed}, best was ${bestSoFar}). The coding agent may be making things worse.`;
    }

    // Check for oscillation: same scenarios alternately passing/failing
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

    return undefined;
  }

  /**
   * Get a summary of the stuck scenarios for the human.
   */
  getStuckScenarios(): string[] {
    if (this.history.length < 3) return [];

    const recentFailures = this.history.slice(-3);
    const scenarioSets = recentFailures.map((r) => new Set(r.failingScenarios));

    // Find scenarios that appear in all recent failure sets
    const firstSet = scenarioSets[0];
    return [...firstSet].filter((s) =>
      scenarioSets.every((set) => set.has(s))
    );
  }

  getHistory(): IterationRecord[] {
    return [...this.history];
  }
}
