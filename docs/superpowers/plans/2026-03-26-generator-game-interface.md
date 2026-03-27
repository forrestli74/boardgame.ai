# Generator Game Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-method `Game` interface with a single generator-based `play()` method and update the `Engine` to drive it.

**Architecture:** The `Game` interface shrinks to `optionsSchema` + `play(config): GameFlow`. `GameFlow` is `Generator<GameResponse, GameOutcome, PlayerAction>`. The `Engine` drives the generator with `.next()`, replacing `init`/`handleResponse`/`isTerminal`/`getOutcome` calls with a single loop.

**Tech Stack:** TypeScript, Zod, Vitest

---

### Task 1: Update Game interface and types

**Files:**
- Modify: `src/core/game.ts`

- [ ] **Step 1: Write the new Game interface**

Replace the entire contents of `src/core/game.ts` with:

```typescript
import type { ZodSchema } from 'zod'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

export type PlayerAction = { playerId: string; action: unknown }

export type GameFlow = Generator<GameResponse, GameOutcome, PlayerAction>

export interface Game {
  readonly optionsSchema: ZodSchema
  play(config: GameConfig): GameFlow
}
```

- [ ] **Step 2: Run typecheck to see expected failures**

Run: `pnpm run typecheck`

Expected: Failures in `engine.ts`, `game.test.ts`, `engine.test.ts` — they still use the old 4-method interface. This confirms the type change propagated.

- [ ] **Step 3: Commit**

```bash
git add src/core/game.ts
git commit -m "refactor: replace 4-method Game interface with generator-based play()"
```

---

### Task 2: Rewrite game.test.ts for generator interface

**Files:**
- Modify: `src/core/game.test.ts`

- [ ] **Step 1: Write the updated tests**

Replace the entire contents of `src/core/game.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { Game, GameFlow } from './game.js'
import type { GameResponse, GameConfig, GameOutcome } from './types.js'

const ts = '2026-01-01T00:00:00.000Z'

class MockGame implements Game {
  readonly optionsSchema = z.object({})

  *play(config: GameConfig): GameFlow {
    const { action } = yield {
      requests: [{ playerId: config.players[0].id, view: {}, actionSchema: z.unknown() }],
      events: [{ source: 'game' as const, gameId: config.gameId, data: { type: 'started' }, timestamp: ts }],
    }
    return { scores: { [config.players[0].id]: 1 } }
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
```

- [ ] **Step 2: Run game tests to verify they pass**

Run: `pnpm test src/core/game.test.ts`

Expected: All 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/game.test.ts
git commit -m "test: update game tests for generator interface"
```

---

### Task 3: Rewrite Engine to drive generators

**Files:**
- Modify: `src/core/engine.ts`

- [ ] **Step 1: Rewrite the Engine**

Replace the entire contents of `src/core/engine.ts` with:

```typescript
import type { Game, PlayerAction } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameConfig, GameOutcome } from './types.js'
import type { Recorder } from './recorder.js'

interface PendingResponse {
  playerId: string
  action: unknown
  request: ActionRequest
}

export class Engine {
  private maxRetries = 3

  constructor(private recorder: Recorder) {}

  async run(game: Game, players: Map<string, Player>, config: GameConfig): Promise<GameOutcome | null> {
    const gen = game.play(config)
    const pending = new Map<string, Promise<PendingResponse>>()

    let result = gen.next()
    while (!result.done) {
      const { requests, events } = result.value
      for (const event of events) {
        this.recorder.record(event)
      }

      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const player = players.get(req.playerId)!
          const promise = player.act(req)
            .then(action => ({ playerId: req.playerId, action, request: req }))
          pending.set(req.playerId, promise)
        }
      }

