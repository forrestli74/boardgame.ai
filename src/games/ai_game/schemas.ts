import { z } from 'zod'

// ---------------------------------------------------------------------------
// LLMGameResponse — what the LLM returns each turn
// ---------------------------------------------------------------------------

export const LLMGameResponseSchema = z.object({
  state: z.string().describe('JSON-encoded complete game state object'),
  requests: z.array(
    z.object({
      playerId: z.string(),
      prompt: z.string().describe('Natural language question or instruction for this player'),
    }),
  ),
  events: z.array(
    z.object({
      description: z.string(),
      data: z.string().describe('JSON-encoded event data object'),
    }),
  ),
  isTerminal: z.boolean(),
  outcome: z
    .object({
      scores: z.array(z.object({ playerId: z.string(), score: z.number() })),
    })
    .optional(),
})

export type LLMGameResponse = z.infer<typeof LLMGameResponseSchema>

// ---------------------------------------------------------------------------
// Helpers to parse JSON-string fields from LLM response
// ---------------------------------------------------------------------------

export function parseState(state: string): Record<string, unknown> {
  try {
    return JSON.parse(state)
  } catch {
    return { raw: state }
  }
}

export function parseEventData(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

export function scoresToRecord(scores: Array<{ playerId: string; score: number }>): Record<string, number> {
  return Object.fromEntries(scores.map(s => [s.playerId, s.score]))
}
