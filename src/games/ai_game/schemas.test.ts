import { describe, it, expect } from 'vitest'
import { LLMGameResponseSchema } from './schemas.js'

describe('LLMGameResponseSchema', () => {
  it('validates a complete LLM response', () => {
    const response = {
      state: JSON.stringify({ round: 1, phase: 'team_proposal' }),
      requests: [
        {
          playerId: 'p1',
          prompt: 'You are the leader. Choose 2 players for the quest team from: p1, p2, p3, p4, p5.',
        },
      ],
      events: [
        { description: 'Round 1 started', data: JSON.stringify({ round: 1 }) },
      ],
      isTerminal: false,
    }

    const parsed = LLMGameResponseSchema.parse(response)
    expect(parsed.state).toBe(response.state)
    expect(parsed.requests).toHaveLength(1)
    expect(parsed.requests[0].playerId).toBe('p1')
    expect(parsed.requests[0].prompt).toContain('Choose 2 players')
    expect(parsed.isTerminal).toBe(false)
    expect(parsed.outcome).toBeUndefined()
  })

  it('validates a terminal response with outcome', () => {
    const response = {
      state: JSON.stringify({ round: 5, phase: 'complete' }),
      requests: [],
      events: [{ description: 'Game over', data: JSON.stringify(null) }],
      isTerminal: true,
      outcome: {
        scores: [{ playerId: 'p1', score: 1 }, { playerId: 'p2', score: 0 }],
      },
    }

    const parsed = LLMGameResponseSchema.parse(response)
    expect(parsed.isTerminal).toBe(true)
    expect(parsed.outcome?.scores).toEqual([{ playerId: 'p1', score: 1 }, { playerId: 'p2', score: 0 }])
  })

  it('rejects invalid response missing required fields', () => {
    expect(() => LLMGameResponseSchema.parse({ state: '{}' })).toThrow()
  })
})
