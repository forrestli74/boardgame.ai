import { z } from 'zod'
import type { GameResponse } from './types.js'
import type { GameYieldedEvent } from './events.js'
import type { ActionRequest } from './types.js'
import type { PlayerAction } from './game.js'

export interface DiscussionStatement {
  playerId: string
  content: string
}

export interface DiscussionResult {
  statements: DiscussionStatement[]
  pendingEvents: GameYieldedEvent[]
}

export interface DiscussionOptions {
  firstSpeakers?: string[]
}

export interface Discussion {
  run(
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction>
}

export const DiscussionStatementSchema = z.object({
  statement: z.string().describe('Your statement to the group. Pass with empty string unless you have something to add.'),
})

function event(data: unknown): GameYieldedEvent {
  return { source: 'game', data, timestamp: new Date().toISOString() }
}

const DEFAULT_PROMPT = `Share your thoughts with the group. Keep it short and direct. Address specific players when you have something to say to them.`

export class BroadcastDiscussion implements Discussion {
  private readonly prompt: string

  constructor(private readonly maxRounds: number = 3, prompt?: string) {
    this.prompt = prompt ?? DEFAULT_PROMPT
  }

  async *run(
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction> {
    const allStatements: DiscussionStatement[] = []
    const previousStatements: { playerId: string; content: string }[] = []
    let pendingEvents: GameYieldedEvent[] = []

    // Determine player order, with firstSpeakers at the front
    let activePlayers = [...playerIds]
    if (options?.firstSpeakers) {
      const first = options.firstSpeakers.filter(id => activePlayers.includes(id))
      const rest = activePlayers.filter(id => !first.includes(id))
      activePlayers = [...first, ...rest]
    }

    for (let round = 0; round < this.maxRounds; round++) {
      if (activePlayers.length === 0) break

      const requests: ActionRequest[] = activePlayers.map(id => ({
        playerId: id,
        view: {
          context: contexts[id],
          prompt: this.prompt,
          round,
          previousStatements: [...previousStatements],
        },
        actionSchema: DiscussionStatementSchema,
      }))

      // Parallel collection: yield requests (carrying pending events from previous round),
      // then collect remaining responses with empty-request yields
      const roundStatements: { playerId: string; content: string }[] = []

      const firstAction: PlayerAction = yield { requests, events: pendingEvents }
      pendingEvents = []
      let firstParsed = DiscussionStatementSchema.safeParse(firstAction.action)
      if (!firstParsed.success) {
        pendingEvents.push(event({ type: 'validation-failed', playerId: firstAction.playerId, raw: firstAction.action }))
        firstParsed = { success: true, data: { statement: '' } } as any
      }
      roundStatements.push({ playerId: firstAction.playerId, content: firstParsed.data!.statement })

      while (roundStatements.length < activePlayers.length) {
        const action: PlayerAction = yield { requests: [], events: [] }
        let parsed = DiscussionStatementSchema.safeParse(action.action)
        if (!parsed.success) {
          pendingEvents.push(event({ type: 'validation-failed', playerId: action.playerId, raw: action.action }))
          parsed = { success: true, data: { statement: '' } } as any
        }
        roundStatements.push({ playerId: action.playerId, content: parsed.data!.statement })
      }

      // Process statements: empty string = pass (but player stays active)
      let allPassed = true
      for (const s of roundStatements) {
        if (s.content !== '') {
          allPassed = false
          allStatements.push({ playerId: s.playerId, content: s.content })
          previousStatements.push({ playerId: s.playerId, content: s.content })
        }
      }

      // Store round event to carry forward — will be emitted with next round's requests
      pendingEvents = [
        event({
          type: 'discussion-round',
          round,
          statements: roundStatements.filter(s => s.content !== ''),
        }),
      ]

      // Early exit: all players passed this round
      if (allPassed) break
    }

    // Return result; pendingEvents from the final round are included for the parent to handle
    return { statements: allStatements, pendingEvents }
  }
}
