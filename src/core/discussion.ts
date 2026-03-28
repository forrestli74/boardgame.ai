import { z } from 'zod'
import type { GameResponse } from './types.js'
import type { GameEvent } from './events.js'
import type { ActionRequest } from './types.js'
import type { PlayerAction } from './game.js'

export interface DiscussionStatement {
  playerId: string
  content: string
  lastSeen?: { playerId: string; content: string }
}

export interface DiscussionResult {
  statements: DiscussionStatement[]
  pendingEvents: GameEvent[]
}

export interface DiscussionOptions {
  firstSpeakers?: string[]
}

export interface Discussion {
  run(
    gameId: string,
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction>
}

export const DiscussionStatementSchema = z.object({
  statement: z.string().describe('Your statement to the group, or empty string to pass'),
})

function event(gameId: string, data: unknown): GameEvent {
  return { source: 'game', gameId, data, timestamp: new Date().toISOString() }
}

const DEFAULT_PROMPT = `Share your thoughts with the group. Keep it short and direct. Address specific players when you have something to say to them.`

export class BroadcastDiscussion implements Discussion {
  private readonly prompt: string

  constructor(private readonly maxRounds: number = 3, prompt?: string) {
    this.prompt = prompt ?? DEFAULT_PROMPT
  }

  async *run(
    gameId: string,
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction> {
    const allStatements: DiscussionStatement[] = []
    const previousStatements: { playerId: string; content: string }[] = []
    let pendingEvents: GameEvent[] = []

    // Determine player order, with firstSpeakers at the front
    let activePlayers = [...playerIds]
    if (options?.firstSpeakers) {
      const first = options.firstSpeakers.filter(id => activePlayers.includes(id))
      const rest = activePlayers.filter(id => !first.includes(id))
      activePlayers = [...first, ...rest]
    }

    for (let round = 0; round < this.maxRounds; round++) {
      if (activePlayers.length === 0) break

      const lastSeen =
        previousStatements.length > 0
          ? {
              playerId: previousStatements[previousStatements.length - 1].playerId,
              content: previousStatements[previousStatements.length - 1].content,
            }
          : undefined

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
      roundStatements.push({
        playerId: firstAction.playerId,
        content: (firstAction.action as { statement: string }).statement,
      })

      while (roundStatements.length < activePlayers.length) {
        const action: PlayerAction = yield { requests: [], events: [] }
        roundStatements.push({
          playerId: action.playerId,
          content: (action.action as { statement: string }).statement,
        })
      }

      // Process statements: empty string = pass (but player stays active)
      let allPassed = true
      for (const s of roundStatements) {
        if (s.content !== '') {
          allPassed = false
          allStatements.push({ playerId: s.playerId, content: s.content, lastSeen })
          previousStatements.push({ playerId: s.playerId, content: s.content })
        }
      }

      // Store round event to carry forward — will be emitted with next round's requests
      pendingEvents = [
        event(gameId, {
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
