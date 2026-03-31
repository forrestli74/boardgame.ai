import pLimit from 'p-limit'
import { join } from 'node:path'
import { runGame } from '../core/run-game.js'
import { createGame } from './game-registry.js'
import { LLMPlayer } from '../players/llm-player.js'
import type { GameOutcome } from '../core/types.js'
import type { ResolvedPlayer, GameConfig } from './config.js'

export interface GamePlan {
  gameId: string
  outputDir: string
  playerOrder: ResolvedPlayer[]
  group: number
  iteration?: number
}

export interface BatchOptions {
  groups: number
  balance: 'none' | 'rotate' | 'permute'
  concurrency: number
  outputDir: string
  date: string
}

export interface BatchResult {
  total: number
  completed: number
  failed: number
  results: { gameId: string; outcome: GameOutcome | null; error?: string }[]
}

export function generateRotations<T>(arr: T[]): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    result.push([...arr.slice(i), ...arr.slice(0, i)])
  }
  return result
}

export function generatePermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const perm of generatePermutations(rest)) {
      result.push([arr[i], ...perm])
    }
  }
  return result
}

function padGroup(group: number): string {
  return String(group).padStart(4, '0')
}

function padIter(iter: number): string {
  return String(iter).padStart(3, '0')
}

export function generateGamePlans(
  config: GameConfig,
  players: ResolvedPlayer[],
  options: BatchOptions,
): GamePlan[] {
  const plans: GamePlan[] = []

  for (let g = 1; g <= options.groups; g++) {
    if (options.balance === 'none') {
      const gameId = `${config.game}-${options.date}-${padGroup(g)}`
      plans.push({
        gameId,
        outputDir: join(options.outputDir, gameId),
        playerOrder: players,
        group: g,
      })
    } else {
      const orderings =
        options.balance === 'rotate'
          ? generateRotations(players)
          : generatePermutations(players)

      for (let i = 0; i < orderings.length; i++) {
        const gameId = `${config.game}-${options.date}-${padGroup(g)}-${padIter(i + 1)}`
        plans.push({
          gameId,
          outputDir: join(options.outputDir, gameId),
          playerOrder: orderings[i],
          group: g,
          iteration: i + 1,
        })
      }
    }
  }

  return plans
}

function toPlayerId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

export async function runBatch(
  config: GameConfig,
  players: ResolvedPlayer[],
  options: BatchOptions,
): Promise<BatchResult> {
  const plans = generateGamePlans(config, players, options)
  const limit = pLimit(options.concurrency)
  const results: BatchResult['results'] = []

  const tasks = plans.map((plan, index) =>
    limit(async () => {
      const label = `[${index + 1}/${plans.length}] ${plan.gameId}`
      try {
        const game = createGame(config.game, config.gameOptions)
        const gamePlayers = plan.playerOrder.map((p) => {
          const id = toPlayerId(p.name)
          return new LLMPlayer(id, p.name, { model: p.model, persona: p.persona })
        })

        const result = await runGame({
          gameId: plan.gameId,
          game,
          players: gamePlayers,
          outputDir: plan.outputDir,
        })

        console.log(`${label}...done`)
        results.push({ gameId: plan.gameId, outcome: result.outcome })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`${label}...error: ${msg}`)
        results.push({ gameId: plan.gameId, outcome: null, error: msg })
      }
    }),
  )

  await Promise.all(tasks)

  const completed = results.filter((r) => r.outcome !== null).length
  const failed = results.filter((r) => r.error !== undefined).length

  return {
    total: plans.length,
    completed,
    failed,
    results,
  }
}
