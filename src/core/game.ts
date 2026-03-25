import type { ZodSchema } from 'zod'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

export interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): Promise<GameResponse> | GameResponse
  handleResponse(playerId: string, action: unknown): Promise<GameResponse> | GameResponse
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}
