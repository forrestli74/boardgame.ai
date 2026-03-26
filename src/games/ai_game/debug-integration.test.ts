import { describe, it } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { Player } from '../../core/player.js'
import type { ActionRequest, GameConfig } from '../../core/types.js'
import { AIGame } from './ai-game.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const RULES_PATH = join(__dirname, '../../../rules/tic-tac-toe.md')

const SKIP = !process.env.GEMINI_API_KEY
const RUNS = 10
const MAX_STEPS = 10

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

function makePlayers(): Map<string, Player> {
  return new Map<string, Player>([
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
}

const config: GameConfig = {
  gameId: 'debug-1',
  seed: 42,
  players: [
    { id: 'player-x', name: 'Player X' },
    { id: 'player-o', name: 'Player O' },
  ],
}

async function runOnce(model: string): Promise<{ steps: number; terminal: boolean; winner: string | null }> {
  const rulesDoc = readFileSync(RULES_PATH, 'utf-8')
  const game = new AIGame(rulesDoc, model)
  const players = makePlayers()

  const initResp = await game.init(config)
  let requests = initResp.requests
  let step = 0

  while (!game.isTerminal() && step < MAX_STEPS) {
    step++
    const req = requests[0]
    if (!req) break

    const player = players.get(req.playerId)!
    const action = await player.act(req)
    const resp = await game.handleResponse(req.playerId, action)
    requests = resp.requests
  }

  const outcome = game.getOutcome()
  let winner: string | null = null
  if (outcome) {
    const entries = Object.entries(outcome.scores)
    if (entries.length > 0) {
      const best = entries.reduce((a, b) => a[1] >= b[1] ? a : b)
      if (best[1] > 0) winner = best[0]
    }
  }

  return { steps: step, terminal: game.isTerminal(), winner }
}

async function runN(model: string, n: number) {
  const results = []
  for (let i = 0; i < n; i++) {
    const r = await runOnce(model)
    results.push(r)
    console.log(`  Run ${i + 1}/${n}: steps=${r.steps}, terminal=${r.terminal}, winner=${r.winner}`)
  }

  const completed = results.filter(r => r.terminal).length
  const stuck = results.filter(r => !r.terminal).length
  const xWins = results.filter(r => r.winner === 'player-x').length
  const oWins = results.filter(r => r.winner === 'player-o').length
  const avgSteps = results.reduce((s, r) => s + r.steps, 0) / n

  console.log(`\n  === ${model} summary (${n} runs) ===`)
  console.log(`  Completed: ${completed}/${n}`)
  console.log(`  Stuck (hit max steps): ${stuck}/${n}`)
  console.log(`  X wins: ${xWins}, O wins: ${oWins}`)
  console.log(`  Avg steps: ${avgSteps.toFixed(1)}`)

  return { completed, stuck, xWins, oWins, avgSteps }
}

describe.skipIf(SKIP)('debug: 10-run model comparison', () => {
  it('flash-lite x10', async () => {
    console.log('\n=== gemini-2.5-flash-lite ===')
    await runN('google:gemini-2.5-flash-lite', RUNS)
  }, 600_000)

  it.skip('flash x10 (already confirmed 10/10)', async () => {
    console.log('\n=== gemini-2.5-flash ===')
    await runN('google:gemini-2.5-flash', RUNS)
  }, 600_000)
})