      if (pending.size === 0) return null

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)

      const parsed = await this.validateWithRetry(
        response.action, response.request, players.get(response.playerId)!
      )

      this.recorder.record({
        source: 'player',
        gameId: config.gameId,
        playerId: response.playerId,
        data: parsed,
        timestamp: new Date().toISOString(),
      })

      result = gen.next({ playerId: response.playerId, action: parsed })
    }

    return result.value
  }

  private async validateWithRetry(
    action: unknown, request: ActionRequest, player: Player
  ): Promise<unknown> {
    let current = action
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = request.actionSchema.safeParse(current)
      if (result.success) return result.data
      if (attempt < this.maxRetries) {
        current = await player.act(request)
      }
    }
    return null
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`

Expected: `engine.ts` and `game.test.ts` pass. `engine.test.ts` still fails (mock games use old interface).

- [ ] **Step 3: Commit**

```bash
git add src/core/engine.ts
git commit -m "refactor: rewrite Engine to drive generator-based Game"
```

---

### Task 4: Rewrite engine.test.ts for generator interface

**Files:**
- Modify: `src/core/engine.test.ts`

This is the largest task — each mock game object literal needs to become a generator. The test behaviors are preserved exactly; only the mock game shapes change.

- [ ] **Step 1: Write the updated engine tests**

Replace the entire contents of `src/core/engine.test.ts` with:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { Engine } from './engine.js'
import type { Game, GameFlow } from './game.js'
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
  it('sends initial requests from first yield to correct players', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        yield { requests: [makeRequest('p1')], events: [] }
        return { scores: { p1: 1 } }
      },
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(actSpy).toHaveBeenCalledTimes(1)
  })

  it('diffs game requests against pending — only sends new requests', async () => {
    const actSpy = vi.fn().mockResolvedValue({ move: 'go' })
    const player: Player = { id: 'p1', name: 'Alice', act: actSpy }

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        yield { requests: [makeRequest('p1')], events: [] }
        // After first response, request again
        yield { requests: [makeRequest('p1')], events: [] }
        return { scores: { p1: 1 } }
      },
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
      *play() {
        yield { requests: [makeRequest('p1'), makeRequest('p1')], events: [] }
        return { scores: {} }
      },
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
      *play() {
        const { action } = yield {
          requests: [{ playerId: 'p1', view: {}, actionSchema: strictSchema }],
          events: [],
        }
        expect(action).toEqual({ move: 'go' })
        return { scores: {} }
      },
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
      *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return { scores: {} }
      },
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(attempts).toBeGreaterThanOrEqual(3)
  })

  it('passes null action to generator on max retries exceeded', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ invalid: true }),
    }
    const schema = z.object({ move: z.string() })
    let receivedAction: unknown

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        const { action } = yield {
          requests: [{ playerId: 'p1', view: {}, actionSchema: schema }],
          events: [],
        }
        receivedAction = action
        return { scores: {} }
      },
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
      *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return { scores: {} }
      },
    }

    const engine = new Engine(recorder)
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'player', playerId: 'p1' })
    )
  })

  it('records game events from yielded events via Recorder', async () => {
    const recorder = makeRecorder()
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        yield {
          requests: [{ playerId: 'p1', view: {}, actionSchema: schema }],
          events: [{ source: 'game' as const, gameId: 'g1', data: { type: 'init' }, timestamp: ts }],
        }
        return { scores: {} }
      },
    }

    const engine = new Engine(recorder)
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'game' })
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
      optionsSchema: z.object({}),
      *play() {
        const { action } = yield {
          requests: [{ playerId: 'p1', view: {}, actionSchema: schema }],
          events: [],
        }
        deliveredAction = action
        return { scores: {} }
      },
    }

    const engine = new Engine(makeRecorder())
    await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(deliveredAction).toEqual({ move: 'right' })
  })

  it('stops when pending is empty (returns null)', async () => {
    const player: Player = { id: 'p1', name: 'Alice', act: vi.fn().mockResolvedValue({}) }

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        yield { requests: [], events: [] }
        return { scores: {} }
      },
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(outcome).toBeNull()
  })

  it('stops when generator completes (returns GameOutcome)', async () => {
    const player: Player = { id: 'p1', name: 'Alice', act: vi.fn().mockResolvedValue({ move: 'go' }) }
    const schema = z.object({ move: z.string() })

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return { scores: { p1: 1 } }
      },
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
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
      optionsSchema: z.object({}),
      *play() {
        yield { requests: [{ playerId: 'p1', view: {}, actionSchema: schema }], events: [] }
        return expected
      },
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

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        // Request both players simultaneously
        yield {
          requests: [
            { playerId: 'p1', view: {}, actionSchema: schema },
            { playerId: 'p2', view: {}, actionSchema: schema },
          ],
          events: [],
        }
        // First response comes in — buffer it
        yield { requests: [], events: [] }
        // Second response — both done
        return { scores: { p1: 1, p2: 1 } }
      },
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

    const game: Game = {
      optionsSchema: z.object({}),
      *play() {
        yield { requests: [{ playerId: 'p1', view: { step: 0 }, actionSchema: schema }], events: [] }
        yield { requests: [{ playerId: 'p1', view: { step: 1 }, actionSchema: schema }], events: [] }
        yield { requests: [{ playerId: 'p1', view: { step: 2 }, actionSchema: schema }], events: [] }
        return { scores: { p1: 3 } }
      },
    }

    const engine = new Engine(makeRecorder())
    const outcome = await engine.run(game, new Map([['p1', player]]), makeConfig())
    expect(actSpy).toHaveBeenCalledTimes(3)
    expect(outcome?.scores.p1).toBe(3)
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test src/core/`

