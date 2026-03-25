import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Game } from '../core/game.js'
import type { GameResponse, GameConfig, GameOutcome, ActionRequest } from '../core/types.js'
import type { GameEvent } from '../core/events.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'
import { jsonSchemaToZod, LLMGameResponseSchema } from './schemas.js'
import type { JsonSchema, LLMGameResponse } from './schemas.js'
import { buildSystemPrompt, buildInitMessage, buildActionMessage } from './prompts.js'

export class AIGameMaster implements Game {
  readonly optionsSchema = z.object({})

  private state: Record<string, unknown> = {}
  private terminal = false
  private outcome: GameOutcome | null = null
  private gameId = ''

  constructor(
    private readonly rulesDoc: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async init(config: GameConfig): Promise<GameResponse> {
    this.gameId = config.gameId

    const systemPrompt = buildSystemPrompt()
    const userMessage = buildInitMessage(this.rulesDoc, config)

    const raw = await this.callLLM(systemPrompt, userMessage)
    const parsed = LLMGameResponseSchema.parse(raw)

    return this.processLLMResponse(parsed)
  }

  async handleResponse(playerId: string, action: unknown): Promise<GameResponse> {
    const systemPrompt = buildSystemPrompt()
    const userMessage = buildActionMessage(this.rulesDoc, this.state, playerId, action)

    const raw = await this.callLLM(systemPrompt, userMessage)
    const parsed = LLMGameResponseSchema.parse(raw)

    return this.processLLMResponse(parsed)
  }

  isTerminal(): boolean {
    return this.terminal
  }

  getOutcome(): GameOutcome | null {
    return this.outcome
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<unknown> {
    const result = await generateText({
      // Cast: model is a 'provider:model' string; registry expects a branded type
      model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      tools: {
        game_master_response: tool({
          description: 'Return the updated game state and next actions',
          inputSchema: LLMGameResponseSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'game_master_response' },
    })

    const call = result.toolCalls[0]
    if (!call) throw new Error('LLM returned no tool call')
    return call.input
  }

  private processLLMResponse(llmResponse: LLMGameResponse): GameResponse {
    this.state = llmResponse.state
    this.terminal = llmResponse.isTerminal
    this.outcome = llmResponse.outcome
      ? { scores: llmResponse.outcome.scores, metadata: llmResponse.outcome.metadata }
      : null

    const requests: ActionRequest[] = llmResponse.requests.map((req) => ({
      playerId: req.playerId,
      view: req.view,
      actionSchema: jsonSchemaToZod(req.actionSchema as unknown as JsonSchema),
    }))

    const timestamp = new Date().toISOString()
    const events: GameEvent[] = llmResponse.events.map((evt) => ({
      source: 'game' as const,
      gameId: this.gameId,
      data: { description: evt.description, ...((evt.data && typeof evt.data === 'object') ? evt.data as Record<string, unknown> : { value: evt.data }) },
      timestamp,
    }))

    return { requests, events }
  }
}
