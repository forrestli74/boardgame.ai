import { z } from 'zod'
import type { Player } from '../core/player.js'
import type { ActionRequest } from '../core/types.js'
import { LLMClient, type LLMClientOptions, type ToolDefinition } from '../ai-game-master/llm-client.js'

export interface LLMPlayerOptions extends LLMClientOptions {
  persona?: string
}

const SYSTEM_PROMPT = `You are a board game player. You will receive a description of the current game state visible to you, and you must choose an action.

Think step-by-step:
1. Analyze the current game state
2. Consider what actions are available to you
3. Reason about which action gives you the best outcome
4. Choose your action by calling the provided tool

Always use the tool to submit your chosen action. Never refuse to act.`

function buildSystemPrompt(persona?: string): string {
  if (!persona) return SYSTEM_PROMPT
  return `${SYSTEM_PROMPT}\n\nPlayer persona: ${persona}`
}

function formatView(view: unknown): string {
  if (typeof view === 'string') return view
  return JSON.stringify(view, null, 2)
}

export class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  private readonly llmClient: LLMClient
  private readonly persona?: string

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.persona = options?.persona
    this.llmClient = new LLMClient(options)
  }

  async act(request: ActionRequest): Promise<unknown> {
    const systemPrompt = buildSystemPrompt(this.persona)

    const viewText = formatView(request.view)
    const userMessage = `Current game state (your view):\n\n${viewText}\n\nChoose your action.`

    const jsonSchema = z.toJSONSchema(request.actionSchema)

    const tool: ToolDefinition = {
      name: 'submit_action',
      description: 'Submit your chosen action for this turn',
      input_schema: jsonSchema as Record<string, unknown>,
    }

    return this.llmClient.call(
      systemPrompt,
      [{ role: 'user', content: userMessage }],
      tool,
    )
  }
}