Expected: All tests in `game.test.ts` and `engine.test.ts` PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`

Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/engine.test.ts
git commit -m "test: rewrite engine tests for generator-based Game"
```

---

### Task 5: Update architecture.md

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update the Game section**

Replace lines 31–41 (the Game section) with:

```markdown
## Game (`src/core/game.ts`)

Generator-based state machine. The `play()` method is a generator that yields `GameResponse` objects and returns a `GameOutcome` when the game ends.

| Export | Purpose |
|---|---|
| `Game` | Interface — `optionsSchema` + `play(config): GameFlow` |
| `GameFlow` | `Generator<GameResponse, GameOutcome, PlayerAction>` |
| `PlayerAction` | `{ playerId: string; action: unknown }` — passed to generator via `.next()` |

Each `yield` sends requests + events to the engine. Each `.next(playerAction)` delivers one player's validated response. Generator completion signals the game is terminal; the return value is the outcome.
```

- [ ] **Step 2: Update the Engine section**

Replace lines 20–29 (the Engine section) with:

```markdown
## Engine (`src/core/engine.ts`)

Mediator. Owns the game loop.

- Calls `game.play(config)` to get a generator
- Drives the generator with `.next()` — first call starts the game, subsequent calls deliver player responses
- **Diffs requests** — each yield returns ALL current requests; engine only sends new ones (keyed by `playerId`)
- **Validates** responses via `actionSchema.safeParse()` with retry (3 attempts), passes `null` on exhaustion
- Records all events via Recorder
- Stops when `pending.size === 0` (returns null) or generator completes (returns `GameOutcome`)
```

- [ ] **Step 3: Update the Concurrency section**

Replace the AIGame batching bullet (line 59) with:

```markdown
- **Parallel collection**: When multiple players act simultaneously, the generator buffers responses via a `while` loop, yielding `{ requests: [], events: [] }` (no-ops) until all responses are collected. The engine continues dispatching pending responses via `Promise.race`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture.md for generator Game interface"
```

---

### Task 6: Update implementing-a-game.md

**Files:**
- Modify: `docs/implementing-a-game.md`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `docs/implementing-a-game.md` with:

```markdown
# Implementing a Game

Build a class implementing `Game`. The framework handles player communication, validation, logging, and concurrency.

## Interface

```typescript
import type { ZodSchema } from 'zod'
import type { GameResponse, GameConfig, GameOutcome } from './core/types.js'

type PlayerAction = { playerId: string; action: unknown }
type GameFlow = Generator<GameResponse, GameOutcome, PlayerAction>

