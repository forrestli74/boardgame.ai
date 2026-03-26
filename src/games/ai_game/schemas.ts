import { z, type ZodSchema } from 'zod'

// ---------------------------------------------------------------------------
// JsonSchema type — describes the subset of JSON Schema we support
// ---------------------------------------------------------------------------

export interface JsonSchema {
  type?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
}

// ---------------------------------------------------------------------------
// jsonSchemaToZod — runtime converter
// ---------------------------------------------------------------------------

export function jsonSchemaToZod(schema: JsonSchema): ZodSchema {
  // Infer type when omitted but structure is unambiguous
  const type = schema.type
    ?? (schema.properties ? 'object' : undefined)
    ?? (schema.items ? 'array' : undefined)
    ?? (schema.enum ? 'string' : undefined)

  // Empty schema {} means "any value"
  if (!type) return z.unknown()

  switch (type) {
    case 'string':
      return schema.enum ? z.enum(schema.enum as [string, ...string[]]) : z.string()

    case 'number': {
      let s = z.number()
      if (schema.minimum !== undefined) s = s.min(schema.minimum)
      if (schema.maximum !== undefined) s = s.max(schema.maximum)
      return s
    }

    case 'integer': {
      let s = z.number().int()
      if (schema.minimum !== undefined) s = s.min(schema.minimum)
      if (schema.maximum !== undefined) s = s.max(schema.maximum)
      return s
    }

    case 'boolean':
      return z.boolean()

    case 'object': {
      const shape: Record<string, ZodSchema> = {}
      const props = schema.properties ?? {}
      const req = new Set(schema.required ?? [])

      for (const [key, propSchema] of Object.entries(props)) {
        const converted = jsonSchemaToZod(propSchema)
        shape[key] = req.has(key) ? converted : converted.optional()
      }

      return z.object(shape)
    }

    case 'array': {
      const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.unknown()
      return z.array(itemSchema)
    }

    default:
      throw new Error(`Unsupported JSON Schema type: ${schema.type ?? 'undefined'}`)
  }
}

// ---------------------------------------------------------------------------
// LLMGameResponse — what the LLM returns each turn
// ---------------------------------------------------------------------------

// Gemini does not support z.record, z.unknown, or z.union in tool schemas.
// Dynamic structures are encoded as JSON strings and parsed after receipt.

export const LLMGameResponseSchema = z.object({
  state: z.string().describe('JSON-encoded complete game state object'),
  requests: z.array(
    z.object({
      playerId: z.string(),
      view: z.string().describe('JSON-encoded player view object (only what this player can see)'),
      actionSchema: z.string().describe('JSON Schema string defining the valid action shape'),
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

export function parseView(view: string): unknown {
  try {
    return JSON.parse(view)
  } catch {
    return view
  }
}

export function parseActionSchema(actionSchema: string): JsonSchema {
  try {
    return JSON.parse(actionSchema)
  } catch {
    // Model may return malformed JSON; fall back to permissive schema
    return {}
  }
}

export function parseEventData(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    // Model may return a plain string instead of JSON-encoded string
    return data
  }
}

export function scoresToRecord(scores: Array<{ playerId: string; score: number }>): Record<string, number> {
  return Object.fromEntries(scores.map(s => [s.playerId, s.score]))
}
