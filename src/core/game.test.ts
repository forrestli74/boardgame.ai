import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { Game, GameFlow } from './game.js'
import type { GameResponse, GameOutcome } from './types.js'

const ts = '2026-01-01T00:00:00.000Z'

class MockGame implements Game {
  play(playerIds: string[]): GameFlow {
    return (async function* () {
      const { action } = yield {
        requests: [{ playerId: playerIds[0], view: {}, actionSchema: z.unknown() }],
        events: [{ source: 'game' as const, gameId: 'g1', data: { type: 'started' }, timestamp: ts }],
      }
      return { scores: { [playerIds[0]]: 1 } }
    })()
  }
}

describe('Game interface', () => {
  it('can be implemented as an async generator', () => {
    const game = new MockGame()
    expect(game).toBeDefined()
    expect(game.play).toBeDefined()
  })

  it('first yield returns GameResponse with requests and events', async () => {
    const game = new MockGame()
    const gen = game.play(['p1'])
    const result = await gen.next()
    expect(result.done).toBe(false)
    const response = result.value as GameResponse
    expect(response.requests).toHaveLength(1)
    expect(response.events).toHaveLength(1)
    expect(response.requests[0].playerId).toBe('p1')
  })

  it('generator return produces GameOutcome', async () => {
    const game = new MockGame()
    const gen = game.play(['p1'])
    await gen.next()
    const result = await gen.next({ playerId: 'p1', action: {} })
    expect(result.done).toBe(true)
    expect(result.value).toEqual({ scores: { p1: 1 } })
  })
})
