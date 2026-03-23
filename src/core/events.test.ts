import { describe, it, expect } from 'vitest'
import { GameEventSchema } from './events.js'

describe('GameEventSchema', () => {
  const ts = '2026-01-01T00:00:00.000Z'

  it('parses player event with required fields', () => {
    const event = GameEventSchema.parse({
      source: 'player',
      gameId: 'g1',
      playerId: 'p1',
      data: { action: 'vote' },
      timestamp: ts,
    })
    expect(event.source).toBe('player')
  })

  it('parses player event with optional reasoning', () => {
    const event = GameEventSchema.parse({
      source: 'player',
      gameId: 'g1',
      playerId: 'p1',
      data: {},
      reasoning: 'I trust this player',
      timestamp: ts,
    })
    if (event.source === 'player') {
      expect(event.reasoning).toBe('I trust this player')
    }
  })

  it('parses game event with required fields', () => {
    const event = GameEventSchema.parse({
      source: 'game',
      gameId: 'g1',
      data: { type: 'round-start' },
      timestamp: ts,
    })
    expect(event.source).toBe('game')
  })

  it('rejects event missing source', () => {
    expect(() =>
      GameEventSchema.parse({ gameId: 'g1', data: {}, timestamp: ts })
    ).toThrow()
  })

  it('rejects event missing gameId', () => {
    expect(() =>
      GameEventSchema.parse({ source: 'game', data: {}, timestamp: ts })
    ).toThrow()
  })

  it('rejects event missing timestamp', () => {
    expect(() =>
      GameEventSchema.parse({ source: 'game', gameId: 'g1', data: {} })
    ).toThrow()
  })

  it('discriminates on source field', () => {
    const playerEvent = GameEventSchema.parse({
      source: 'player',
      gameId: 'g1',
      playerId: 'p1',
      data: {},
      timestamp: ts,
    })
    const gameEvent = GameEventSchema.parse({
      source: 'game',
      gameId: 'g1',
      data: {},
      timestamp: ts,
    })
    expect(playerEvent.source).toBe('player')
    expect(gameEvent.source).toBe('game')
  })
})
