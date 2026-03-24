import Anthropic from '@anthropic-ai/sdk';

export interface LLMClientOptions {
  model?: string;
  apiKey?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class LLMClient {
  private client: Anthropic;
  private model: string;

  constructor(options?: LLMClientOptions) {
    this.model = options?.model ?? 'claude-sonnet-4-20250514';
    this.client = new Anthropic(
      options?.apiKey ? { apiKey: options.apiKey } : undefined,
    );
  }

  async call(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    tool: ToolDefinition,
  ): Promise<unknown> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: [
        {
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: tool.name },
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      throw new Error(
        `No tool_use block found in response (stop_reason: ${response.stop_reason})`,
      );
    }

    return toolUseBlock.input;
  }
}
