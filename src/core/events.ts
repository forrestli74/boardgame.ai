import { z } from 'zod'

export const PlayerEventSchema = z.object({
  seq: z.number().int(),
  source: z.literal('player'),
  gameId: z.string(),
  playerId: z.string(),
  lastSeenSeq: z.number().int().optional(),
  data: z.unknown(),
  reasoning: z.string().optional(),
  timestamp: z.string().datetime(),
})

export const GameSourceEventSchema = z.object({
  seq: z.number().int(),
  source: z.literal('game'),
  gameId: z.string(),
  data: z.unknown(),
  timestamp: z.string().datetime(),
})

export const GameEventSchema = z.discriminatedUnion('source', [
  PlayerEventSchema,
  GameSourceEventSchema,
])

export type GameEvent = z.infer<typeof GameEventSchema>

/** Distributes Omit over a union type */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Event shape yielded by games — Engine stamps seq and gameId */
export type GameYieldedEvent = DistributiveOmit<GameEvent, 'seq' | 'gameId'> & { gameId?: string }
