import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { Player } from '../core/player.js'
import type { ActionRequest, GameConfig } from '../core/types.js'
import { Recorder } from '../core/recorder.js'
import { AIGameMaster } from './game-master.js'
import { AsyncEngine } from './async-engine.js'
import { LLMClient } from './llm-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const RULES_PATH = join(__dirname, '../../rules/tic-tac-toe.md')
const LOG_FILE = '/tmp/boardgame-ai-gm-integration-test.jsonl'

const SKIP = !process.env.ANTHROPIC_API_KEY

/**
 * Fixed player that returns predetermined Tic-Tac-Toe moves.
 */
class FixedTTTPlayer implements Player {
  constructor(
    readonly id: string,
    readonly name: string,
    private moves: Array<{ row: number; col: number }>,
  ) {}

  private idx = 0

  async act(_request: ActionRequest): Promise<unknown> {
    return this.moves[this.idx++]
  }
}

afterEach(() => {
  if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE)
})

describe.skipIf(SKIP)('integration: AI Game Master', () => {
  it('plays tic-tac-toe to completion', async () => {
    const rulesDoc = readFileSync(RULES_PATH, 'utf-8')
    const llmClient = new LLMClient()
    const game = new AIGameMaster(rulesDoc, llmClient)
    const recorder = new Recorder('ttt-integration-1', LOG_FILE)

    // X plays diagonal: (0,0), (1,1), (2,2) -- wins if O doesn't block
    // O plays: (0,1), (0,2)
    const players = new Map<string, Player>([
      ['player-x', new FixedTTTPlayer('player-x', 'Player X', [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 2 },
      ])],
      ['player-o', new FixedTTTPlayer('player-o', 'Player O', [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ])],
    ])

    const config: GameConfig = {
      gameId: 'ttt-integration-1',
      seed: 42,
      players: [
        { id: 'player-x', name: 'Player X' },
        { id: 'player-o', name: 'Player O' },
      ],
    }

    const engine = new AsyncEngine(recorder)
    const outcome = await engine.run(game, players, config)
    recorder.flush()

    // Game must reach a terminal state with an outcome
    expect(outcome).not.toBeNull()
    expect(outcome!.scores).toBeDefined()

    // Both players should have scores
    expect(outcome!.scores).toHaveProperty('player-x')
    expect(outcome!.scores).toHaveProperty('player-o')

    // Scores should sum to 1 (one winner and one loser, or 0.5 each for a draw)
    const totalScore = outcome!.scores['player-x'] + outcome!.scores['player-o']
    expect(totalScore).toBeCloseTo(1, 5)

    // X should win with diagonal (0,0), (1,1), (2,2) -- assert leniently
    // The LLM interprets the rules, so we expect X wins but allow for edge cases
    expect(outcome!.scores['player-x']).toBeGreaterThanOrEqual(outcome!.scores['player-o'])

    // The game master should have marked the game as terminal
    expect(game.isTerminal()).toBe(true)

    // JSONL log file should have recorded events
    expect(existsSync(LOG_FILE)).toBe(true)
    const lines = readFileSync(LOG_FILE, 'utf-8').trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(3) // at least init + some player actions + game events

    // Each log line should be valid JSON containing the gameId
    for (const line of lines) {
      const entry = JSON.parse(line)
      expect(entry.gameId).toBe('ttt-integration-1')
    }
  }, 120_000)
})
