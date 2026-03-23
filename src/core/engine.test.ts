import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { Engine } from './engine.js'
import type { Game } from './game.js'
import type { Player } from './player.js'
import type { GameConfig, ActionRequest, GameResponse, GameOutcome } from './types.js'
import type { Recorder } from './recorder.js'

const ts = '2026-01-01T00:00:00.000Z'

function makeConfig(override?: Partial<GameConfig>): GameConfig {
  return {
    gameId: 'g1',
    seed: 1,
    players: [{ id: 'p1', name: 'Alice' }],
    ...override,
  }
}

function makeRecorder(): Recorder {
  return { record: vi.fn(), flush: vi.fn() } as unknown as Recorder
}

function makeRequest(playerId: string): ActionRequest {
  return { playerId, view: {}, actionSchema: z.object({ move: z.string() }) }
}

describe('Engine', () => {
  it('sends initial requests from game.init() to correct players', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [makeRequest('p1')], events: [] }),
      handleResponse: () => ({ requests: [], events: [] }),
      isTerminal: () => true,
      getOutcome: () => ({ scores: { p1: 1 } }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(actSpy).toHaveBeenCalledTimes(1)
  })

  it('diffs game requests against pending — only sends new requests', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }
    let callCount = 0

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [makeRequest('p1')], events: [] }),
      handleResponse: () => {
        callCount++
        return { requests: callCount < 2 ? [makeRequest('p1')] : [], events: [] }
      },
      isTerminal: () => callCount >= 2,
      getOutcome: () => ({ scores: { p1: 1 } }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(actSpy).toHaveBeenCalledTimes(2)
  })

  it('skips requests for players already pending (no duplicate sends)', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({
        requests: [makeRequest('p1'), makeRequest('p1')],
        events: [],
      }),
      handleResponse: () => ({ requests: [], events: [] }),
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(actSpy).toHaveBeenCalledTimes(1)
  })

  it('validates player response with actionSchema.safeParse()', async () => {
    const strictSchema = z.object({ move: z.string() })
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({
        requests: [{ playerId: 'p1', view: {}, actionSchema: strictSchema }],
        events: [],
      }),
      handleResponse: (_pid, action) => {
        expect(action).toEqual({ move: 'go' })
        return { requests: [], events: [] }
      },
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
  })

  it('retries on schema validation failure', async () => {
    let attempts = 0
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) return { invalid: true }
        return { move: 'go' }
      }),
    }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }),
      handleResponse: () => ({ requests: [], events: [] }),
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(attempts).toBeGreaterThanOrEqual(3)
  })

  it('passes null to game.handleResponse on max retries exceeded', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ invalid: true }),
    }
    const schema = z.object({ move: z.string() })
    let receivedAction: unknown

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }),
      handleResponse: (_pid, action) => {
        receivedAction = action
        return { requests: [], events: [] }
      },
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(receivedAction).toBeNull()
  })

  it('records player event via Recorder for each response', async () => {
    const recorder = makeRecorder()
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }),
      handleResponse: () => ({ requests: [], events: [] }),
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(recorder)
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'player', playerId: 'p1' })
    )
  })

  it('records game events from gameResponse.events via Recorder', async () => {
    const recorder = makeRecorder()
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({
        requests: [{ playerId: 'p1', view: {}, actionSchema: schema }],
        events: [{ source: 'game', gameId: 'g1', data: { type: 'init' }, timestamp: ts }],
      }),
      handleResponse: () => ({
        requests: [],
        events: [{ source: 'game', gameId: 'g1', data: { type: 'end' }, timestamp: ts }],
      }),
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(recorder)
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'game' })
    )
  })

  it('delivers parsed response to game.handleResponse()', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'right' }),
    }
    const schema = z.object({ move: z.string() })
    let deliveredAction: unknown

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }),
      handleResponse: (_pid, action) => {
        deliveredAction = action
        return { requests: [], events: [] }
      },
      isTerminal: () => true,
      getOutcome: () => ({ scores: {} }),
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(deliveredAction).toEqual({ move: 'right' })
  })

  it('stops when pending is empty', async () => {
    const player: Player = { id: 'p1', name: 'Alice', act: vi.fn().mockResolvedValue({}) }

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [], events: [] }),
      handleResponse: () => ({ requests: [], events: [] }),
      isTerminal: () => false,
      getOutcome: () => null,
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(outcome).toBeNull()
  })

  it('stops when game.isTerminal() returns true after handleResponse', async () => {
    let handleCount = 0
    const player: Player = { id: 'p1', name: 'Alice', act: vi.fn().mockResolvedValue({ move: 'go' }) }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }),
      handleResponse: () => {
        handleCount++
        return { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
      },
      isTerminal: () => handleCount >= 1,
      getOutcome: () => ({ scores: { p1: 1 } }),
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(outcome).toEqual({ scores: { p1: 1 } })
    expect(handleCount).toBe(1)
  })

  it('returns game.getOutcome()', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })
    const expected: GameOutcome = { scores: { p1: 10, p2: 5 } }

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }),
      handleResponse: () => ({ requests: [], events: [] }),
      isTerminal: () => true,
      getOutcome: () => expected,
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
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
    let handleCount = 0

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({
        requests: [
          { playerId: 'p1', view: {}, actionSchema: schema },
          { playerId: 'p2', view: {}, actionSchema: schema },
        ],
        events: [],
      }),
      handleResponse: () => {
        handleCount++
        return { requests: [], events: [] }
      },
      isTerminal: () => handleCount >= 2,
      getOutcome: () => ({ scores: { p1: 1, p2: 1 } }),
    }

    const engine = new Engine(makeRecorder())
    const config: GameConfig = {
      gameId: 'g1', seed: 1,
      players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
    }
    await engine.run(game, players, config)
    expect(p1Act).toHaveBeenCalledTimes(1)
    expect(p2Act).toHaveBeenCalledTimes(1)
  })

  it('handles sequential requests — one player at a time', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }
    const schema = z.object({ move: z.string() })
    let step = 0

    const game: Game = {
      optionsSchema: z.object({}),
      init: () => ({ requests: [{ playerId: 'p1', view: { step: 0 }, actionSchema: schema }], events: [] }),
      handleResponse: () => {
        step++
        if (step < 3) {
          return { requests: [{ playerId: 'p1', view: { step }, actionSchema: schema }], events: [] }
        }
        return { requests: [], events: [] }
      },
      isTerminal: () => step >= 3,
      getOutcome: () => ({ scores: { p1: step } }),
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(actSpy).toHaveBeenCalledTimes(3)
    expect(outcome?.scores.p1).toBe(3)
  })
})
