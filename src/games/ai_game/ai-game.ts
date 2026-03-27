import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Game, GameFlow } from '../../core/game.js'
import type { GameConfig, GameOutcome, ActionRequest } from '../../core/types.js'
import type { GameEvent } from '../../core/events.js'
import { registry, DEFAULT_MODEL } from '../../core/llm-registry.js'
import { LLMGameResponseSchema, parseState, parseEventData, scoresToRecord } from './schemas.js'
import type { LLMGameResponse } from './schemas.js'
import { buildSystemPrompt, buildInitMessage, buildActionMessage, buildBatchActionMessage } from './prompts.js'

const TextSchema = z.string()

export class AIGame implements Game {
  readonly optionsSchema = z.object({})

  constructor(
    private readonly rulesDoc: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  play(config: GameConfig): GameFlow {
    const self = this
    return (async function* () {
      const gameId = config.gameId
      const systemPrompt = buildSystemPrompt()

      // Init: call LLM to set up the game
      const initMessage = buildInitMessage(self.rulesDoc, config)
      const initRaw = await self.callLLM(systemPrompt, initMessage)
      const initParsed = LLMGameResponseSchema.parse(initRaw)
      let state = parseState(initParsed.state)
      let { requests, events } = self.processLLMResponse(initParsed, gameId)

      if (initParsed.isTerminal) {
        return initParsed.outcome
          ? { scores: scoresToRecord(initParsed.outcome.scores), metadata: { finalEvents: events } }
          : { scores: {}, metadata: { finalEvents: events } }
      }

      // Track pending players for batching
      let pendingPlayerIds = new Set(requests.map(r => r.playerId))
      let responseQueue: Array<{ playerId: string; action: unknown }> = []

      // First yield sends initial requests + events
      const firstAction = yield { requests, events }
      responseQueue.push(firstAction)
      pendingPlayerIds.delete(firstAction.playerId)

      // Main loop
      while (true) {
        // Buffer responses until all pending players have responded
        while (pendingPlayerIds.size > 0) {
          const action = yield { requests: [], events: [] }
          responseQueue.push(action)
          pendingPlayerIds.delete(action.playerId)
        }

        // All responses collected — call LLM
        const userMessage = responseQueue.length === 1
          ? buildActionMessage(self.rulesDoc, state, responseQueue[0].playerId, responseQueue[0].action)
          : buildBatchActionMessage(self.rulesDoc, state, responseQueue)

        const raw = await self.callLLM(systemPrompt, userMessage)
        const parsed = LLMGameResponseSchema.parse(raw)
        state = parseState(parsed.state)
        const response = self.processLLMResponse(parsed, gameId)

        if (parsed.isTerminal) {
          return parsed.outcome
            ? { scores: scoresToRecord(parsed.outcome.scores), metadata: { finalEvents: response.events } }
            : { scores: {}, metadata: { finalEvents: response.events } }
        }

        // Reset for next round
        pendingPlayerIds = new Set(response.requests.map(r => r.playerId))
        responseQueue = []

        const nextAction = yield { requests: response.requests, events: response.events }
        responseQueue.push(nextAction)
        pendingPlayerIds.delete(nextAction.playerId)
      }
    })()
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await generateText({
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

  private processLLMResponse(llmResponse: LLMGameResponse, gameId: string): { requests: ActionRequest[]; events: GameEvent[] } {
    const requests: ActionRequest[] = llmResponse.requests.map((req) => ({
      playerId: req.playerId,
      view: req.prompt,
      actionSchema: TextSchema,
    }))

    const timestamp = new Date().toISOString()
    const events: GameEvent[] = llmResponse.events.map((evt) => {
      const data = parseEventData(evt.data)
      return {
        source: 'game' as const,
        gameId,
        data: { description: evt.description, ...((data && typeof data === 'object') ? data as Record<string, unknown> : { value: data }) },
        timestamp,
      }
    })

    return { requests, events }
  }
}
