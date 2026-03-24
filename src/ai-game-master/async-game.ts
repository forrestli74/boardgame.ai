import type { ZodSchema } from 'zod'
import type { GameResponse, GameConfig, GameOutcome } from '../core/types.js'

/**
 * Async variant of the Game interface for game masters that require
 * asynchronous operations (e.g. LLM calls) in init() and handleResponse().
 */
export interface AsyncGame {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): Promise<GameResponse>
  handleResponse(playerId: string, action: unknown): Promise<GameResponse>
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}
