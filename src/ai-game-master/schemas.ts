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
  switch (schema.type) {
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

export const LLMGameResponseSchema = z.object({
  state: z.record(z.string(), z.unknown()),
  requests: z.array(
    z.object({
      playerId: z.string(),
      view: z.unknown(),
      actionSchema: z.looseObject({}),
    }),
  ),
  events: z.array(
    z.object({
      description: z.string(),
      data: z.unknown(),
    }),
  ),
  isTerminal: z.boolean(),
  outcome: z
    .object({
      scores: z.record(z.string(), z.number()),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
})

export type LLMGameResponse = z.infer<typeof LLMGameResponseSchema>
