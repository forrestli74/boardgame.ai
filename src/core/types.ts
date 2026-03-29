import { z, type ZodSchema } from 'zod'
import type { GameEvent } from './events.js'

export interface ActionRequest {
  readonly playerId: string
  readonly view: unknown
  readonly actionSchema: ZodSchema
  readonly triggerSeq?: number
}

export interface GameResponse {
  readonly requests: ActionRequest[]
  readonly events: GameEvent[]
}

export const PlayerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().optional(),
  persona: z.string().optional(),
})

export type PlayerConfig = z.infer<typeof PlayerConfigSchema>

export const GameConfigSchema = z.object({
  gameId: z.string(),
  seed: z.number().int(),
  players: z.array(PlayerConfigSchema).min(1),
  options: z.unknown().optional(),
})

export type GameConfig = z.infer<typeof GameConfigSchema>

export const GameOutcomeSchema = z.object({
  scores: z.record(z.string(), z.number()),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type GameOutcome = z.infer<typeof GameOutcomeSchema>
