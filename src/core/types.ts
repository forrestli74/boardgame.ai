import { z, type ZodSchema } from 'zod'
import type { GameYieldedEvent } from './events.js'

export interface ActionRequest {
  readonly playerId: string
  readonly view: unknown
  readonly actionSchema: ZodSchema
  readonly lastSeenSeq?: number
}

export interface GameResponse {
  readonly requests: ActionRequest[]
  readonly events: GameYieldedEvent[]
}

export const GameOutcomeSchema = z.object({
  scores: z.record(z.string(), z.number()),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type GameOutcome = z.infer<typeof GameOutcomeSchema>