interface Game {
  readonly optionsSchema: ZodSchema
  play(config: GameConfig): GameFlow
}
```

The `play()` method is a generator:
- **`yield`** sends a `GameResponse` (requests + events) to the engine
- **`.next(playerAction)`** receives one player's validated response
- **`return`** produces the final `GameOutcome` and ends the game

## Minimal Example: Coin Flip

```typescript
import { z } from 'zod'
import type { Game, GameFlow } from './core/game.js'
import type { GameConfig } from './core/types.js'
import type { GameEvent } from './core/events.js'

const CallSchema = z.enum(['heads', 'tails'])

class CoinFlip implements Game {
  readonly optionsSchema = z.object({})

  *play(config: GameConfig): GameFlow {
    const playerId = config.players[0].id
    const gameId = config.gameId
    const result = Math.random() > 0.5 ? 'heads' : 'tails'

    const { action } = yield {
      requests: [{
        playerId,
        view: { message: 'Call it: heads or tails' },
        actionSchema: CallSchema,
      }],
      events: [event(gameId, { type: 'flip', result })],
    }

    const call = (action ?? result) as 'heads' | 'tails'
    const won = call === result

    return { scores: { [playerId]: won ? 1 : 0 } }
  }
}

function event(gameId: string, data: unknown): GameEvent {
  return { source: 'game', gameId, data, timestamp: new Date().toISOString() }
}
```

## Checklist

- [ ] **State is internal** — never expose full state through `view`
- [ ] **`view` is per-player** — only show what that player should see
- [ ] **Yield ALL current requests** — engine diffs against pending
- [ ] **Handle `null` actions** — engine sends null when validation retries exhausted; apply a default
- [ ] **`actionSchema` is a Zod schema** — describes what the player can do
- [ ] **Events are self-describing** — use `data.type` to distinguish (e.g., `round-result`, `role-assigned`)
- [ ] **Generator returns `GameOutcome`** — `{ scores: Record<string, number> }`

## Patterns

### Parallel: Collecting All Responses

All players act simultaneously. Buffer responses with a `while` loop, resolve when all are in:

```typescript
*collectGuesses(players: string[], schema: ZodSchema) {
  const guesses: Record<string, number> = {}
  const first = yield {
    requests: players.map(id => ({ playerId: id, view: {}, actionSchema: schema })),
    events: [],
  }
  guesses[first.playerId] = first.action as number
  while (Object.keys(guesses).length < players.length) {
    const { playerId, action } = yield { requests: [], events: [] }
    guesses[playerId] = action as number
  }
  return guesses
}
```

Use `yield*` to delegate to sub-generators:

```typescript
const guesses = yield* this.collectGuesses(playerIds, GuessSchema)
```

### Sequential: Turn-Based

Yield one request at a time:

```typescript
*play(config: GameConfig): GameFlow {
  for (const player of config.players) {
    const { action } = yield {
      requests: [{ playerId: player.id, view: { turn: player.id }, actionSchema: MoveSchema }],
      events: [],
    }
    // process action...
  }
  return { scores: { ... } }
}
```

### Mixed Phases

Alternate between sequential and parallel by varying what you yield:

```typescript
// Proposal: one player (sequential)
const { action: team } = yield {
  requests: [{ playerId: leader, view: ..., actionSchema: ProposalSchema }],
  events: [],
}

// Voting: all players (parallel — use collection pattern)
const votes = yield* this.collectVotes(playerIds)

// Quest: team members only (parallel subset)
const results = yield* this.collectQuestCards(team)
```

## Running Your Game

```typescript
import { Engine } from './core/engine.js'
import { Recorder } from './core/recorder.js'

const game = new CoinFlip()
const recorder = new Recorder('game-1', '/tmp/coinflip.jsonl')
const players = new Map([['p1', somePlayer]])
const config = { gameId: 'game-1', seed: 42, players: [{ id: 'p1', name: 'Alice' }] }

const outcome = await new Engine(recorder).run(game, players, config)
recorder.flush()
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/implementing-a-game.md
git commit -m "docs: rewrite implementing-a-game.md for generator pattern"
```

---

### Task 7: Update game-loop.md

**Files:**
- Modify: `docs/game-loop.md`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `docs/game-loop.md` with:

```markdown
# Game Loop

