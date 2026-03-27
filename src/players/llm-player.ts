import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Player } from '../core/player.js'
import type { ActionRequest } from '../core/types.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'

export interface LLMPlayerOptions {
  model?: string
  persona?: string
}

const SYSTEM_PROMPT = `You are a board game player. You will receive a description of the current game state visible to you, and you must choose an action.

Think step-by-step:
1. Analyze the current game state
2. Consider what actions are available to you
3. Reason about which action gives you the best outcome
4. Respond with your chosen action

Always respond directly. Never refuse to act.`

function buildSystemPrompt(persona?: string): string {
  if (!persona) return SYSTEM_PROMPT
  return `${SYSTEM_PROMPT}\n\nPlayer persona: ${persona}`
}

function isTextMode(request: ActionRequest): boolean {
  // Text mode: actionSchema accepts any string (z.string())
  const test = request.actionSchema.safeParse('test-string')
  const testNum = request.actionSchema.safeParse(42)
  return test.success && !testNum.success
}

export class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  private readonly model: string
  private readonly persona?: string

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.model = options?.model ?? DEFAULT_MODEL
    this.persona = options?.persona
  }

  async act(request: ActionRequest): Promise<unknown> {
    const systemPrompt = buildSystemPrompt(this.persona)
    const view = typeof request.view === 'string' ? request.view : JSON.stringify(request.view, null, 2)

    if (isTextMode(request)) {
      return this.actText(systemPrompt, view)
    }
    return this.actStructured(systemPrompt, view, request)
  }

  private async actText(systemPrompt: string, view: string): Promise<string> {
    const result = await generateText({
      model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: view }],
      maxOutputTokens: 4096,
    })
    return result.text
  }

  private async actStructured(systemPrompt: string, view: string, request: ActionRequest): Promise<unknown> {
    const userMessage = `Current game state (your view):\n\n${view}\n\nChoose your action.`
    const result = await generateText({
      model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      tools: {
        submit_action: tool({
          description: 'Submit your chosen action for this turn',
          inputSchema: request.actionSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'submit_action' },
    })

    const call = result.toolCalls[0]
    if (!call) throw new Error('LLM returned no tool call')
    return call.input
  }
}
