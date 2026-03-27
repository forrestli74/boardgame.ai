import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { Game, GameFlow } from './game.js'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

const ts = '2026-01-01T00:00:00.000Z'

class MockGame implements Game {
  readonly optionsSchema = z.object({})

  play(config: GameConfig): GameFlow {
    return (function* () {
      const { action } = yield {
        requests: [{ playerId: config.players[0].id, view: {}, actionSchema: z.unknown() }],
        events: [{ source: 'game' as const, gameId: config.gameId, data: { type: 'started' }, timestamp: ts }],
      }
      return { scores: { [config.players[0].id]: 1 } }
    })()
  }
}

describe('Game interface', () => {
  it('can be implemented as a generator', () => {
    const game = new MockGame()
    expect(game).toBeDefined()
    expect(game.play).toBeDefined()
  })

  it('first yield returns GameResponse with requests and events', () => {
    const game = new MockGame()
    const config: GameConfig = { gameId: 'g1', seed: 1, players: [{ id: 'p1', name: 'Alice' }] }
    const gen = game.play(config)
    const result = gen.next()
    expect(result.done).toBe(false)
    const response = result.value as GameResponse
    expect(response.requests).toHaveLength(1)
    expect(response.events).toHaveLength(1)
    expect(response.requests[0].playerId).toBe('p1')
  })

  it('generator return produces GameOutcome', () => {
    const game = new MockGame()
    const config: GameConfig = { gameId: 'g1', seed: 1, players: [{ id: 'p1', name: 'Alice' }] }
    const gen = game.play(config)
    gen.next() // first yield
    const result = gen.next({ playerId: 'p1', action: {} })
    expect(result.done).toBe(true)
    expect(result.value).toEqual({ scores: { p1: 1 } })
  })

  it('has optionsSchema property', () => {
    const game = new MockGame()
    expect(game.optionsSchema).toBeDefined()
    expect(game.optionsSchema.parse({})).toEqual({})
  })
})
