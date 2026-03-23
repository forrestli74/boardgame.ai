import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { Game } from './game.js'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

const ts = '2026-01-01T00:00:00.000Z'

class MockGame implements Game {
  readonly optionsSchema = z.object({})
  private done = false

  init(config: GameConfig): GameResponse {
    return {
      requests: [{ playerId: config.players[0].id, view: {}, actionSchema: z.unknown() }],
      events: [{ source: 'game', gameId: config.gameId, data: { type: 'started' }, timestamp: ts }],
    }
  }

  handleResponse(_playerId: string, _action: unknown): GameResponse {
    this.done = true
    return { requests: [], events: [] }
  }

  isTerminal(): boolean {
    return this.done
  }

  getOutcome(): GameOutcome | null {
    if (!this.done) return null
    return { scores: { p1: 1 } }
  }
}

describe('Game interface', () => {
  it('can be implemented with internal state', () => {
    const game = new MockGame()
    expect(game).toBeDefined()
  })

  it('init returns GameResponse with requests and events', () => {
    const game = new MockGame()
    const config: GameConfig = { gameId: 'g1', seed: 1, players: [{ id: 'p1', name: 'Alice' }] }
    const response = game.init(config)
    expect(response.requests).toHaveLength(1)
    expect(response.events).toHaveLength(1)
    expect(response.requests[0].playerId).toBe('p1')
  })

  it('handleResponse returns GameResponse', () => {
    const game = new MockGame()
    const config: GameConfig = { gameId: 'g1', seed: 1, players: [{ id: 'p1', name: 'Alice' }] }
    game.init(config)
    const response = game.handleResponse('p1', { vote: 'yes' })
    expect(response).toHaveProperty('requests')
    expect(response).toHaveProperty('events')
  })

  it('holds state internally — not in method signatures', () => {
    const game = new MockGame()
    expect(game.isTerminal()).toBe(false)
    const config: GameConfig = { gameId: 'g1', seed: 1, players: [{ id: 'p1', name: 'Alice' }] }
    game.init(config)
    game.handleResponse('p1', {})
    expect(game.isTerminal()).toBe(true)
  })

  it('has optionsSchema property', () => {
    const game = new MockGame()
    expect(game.optionsSchema).toBeDefined()
    expect(game.optionsSchema.parse({})).toEqual({})
  })
})
