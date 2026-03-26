import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Game } from '../../core/game.js'
import type { GameResponse, GameConfig, GameOutcome, ActionRequest } from '../../core/types.js'
import type { GameEvent } from '../../core/events.js'
import { registry, DEFAULT_MODEL } from '../../core/llm-registry.js'
import { jsonSchemaToZod, LLMGameResponseSchema, parseState, parseView, parseActionSchema, parseEventData, scoresToRecord } from './schemas.js'
import type { LLMGameResponse } from './schemas.js'
import { buildSystemPrompt, buildInitMessage, buildActionMessage, buildBatchActionMessage } from './prompts.js'

export class AIGame implements Game {
  readonly optionsSchema = z.object({})

  private state: Record<string, unknown> = {}
  private terminal = false
  private outcome: GameOutcome | null = null
  private gameId = ''
  private pendingPlayerIds = new Set<string>()
  private responseQueue: Array<{ playerId: string; action: unknown }> = []

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
    this.responseQueue.push({ playerId, action })
    this.pendingPlayerIds.delete(playerId)

    if (this.pendingPlayerIds.size > 0) {
      return { requests: [], events: [] }
    }

    const systemPrompt = buildSystemPrompt()
    const userMessage = this.responseQueue.length === 1
      ? buildActionMessage(this.rulesDoc, this.state, this.responseQueue[0].playerId, this.responseQueue[0].action)
      : buildBatchActionMessage(this.rulesDoc, this.state, this.responseQueue)

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
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await generateText({
        // Cast: model is a 'provider:model' string; registry expects a branded type
        model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxOutputTokens: 16384,
        tools: {
          game_master_response: tool({
            description: 'Return the updated game state and next actions',
            inputSchema: LLMGameResponseSchema,
          }),
        },
        toolChoice: { type: 'tool', toolName: 'game_master_response' },
        providerOptions: {
          google: { structuredOutputs: false },
        },
      })

      const call = result.toolCalls[0]
      if (call) return call.input
    }
    throw new Error('LLM returned no tool call after 3 attempts')
  }

  private processLLMResponse(llmResponse: LLMGameResponse): GameResponse {
    this.state = parseState(llmResponse.state)
    this.terminal = llmResponse.isTerminal
    this.outcome = llmResponse.outcome
      ? { scores: scoresToRecord(llmResponse.outcome.scores) }
      : null

    const requests: ActionRequest[] = llmResponse.requests.map((req) => ({
      playerId: req.playerId,
      view: parseView(req.view),
      actionSchema: jsonSchemaToZod(parseActionSchema(req.actionSchema)),
    }))

    this.pendingPlayerIds = new Set(requests.map(r => r.playerId))
    this.responseQueue = []

    const timestamp = new Date().toISOString()
    const events: GameEvent[] = llmResponse.events.map((evt) => {
      const data = parseEventData(evt.data)
      return {
        source: 'game' as const,
        gameId: this.gameId,
        data: { description: evt.description, ...((data && typeof data === 'object') ? data as Record<string, unknown> : { value: data }) },
        timestamp,
      }
    })

    return { requests, events }
  }
}
