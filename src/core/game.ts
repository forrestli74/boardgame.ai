import type { GameResponse, GameOutcome } from './types.js'

export type PlayerAction = { playerId: string; action: unknown }

export type GameFlow = AsyncGenerator<GameResponse, GameOutcome, PlayerAction>

export interface Game {
  play(playerIds: string[]): GameFlow
}