## Lifecycle

```
Engine.run(game, players, config)
│
├─ 1. gen = game.play(config)
│     result = gen.next()          // first yield
│
├─ 2. LOOP (while !result.done):
│  ├─ 2a. Record events from result.value
│  ├─ 2b. Diff requests against pending map, send new ones to players
│  ├─ 2c. Promise.race(pending) — wait for first response
│  ├─ 2d. Validate: actionSchema.safeParse → retry (3x) → null
│  ├─ 2e. Record player event
│  ├─ 2f. result = gen.next({ playerId, action })
│  └─ 2g. Back to 2a
│
└─ 3. result.done === true → return result.value (GameOutcome)
```

## Example: 2-Player Guessing Game

```
Config: alice + bob, 3 rounds, targets = [7, 3, 9]

Round 1:
  gen.next() → first yield: requests for alice & bob (view: {round:1})
  alice guesses 7  → gen.next({playerId:"alice", action:7}) → no-op yield (waiting for bob)
  bob guesses 4    → gen.next({playerId:"bob", action:4})   → round resolves
    event: round-result {target:7, winner:"alice"}

Round 2:
  alice guesses 5  → no-op yield
  bob guesses 3    → round resolves, winner:"bob"

Round 3:
  alice guesses 8  → no-op yield
  bob guesses 10   → generator returns (done=true)

Outcome: { scores: {alice: 2, bob: 1} }
```

## JSONL Output

Each line is valid JSON with a `gameId` field. Two shapes:

```jsonl
{"source":"game","gameId":"g1","data":{"type":"start","players":["alice","bob"]},"timestamp":"..."}
{"source":"player","gameId":"g1","playerId":"alice","data":7,"timestamp":"..."}
{"source":"game","gameId":"g1","data":{"type":"round-result","round":1,"target":7,"winner":"alice"},"timestamp":"..."}
```

Events are the complete game record — no separate log schema.
```

- [ ] **Step 2: Commit**

```bash
git add docs/game-loop.md
git commit -m "docs: update game-loop.md for generator-based engine"
```

---

### Task 8: Migrate or remove AIGame

**Files:**
- `src/games/ai_game/ai-game.ts`
- `src/games/ai_game/ai-game.test.ts`
- `src/games/ai_game/integration.test.ts`
- `src/games/ai_game/avalon-integration.test.ts`
- `src/games/ai_game/debug-avalon.test.ts`
- `src/games/ai_game/debug-integration.test.ts`

**Decision point — stop and discuss with user before proceeding.**

`AIGame` implements the old 4-method `Game` interface and will no longer compile. It also uses async LLM calls (`generateText()`), which means a direct migration would require `AsyncGenerator` — a framework change beyond the current scope.

- [ ] **Step 1: Read the current AIGame code**

Read `src/games/ai_game/ai-game.ts` to understand the current implementation.

- [ ] **Step 2: Present options to user**

Options:
1. **Delete** — remove `src/games/ai_game/` entirely (it's experimental/WIP)
2. **Stub** — replace with a placeholder that throws "not yet migrated"
3. **Migrate** — convert to generator; requires adding `AsyncGenerator` support to `GameFlow` and `Engine`

Wait for user decision before proceeding.

- [ ] **Step 3: Execute user's chosen option**

- [ ] **Step 4: Commit**

---

### Task 9: Final verification

- [ ] **Step 1: Run all tests**

Run: `pnpm test`

Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`

Expected: PASS — no type errors.

- [ ] **Step 3: Verify no old interface references remain in src/core/**

Run: `grep -rn 'isTerminal\|getOutcome\|handleResponse\|\.init(' src/core/`

Expected: No matches (old interface methods gone from core).

- [ ] **Step 4: Run typecheck across entire project**

Run: `pnpm run typecheck`

Expected: PASS — no type errors anywhere (including ai_game if it was migrated/deleted).
