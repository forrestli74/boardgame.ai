import type { ZodSchema } from 'zod'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

export interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): GameResponse
  handleResponse(playerId: string, action: unknown): GameResponse
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}
