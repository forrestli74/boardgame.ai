import { describe, it, expect } from 'vitest'
import { GameOutcomeSchema } from './types.js'

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
