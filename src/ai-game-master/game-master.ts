import { z } from 'zod'
import type { AsyncGame } from './async-game.js'
import type { GameResponse, GameConfig, GameOutcome, ActionRequest } from '../core/types.js'
import type { GameEvent } from '../core/events.js'
import { jsonSchemaToZod, LLMGameResponseSchema } from './schemas.js'
import type { JsonSchema, LLMGameResponse } from './schemas.js'
import type { LLMClient } from './llm-client.js'
import { buildSystemPrompt, buildInitMessage, buildActionMessage, buildToolDefinition } from './prompts.js'

/**
 * AI Game Master — uses an LLM to interpret a rules document and manage
 * game state, action requests, and terminal conditions.
 *
 * Implements AsyncGame because LLM calls are inherently asynchronous.
 * Use with AsyncEngine instead of the synchronous Engine.
 */
export class AIGameMaster implements AsyncGame {
  readonly optionsSchema = z.object({})

  private state: Record<string, unknown> = {}
  private terminal = false
  private outcome: GameOutcome | null = null
  private gameId = ''

  constructor(
    private readonly rulesDoc: string,
    private readonly llmClient: LLMClient,
  ) {}

  async init(config: GameConfig): Promise<GameResponse> {
    this.gameId = config.gameId

    const systemPrompt = buildSystemPrompt()
    const userMessage = buildInitMessage(this.rulesDoc, config)
    const tool = buildToolDefinition()

    const raw = await this.llmClient.call(systemPrompt, [{ role: 'user', content: userMessage }], tool)
    const parsed = LLMGameResponseSchema.parse(raw)

    return this.processLLMResponse(parsed)
  }

  async handleResponse(playerId: string, action: unknown): Promise<GameResponse> {
    const systemPrompt = buildSystemPrompt()
    const userMessage = buildActionMessage(this.rulesDoc, this.state, playerId, action)
    const tool = buildToolDefinition()

    const raw = await this.llmClient.call(systemPrompt, [{ role: 'user', content: userMessage }], tool)
    const parsed = LLMGameResponseSchema.parse(raw)

    return this.processLLMResponse(parsed)
  }

  isTerminal(): boolean {
    return this.terminal
  }

  getOutcome(): GameOutcome | null {
    return this.outcome
  }

  /**
   * Converts the raw LLM response into internal state updates and a GameResponse.
   */
  private processLLMResponse(llmResponse: LLMGameResponse): GameResponse {
    // Update internal state
    this.state = llmResponse.state
    this.terminal = llmResponse.isTerminal
    this.outcome = llmResponse.outcome
      ? { scores: llmResponse.outcome.scores, metadata: llmResponse.outcome.metadata }
      : null

    // Convert action requests: JSON Schema actionSchema -> Zod schema
    const requests: ActionRequest[] = llmResponse.requests.map((req) => ({
      playerId: req.playerId,
      view: req.view,
      actionSchema: jsonSchemaToZod(req.actionSchema as unknown as JsonSchema),
    }))

    // Format events as GameEvent (source: 'game')
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
