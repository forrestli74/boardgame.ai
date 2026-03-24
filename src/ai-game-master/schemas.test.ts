import { describe, it, expect } from 'vitest'
import { jsonSchemaToZod, LLMGameResponseSchema, type JsonSchema } from './schemas.js'

describe('jsonSchemaToZod', () => {
  it('converts string type', () => {
    const schema = jsonSchemaToZod({ type: 'string' })
    expect(schema.parse('hello')).toBe('hello')
    expect(() => schema.parse(42)).toThrow()
  })

  it('converts string enum', () => {
    const schema = jsonSchemaToZod({ type: 'string', enum: ['a', 'b', 'c'] })
    expect(schema.parse('a')).toBe('a')
    expect(() => schema.parse('d')).toThrow()
  })

  it('converts number type', () => {
    const schema = jsonSchemaToZod({ type: 'number' })
    expect(schema.parse(3.14)).toBe(3.14)
    expect(() => schema.parse('nope')).toThrow()
  })

  it('converts number with min/max constraints', () => {
    const schema = jsonSchemaToZod({ type: 'number', minimum: 0, maximum: 10 })
    expect(schema.parse(5)).toBe(5)
    expect(() => schema.parse(-1)).toThrow()
    expect(() => schema.parse(11)).toThrow()
  })

  it('converts integer type', () => {
    const schema = jsonSchemaToZod({ type: 'integer' })
    expect(schema.parse(7)).toBe(7)
    expect(() => schema.parse(3.5)).toThrow()
  })

  it('converts integer with min/max constraints', () => {
    const schema = jsonSchemaToZod({ type: 'integer', minimum: 1, maximum: 5 })
    expect(schema.parse(3)).toBe(3)
    expect(() => schema.parse(0)).toThrow()
    expect(() => schema.parse(6)).toThrow()
  })

  it('converts boolean type', () => {
    const schema = jsonSchemaToZod({ type: 'boolean' })
    expect(schema.parse(true)).toBe(true)
    expect(() => schema.parse('yes')).toThrow()
  })

  it('converts object with required and optional properties', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    })

    expect(schema.parse({ name: 'Alice' })).toEqual({ name: 'Alice' })
    expect(schema.parse({ name: 'Bob', age: 30 })).toEqual({ name: 'Bob', age: 30 })
    expect(() => schema.parse({ age: 25 })).toThrow()
  })

  it('converts nested objects', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        player: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            score: { type: 'number' },
          },
          required: ['id'],
        },
      },
      required: ['player'],
    })

    const valid = { player: { id: 'p1', score: 100 } }
    expect(schema.parse(valid)).toEqual(valid)
    expect(() => schema.parse({ player: { score: 50 } })).toThrow()
  })

  it('converts array with typed items', () => {
    const schema = jsonSchemaToZod({
      type: 'array',
      items: { type: 'string' },
    })

    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(() => schema.parse([1, 2])).toThrow()
  })

  it('converts array of objects', () => {
    const schema = jsonSchemaToZod({
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    })

    expect(schema.parse([{ id: 'x' }])).toEqual([{ id: 'x' }])
    expect(() => schema.parse([{ name: 'y' }])).toThrow()
  })

  it('throws for unsupported type', () => {
    expect(() => jsonSchemaToZod({ type: 'null' } as JsonSchema)).toThrow(
      'Unsupported JSON Schema type: null',
    )
  })

  it('throws when type is missing', () => {
    expect(() => jsonSchemaToZod({} as JsonSchema)).toThrow(
      'Unsupported JSON Schema type: undefined',
    )
  })
})

describe('LLMGameResponseSchema', () => {
  it('validates a complete LLM response', () => {
    const response = {
      state: { round: 1, phase: 'team_proposal' },
      requests: [
        {
          playerId: 'p1',
          view: { role: 'merlin', knownEvil: ['p3'] },
          actionSchema: {
            type: 'object',
            properties: {
              team: { type: 'array', items: { type: 'string' } },
            },
            required: ['team'],
          },
        },
      ],
      events: [
        { description: 'Round 1 started', data: { round: 1 } },
      ],
      isTerminal: false,
    }

    const parsed = LLMGameResponseSchema.parse(response)
    expect(parsed.state).toEqual({ round: 1, phase: 'team_proposal' })
    expect(parsed.requests).toHaveLength(1)
    expect(parsed.requests[0].playerId).toBe('p1')
    expect(parsed.isTerminal).toBe(false)
    expect(parsed.outcome).toBeUndefined()
  })

  it('validates a terminal response with outcome', () => {
    const response = {
      state: { round: 5, phase: 'complete' },
      requests: [],
      events: [{ description: 'Game over', data: null }],
      isTerminal: true,
      outcome: {
        scores: { p1: 1, p2: 0 },
        metadata: { winner: 'good' },
      },
    }

    const parsed = LLMGameResponseSchema.parse(response)
    expect(parsed.isTerminal).toBe(true)
    expect(parsed.outcome?.scores).toEqual({ p1: 1, p2: 0 })
  })

  it('rejects invalid response missing required fields', () => {
    expect(() => LLMGameResponseSchema.parse({ state: {} })).toThrow()
  })
})
