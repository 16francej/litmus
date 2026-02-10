import { createInterface } from "readline";
import { chatStream, type Message } from "../utils/claude.js";
import {
  readCodebaseContext,
  formatCodebaseContext,
} from "./codebase-reader.js";
import { log, spinner } from "../utils/logger.js";
import { INTERVIEW_PROMPT } from "./prompts.js";

function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

export interface InterviewResult {
  requirements: string;
  conversationHistory: Message[];
}

/**
 * Run the specification interview. Conducts a multi-turn conversation
 * with the developer to understand the feature requirements.
 */
export async function runInterview(
  featureDescription: string,
  options: { cwd: string; model?: string }
): Promise<InterviewResult> {
  const s = spinner("Reading codebase...");
  const codebaseContext = readCodebaseContext(options.cwd);
  s.succeed("Codebase analyzed");

  const contextStr = formatCodebaseContext(codebaseContext);
  if (contextStr) {
    log.dim(
      `Found: ${codebaseContext.stack.join(", ") || "unknown stack"}, ${codebaseContext.routes.length} routes`
    );
  }

  const systemPrompt = `${INTERVIEW_PROMPT}\n\n## Codebase Context\n\n${contextStr}`;

  const messages: Message[] = [
    {
      role: "user",
      content: `I want to build the following feature: ${featureDescription}\n\nPlease interview me to understand all the requirements.`,
    },
  ];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const model = options.model ?? "claude-sonnet-4-5-20250929";

  try {
    while (true) {
      // Get Claude's response (streamed to terminal)
      process.stdout.write("\n");
      let fullResponse = "";

      for await (const chunk of chatStream(messages, {
        system: systemPrompt,
        model,
      })) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }

      process.stdout.write("\n");

      messages.push({ role: "assistant", content: fullResponse });

      // Check if the response contains the requirements summary
      if (fullResponse.includes("```requirements")) {
        const requirementsMatch = fullResponse.match(
          /```requirements\n([\s\S]*?)\n```/
        );
        if (requirementsMatch) {
          log.heading("Requirements captured. Generating scenarios...");
          rl.close();
          return {
            requirements: requirementsMatch[1],
            conversationHistory: messages,
          };
        }
      }

      // Get developer input
      const userInput = await ask(rl, "\n> ");

      if (
        userInput.toLowerCase() === "done" ||
        userInput.toLowerCase() === "generate"
      ) {
        messages.push({
          role: "user",
          content:
            "I think that covers it. Please generate the requirements summary now.",
        });
      } else {
        messages.push({ role: "user", content: userInput });
      }
    }
  } finally {
    rl.close();
  }
}
