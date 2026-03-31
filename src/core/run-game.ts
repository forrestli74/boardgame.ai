import { Engine } from './engine.js'
import { GameArtifacts } from './artifacts.js'
import type { Game } from './game.js'
import type { Player } from './player.js'
import type { GameOutcome } from './types.js'

export interface RunGameOptions {
  gameId: string
  game: Game
  players: Player[]
  outputDir: string
}

export interface GameResult {
  outcome: GameOutcome | null
  outputDir: string
}

export async function runGame(options: RunGameOptions): Promise<GameResult> {
  const { gameId, game, players, outputDir } = options

  const playerMap = new Map(players.map(p => [p.id, p]))

  const artifacts = await GameArtifacts.create(outputDir, {
    gameId,
    players: players.map(p => ({ id: p.id, name: p.name })),
  })

  const engine = new Engine(gameId)

  engine.onEvent((event) => artifacts.recordEvent(event))
  for (const player of players) {
    if (player.onEvent) {
      player.onEvent((data) => artifacts.recordPlayerEvent(player.id, data))
    }
  }

  const outcome = await engine.run(game, playerMap)

  if (outcome) {
    await artifacts.writeOutcome(outcome)
  }

  return { outcome, outputDir }
}
