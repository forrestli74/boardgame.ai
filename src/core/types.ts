import type { ZodSchema } from 'zod'

export interface ActionRequest {
  readonly playerId: string
  readonly view: unknown
  readonly actionSchema: ZodSchema
  readonly lastSeenSeq?: number
}

export interface GameResponse {
  readonly requests: ActionRequest[]
  readonly events: unknown[]
}

export interface GameOutcome {
  scores: Record<string, number>
  metadata?: Record<string, unknown>
}
