import type { ZodSchema } from 'zod'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

export type PlayerAction = { playerId: string; action: unknown }

export type GameFlow = Generator<GameResponse, GameOutcome, PlayerAction>

export interface Game {
  readonly optionsSchema: ZodSchema
  play(config: GameConfig): GameFlow
}
