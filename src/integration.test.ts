import { describe, it, expect, afterEach } from 'vitest'
import { z } from 'zod'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import type { Game } from './core/game.js'
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
  private players: string[] = []
  private targets = [7, 3, 9]
  private round = 0
  private maxRounds = 3
  private wins: Record<string, number> = {}
  private gameId = ''

  init(config: GameConfig): GameResponse {
    this.gameId = config.gameId
    this.players = config.players.map(p => p.id)
    this.players.forEach(id => { this.wins[id] = 0 })
    const opts = OptionsSchema.parse(config.options ?? {})
    this.maxRounds = opts.rounds

    return {
      requests: this.players.map(id => ({
        playerId: id,
        view: { round: this.round + 1, maxRounds: this.maxRounds },
        actionSchema: GuessSchema,
      })),
      events: [this.gameEvent({ type: 'start', players: this.players })],
    }
  }

  private guesses: Record<string, number> = {}

  handleResponse(playerId: string, action: unknown): GameResponse {
    this.guesses[playerId] = action as number

    if (Object.keys(this.guesses).length < this.players.length) {
      return { requests: [], events: [] }
    }

    // All guesses in — resolve round
    const target = this.targets[this.round]
    let bestDist = Infinity
    let winner = ''
    for (const [id, guess] of Object.entries(this.guesses)) {
      const dist = Math.abs(guess - target)
      if (dist < bestDist) { bestDist = dist; winner = id }
    }
    this.wins[winner]++
    this.round++

    const events: GameEvent[] = [
      this.gameEvent({ type: 'round-result', round: this.round, target, guesses: { ...this.guesses }, winner }),
    ]
    this.guesses = {}

    if (this.isTerminal()) {
      events.push(this.gameEvent({ type: 'end', wins: { ...this.wins } }))
      return { requests: [], events }
    }

    return {
      requests: this.players.map(id => ({
        playerId: id,
        view: { round: this.round + 1, maxRounds: this.maxRounds },
        actionSchema: GuessSchema,
      })),
      events,
    }
  }

  isTerminal(): boolean {
    return this.round >= this.maxRounds
  }

  getOutcome(): GameOutcome | null {
    if (!this.isTerminal()) return null
    return { scores: { ...this.wins } }
  }

  private gameEvent(data: unknown): GameEvent {
    return { source: 'game', gameId: this.gameId, data, timestamp: new Date().toISOString() }
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

    const outcome = await new Engine(recorder).run(game, players, config)
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
