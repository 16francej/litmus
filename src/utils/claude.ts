import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getClient(): Anthropic {
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

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function chat(
  messages: Message[],
  options: {
    system?: string;
    model?: string;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: options.model ?? "claude-sonnet-4-5-20250929",
    max_tokens: options.maxTokens ?? 8192,
    system: options.system,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text ?? "";
}

export async function* chatStream(
  messages: Message[],
  options: {
    system?: string;
    model?: string;
    maxTokens?: number;
  } = {}
): AsyncGenerator<string> {
  const anthropic = getClient();

  const stream = anthropic.messages.stream({
    model: options.model ?? "claude-sonnet-4-5-20250929",
    max_tokens: options.maxTokens ?? 8192,
    system: options.system,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

/**
 * Estimate token cost in dollars for Claude Sonnet.
 * Input: $3/MTok, Output: $15/MTok (approximate)
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number
): number {
  return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
}
