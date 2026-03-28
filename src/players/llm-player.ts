import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Player } from '../core/player.js'
import type { ActionRequest } from '../core/types.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'

export interface LLMPlayerOptions {
  model?: string
  persona?: string
}

const BASE_PROMPT = `You are a board game player. You will receive a description of the current game state visible to you, and you must choose an action.

Always respond directly. Never refuse to act.`

const MEMORY_PROMPT = `You have a private memory that persists between turns. Use it to track observations, suspicions, and plans. Keep it concise — under 300 words. Focus on what matters most for your next decisions.`

const REASONING_PROMPT = `Think carefully before acting. Your reasoning is private and will not be shared with other players.`

function buildSystemPrompt(persona?: string): string {
  const parts = [BASE_PROMPT]
  if (persona) parts.push(persona)
  parts.push(MEMORY_PROMPT)
  parts.push(REASONING_PROMPT)
  return parts.join('\n\n')
}

export class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  private readonly model: string
  private readonly persona?: string
  private memory = ''
  private lastReasoning_?: string

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.model = options?.model ?? DEFAULT_MODEL
    this.persona = options?.persona
  }

  getMemory(): string { return this.memory }
  getLastReasoning(): string | undefined { return this.lastReasoning_ }

  async act(request: ActionRequest): Promise<unknown> {
    const systemPrompt = buildSystemPrompt(this.persona)
    const view = typeof request.view === 'string' ? request.view : JSON.stringify(request.view, null, 2)

    const parts = ['Current game state (your view):\n\n' + view]
    if (this.memory) {
      parts.push('Your memory from previous turns:\n\n' + this.memory)
    }
    parts.push('Choose your action.')
    const userMessage = parts.join('\n\n')

    const wrappedSchema = z.object({
      reasoning: z.string().describe('Your private reasoning about the current situation'),
      memory: z.string().describe('Updated memory — keep concise, under 300 words'),
      action: request.actionSchema as z.ZodTypeAny,
    })

    const result = await generateText({
      model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      tools: {
        submit_action: tool({
          description: 'Submit your reasoning, updated memory, and chosen action',
          inputSchema: wrappedSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'submit_action' },
    })

    const call = result.toolCalls[0]
    if (!call) throw new Error('LLM returned no tool call')

    const response = call.input as { reasoning: string; memory: string; action: unknown }
    this.memory = response.memory
    this.lastReasoning_ = response.reasoning

    return response.action
  }
}
