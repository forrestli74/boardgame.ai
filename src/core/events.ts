import { z } from 'zod'

export const PlayerEventSchema = z.object({
  seq: z.number().int(),
  source: z.literal('player'),
  gameId: z.string(),
  playerId: z.string(),
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
