import { describe, it, expect } from 'vitest'
import { GameConfigSchema, GameOutcomeSchema } from './types.js'

describe('GameConfigSchema', () => {
  it('parses valid config with required fields', () => {
    const result = GameConfigSchema.parse({
      gameId: 'abc',
      seed: 42,
      players: [{ id: 'p1', name: 'Alice' }],
    })
    expect(result.gameId).toBe('abc')
    expect(result.seed).toBe(42)
  })

  it('throws when seed is missing', () => {
    expect(() =>
      GameConfigSchema.parse({ gameId: 'abc', players: [{ id: 'p1', name: 'Alice' }] })
    ).toThrow()
  })

  it('parses config with optional model, persona, and options', () => {
    const result = GameConfigSchema.parse({
      gameId: 'abc',
      seed: 1,
      players: [{ id: 'p1', name: 'Alice', model: 'gpt-4', persona: 'hero' }],
      options: { rounds: 5 },
    })
    expect(result.players[0].model).toBe('gpt-4')
    expect(result.players[0].persona).toBe('hero')
    expect(result.options).toEqual({ rounds: 5 })
  })
})

describe('GameOutcomeSchema', () => {
  it('parses outcome with scores', () => {
    const result = GameOutcomeSchema.parse({ scores: { p1: 1, p2: 0 } })
    expect(result.scores.p1).toBe(1)
  })

  it('throws when scores is missing', () => {
    expect(() => GameOutcomeSchema.parse({})).toThrow()
  })

  it('parses outcome with metadata', () => {
    const result = GameOutcomeSchema.parse({
      scores: { good: 1, evil: 0 },
      metadata: { assassinated: 'p1' },
    })
    expect(result.metadata?.assassinated).toBe('p1')
  })
})
