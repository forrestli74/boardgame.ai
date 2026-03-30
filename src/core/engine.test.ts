import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { Engine } from './engine.js'
import type { Game, GameFlow } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameResponse, GameOutcome } from './types.js'

const ts = '2026-01-01T00:00:00.000Z'

function makeRequest(playerId: string): ActionRequest {
  return { playerId, view: {}, actionSchema: z.object({ move: z.string() }) }
}

describe('Engine', () => {
  it('sends initial requests from first yield to correct players', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1')], events: [] }
        return { scores: { p1: 1 } }
      },
    }

    const engine = new Engine('g1')
    await engine.run(game, new Map([['p1', player]]))
    expect(actSpy).toHaveBeenCalledTimes(1)
  })

  it('diffs game requests against pending — only sends new requests', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1')], events: [] }
        yield { requests: [makeRequest('p1')], events: [] }
        return { scores: { p1: 1 } }
      },
    }

    const engine = new Engine('g1')
    await engine.run(game, new Map([['p1', player]]))
    expect(actSpy).toHaveBeenCalledTimes(2)
  })

  it('skips requests for players already pending (no duplicate sends)', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1'), makeRequest('p1')], events: [] }
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    await engine.run(game, new Map([['p1', player]]))
    expect(actSpy).toHaveBeenCalledTimes(1)
  })

  it('passes raw action to game without validation', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ anything: 'goes' }),
    }
    let receivedAction: unknown

    const game: Game = {
      async *play() {
        const { action } = yield {
          requests: [makeRequest('p1')],
          events: [],
        }
        receivedAction = action
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    await engine.run(game, new Map([['p1', player]]))
    expect(receivedAction).toEqual({ anything: 'goes' })
  })

  it('emits player event for each response', async () => {
    const onEvent = vi.fn()
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      async *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    engine.onEvent(onEvent)
    await engine.run(game, new Map([['p1', player]]))
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'player', playerId: 'p1', gameId: 'g1' })
    )
  })

  it('emits game events from yielded events', async () => {
    const onEvent = vi.fn()
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      async *play() {
        yield {
          requests: [{ playerId: 'p1', view: {}, actionSchema: schema }],
          events: [{ source: 'game' as const, data: { type: 'init' }, timestamp: ts }],
        }
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    engine.onEvent(onEvent)
    await engine.run(game, new Map([['p1', player]]))
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'game', gameId: 'g1' })
    )
  })

  it('delivers parsed response to generator via .next()', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'right' }),
    }
    const schema = z.object({ move: z.string() })
    let deliveredAction: unknown

    const game: Game = {
      async *play() {
        const { action } = yield {
          requests: [{ playerId: 'p1', view: {}, actionSchema: schema }],
          events: [],
        }
        deliveredAction = action
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    await engine.run(game, new Map([['p1', player]]))
    expect(deliveredAction).toEqual({ move: 'right' })
  })

  it('stops when pending is empty (returns null)', async () => {
    const player: Player = { id: 'p1', name: 'Alice', act: vi.fn().mockResolvedValue({}) }

    const game: Game = {
      async *play() {
        yield { requests: [], events: [] }
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    const outcome = await engine.run(game, new Map([['p1', player]]))
    expect(outcome).toBeNull()
  })

  it('stops when generator completes (returns GameOutcome)', async () => {
    const player: Player = { id: 'p1', name: 'Alice', act: vi.fn().mockResolvedValue({ move: 'go' }) }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      async *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return { scores: { p1: 1 } }
      },
    }

    const engine = new Engine('g1')
    const outcome = await engine.run(game, new Map([['p1', player]]))
    expect(outcome).toEqual({ scores: { p1: 1 } })
  })

  it('returns GameOutcome with correct scores', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })
    const expected: GameOutcome = { scores: { p1: 10, p2: 5 } }

    const game: Game = {
      async *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return expected
      },
    }

    const engine = new Engine('g1')
    const outcome = await engine.run(game, new Map([['p1', player]]))
    expect(outcome).toEqual(expected)
  })

  it('handles parallel requests — multiple players acting simultaneously', async () => {
    const p1Act = vi.fn().mockResolvedValue({ move: 'a' })
    const p2Act = vi.fn().mockResolvedValue({ move: 'b' })
    const schema = z.object({ move: z.string() })
    const players = new Map<string, Player>([
      ['p1', { id: 'p1', name: 'Alice', act: p1Act }],
      ['p2', { id: 'p2', name: 'Bob', act: p2Act }],
    ])

    const game: Game = {
      async *play() {
        yield {
          requests: [
            { playerId: 'p1', view: {}, actionSchema: schema },
            { playerId: 'p2', view: {}, actionSchema: schema },
          ],
          events: [],
        }
        yield { requests: [], events: [] }
        return { scores: { p1: 1, p2: 1 } }
      },
    }

    const engine = new Engine('g1')
    await engine.run(game, players)
    expect(p1Act).toHaveBeenCalledTimes(1)
    expect(p2Act).toHaveBeenCalledTimes(1)
  })

  it('handles sequential requests — one player at a time', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      async *play() {
        yield { requests: [{ playerId: 'p1', view: { step: 0 }, actionSchema: schema }], events: [] }
        yield { requests: [{ playerId: 'p1', view: { step: 1 }, actionSchema: schema }], events: [] }
        yield { requests: [{ playerId: 'p1', view: { step: 2 }, actionSchema: schema }], events: [] }
        return { scores: { p1: 3 } }
      },
    }

    const engine = new Engine('g1')
    const outcome = await engine.run(game, new Map([['p1', player]]))
    expect(actSpy).toHaveBeenCalledTimes(3)
    expect(outcome?.scores.p1).toBe(3)
  })
})
