import { describe, it, expect, afterEach } from 'vitest'
import { z } from 'zod'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import type { Game, GameFlow } from './core/game.js'
import type { Player } from './core/player.js'
import type { GameConfig, GameResponse, GameOutcome, ActionRequest } from './core/types.js'
import type { GameEvent } from './core/events.js'
import { Engine } from './core/engine.js'
import { Recorder } from './core/recorder.js'

// A 3-round number guessing game: players guess 1-10, closest to target wins the round.
// After 3 rounds, player with most round wins takes it.

const GuessSchema = z.number().int().min(1).max(10)
const OptionsSchema = z.object({ rounds: z.number().int().default(3) })

class GuessingGame implements Game {
  readonly optionsSchema = OptionsSchema

  play(config: GameConfig): GameFlow {
    const players = config.players.map(p => p.id)
    const opts = OptionsSchema.parse(config.options ?? {})
    const maxRounds = opts.rounds
    const targets = [7, 3, 9]
    const wins: Record<string, number> = {}
    players.forEach(id => { wins[id] = 0 })

    const gameEvent = (data: unknown): GameEvent => ({
      source: 'game', gameId: config.gameId, data, timestamp: new Date().toISOString(),
    })

    return (async function* () {
      let pendingEvents: GameEvent[] = [gameEvent({ type: 'start', players })]

      for (let round = 0; round < maxRounds; round++) {
        // Request guesses from all players, include any pending events
        const guesses: Record<string, number> = {}
        const first = yield {
          requests: players.map(id => ({
            playerId: id,
            view: { round: round + 1, maxRounds },
            actionSchema: GuessSchema,
          })),
          events: pendingEvents,
        }
        pendingEvents = []
        guesses[first.playerId] = first.action as number

        // Collect remaining guesses
        while (Object.keys(guesses).length < players.length) {
          const { playerId, action } = yield { requests: [], events: [] }
          guesses[playerId] = action as number
        }

        // Resolve round
        const target = targets[round]
        let bestDist = Infinity
        let winner = ''
        for (const [id, guess] of Object.entries(guesses)) {
          const dist = Math.abs(guess - target)
          if (dist < bestDist) { bestDist = dist; winner = id }
        }
        wins[winner]++

        // Queue round-result event for next yield (or discard on last round — outcome captures it)
        pendingEvents = [gameEvent({ type: 'round-result', round: round + 1, target, guesses, winner })]
      }

      return { scores: { ...wins } }
    })()
  }
}

class FixedPlayer implements Player {
  constructor(
    readonly id: string,
    readonly name: string,
    private answers: number[],
  ) {}

  private idx = 0

  async act(_request: ActionRequest): Promise<unknown> {
    return this.answers[this.idx++]
  }
}

const LOG_FILE = '/tmp/boardgame-integration-test.jsonl'

afterEach(() => {
  if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE)
})

describe('integration: full game loop', () => {
  it('runs a 3-round guessing game end-to-end', async () => {
    const game = new GuessingGame()
    const recorder = new Recorder('test-game-1', LOG_FILE)

    const players = new Map<string, Player>([
      ['alice', new FixedPlayer('alice', 'Alice', [7, 5, 8])],
      ['bob', new FixedPlayer('bob', 'Bob', [4, 3, 10])],
    ])

    const config: GameConfig = {
      gameId: 'test-game-1',
      seed: 42,
      players: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
      ],
    }

    const engine = new Engine()
    engine.onEvent((e) => recorder.record(e))
    const outcome = await engine.run(game, players, config)
    recorder.flush()

    // Outcome should exist with scores
    expect(outcome).not.toBeNull()
    expect(outcome!.scores).toHaveProperty('alice')
    expect(outcome!.scores).toHaveProperty('bob')
    expect(outcome!.scores.alice + outcome!.scores.bob).toBe(3) // 3 rounds, 3 winners

    // Round 1: target=7, alice=7 (exact), bob=4 → alice wins
    // Round 2: target=3, alice=5, bob=3 (exact) → bob wins
    // Round 3: target=9, alice=8 (dist 1), bob=10 (dist 1) → alice wins (first closest)
    expect(outcome!.scores.alice).toBe(2)
    expect(outcome!.scores.bob).toBe(1)

    // Log file should have events
    const lines = readFileSync(LOG_FILE, 'utf-8').trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(5) // start + 3 rounds + player actions + end

    // Each line should be valid JSON with gameId
    for (const line of lines) {
      const entry = JSON.parse(line)
      expect(entry.gameId).toBe('test-game-1')
    }
  })
})
