# Typed Event System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the untyped event system with explicit interfaces. Games yield raw data, engine stamps metadata, player private events are opaque to the framework.

**Architecture:**
- Games yield `events: unknown[]` — engine wraps each into `GameSourceEvent` with `seq`, `gameId`, `timestamp`
- Engine creates `PlayerSourceEvent` when a player responds — same stamping
- Player private events are raw `unknown` data — `runGame` wires player `onEvent` to artifacts, no framework type
- Per-game typed event unions (e.g. `AvalonEventData`) give compile-time safety inside game implementations
- No Zod schemas for events or `GameOutcome` — just interfaces (YAGNI, no prod deserialization)

**Data flow:**
```
Game events:     Game ──▶ Engine (stamps) ──▶ listeners ──▶ Recorder/Artifacts
Player actions:  Player.act() returns ──▶ Engine (stamps) ──▶ listeners ──▶ Recorder/Artifacts
Private events:  Player emits raw data ──▶ runGame wires ──▶ Artifacts
```

**Tech Stack:** TypeScript, Vitest

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/core/events.ts` | Rewrite | Remove Zod schemas, `GameYieldedEvent`, `DistributiveOmit`. Export `GameSourceEvent`, `PlayerSourceEvent`, `GameEvent` as plain interfaces. |
| `src/core/events.test.ts` | Delete | Was testing Zod parsing — interfaces don't need runtime tests. |
| `src/core/types.ts` | Modify | `GameResponse.events` becomes `unknown[]`. Remove `GameYieldedEvent` import. `GameOutcome` becomes plain interface (remove Zod). Remove `z` import. |
| `src/core/types.test.ts` | Delete | Was testing `GameOutcomeSchema` Zod parsing. |
| `src/core/player.ts` | Modify | Remove `PlayerPrivateEvent`. `onEvent` callback becomes `(data: unknown) => void`. |
| `src/core/engine.ts` | Modify | `emit()` splits into `emitGameEvent(data)` and `emitPlayerEvent(playerId, action, lastSeenSeq?)`. Engine stamps `seq`, `gameId`, `timestamp` on both. Remove `GameYieldedEvent` import. |
| `src/core/artifacts.ts` | Modify | `recordPlayerEvent(playerId, data)` takes `string` + `unknown`. Remove `PlayerPrivateEvent` import. |
| `src/core/run-game.ts` | Modify | Wire player `onEvent` with `(data) => artifacts.recordPlayerEvent(player.id, data)`. Remove `PlayerPrivateEvent` import. |
| `src/core/discussion.ts` | Modify | Remove `GameYieldedEvent` import. `pendingEvents` and `DiscussionResult.pendingEvents` become `unknown[]`. Remove `event()` helper. |
| `src/core/game.ts` | No change | `GameFlow` uses `GameResponse` which changes via `types.ts`. |
| `src/core/recorder.ts` | No change | Still takes `GameEvent`. |
| `src/games/avalon/types.ts` | Modify | Add `AvalonEventData` discriminated union. |
| `src/games/avalon/avalon.ts` | Modify | Remove `GameYieldedEvent` import. `pendingEvents` becomes `AvalonEventData[]`. Remove `event()` helper — use data literals. |
| `src/games/ai_game/ai-game.ts` | Modify | Remove `GameYieldedEvent` import. `processLLMResponse` returns `events: unknown[]`. Remove timestamp generation. |
| `src/players/llm-player.ts` | Modify | `onEvent` listener becomes `(data: unknown) => void`. Emit raw `{ reasoning, memory, action, lastSeenSeq }`. Remove `PlayerPrivateEvent` import. |
| `src/core/engine.test.ts` | Modify | Game events in yields become raw data (no `source`/`timestamp`). |
| `src/core/game.test.ts` | Modify | Same — events become raw data. |
| `src/core/run-game.test.ts` | Modify | Events become raw data. Mock player emits raw `unknown`. |
| `src/core/artifacts.test.ts` | Modify | `recordPlayerEvent` takes `(playerId, data)` — no `PlayerPrivateEvent` type. |
| `src/integration.test.ts` | Modify | Remove `GameYieldedEvent` import. Events become raw data. |
| `src/games/avalon/avalon.test.ts` | No change | Tests use engine-emitted `GameEvent` — shape unchanged. |

---

### Task 1: Rewrite core event types and delete Zod-only tests

**Files:**
- Rewrite: `src/core/events.ts`
- Delete: `src/core/events.test.ts`
- Modify: `src/core/types.ts`
- Delete: `src/core/types.test.ts`

- [ ] **Step 1: Rewrite `src/core/events.ts`**

```typescript
export interface GameSourceEvent {
  seq: number
  source: 'game'
  gameId: string
  data: unknown
  timestamp: string
}

export interface PlayerSourceEvent {
  seq: number
  source: 'player'
  gameId: string
  playerId: string
  lastSeenSeq?: number
  data: unknown
  timestamp: string
}

export type GameEvent = GameSourceEvent | PlayerSourceEvent
```

- [ ] **Step 2: Delete `src/core/events.test.ts`**

```bash
rm src/core/events.test.ts
```

- [ ] **Step 3: Rewrite `src/core/types.ts`**

```typescript
import type { ZodSchema } from 'zod'

export interface ActionRequest {
  readonly playerId: string
  readonly view: unknown
  readonly actionSchema: ZodSchema
  readonly lastSeenSeq?: number
}

export interface GameResponse {
  readonly requests: ActionRequest[]
  readonly events: unknown[]
}

export interface GameOutcome {
  scores: Record<string, number>
  metadata?: Record<string, unknown>
}
```

- [ ] **Step 4: Delete `src/core/types.test.ts`**

```bash
rm src/core/types.test.ts
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: Errors in files importing `GameYieldedEvent`, `PlayerPrivateEvent`, `GameOutcomeSchema`, `PlayerEventSchema`. Expected — fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/events.ts src/core/types.ts
git rm src/core/events.test.ts src/core/types.test.ts
git commit -m "refactor: plain interfaces for events and GameOutcome, remove Zod schemas"
```

---

### Task 2: Update Player interface and Artifacts

**Files:**
- Modify: `src/core/player.ts`
- Modify: `src/core/artifacts.ts`
- Test: `src/core/artifacts.test.ts`

- [ ] **Step 1: Rewrite `src/core/player.ts`**

```typescript
import type { ActionRequest } from './types.js'

export interface Player {
  readonly id: string
  readonly name: string
  act(request: ActionRequest): Promise<unknown>
  onEvent?(listener: (data: unknown) => void): void
}
```

- [ ] **Step 2: Update `src/core/artifacts.ts`**

Remove `PlayerPrivateEvent` import. `recordPlayerEvent` takes `playerId` + raw `data`:

```typescript
import { mkdir, writeFile } from 'node:fs/promises'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { GameEvent } from './events.js'
import type { GameOutcome } from './types.js'

export interface ArtifactConfig {
  gameId: string
  players: { id: string; name: string }[]
}

export class GameArtifacts {
  private eventsPath: string

  private constructor(readonly outputDir: string) {
    this.eventsPath = join(outputDir, 'events.jsonl')
  }

  static async create(outputDir: string, config: ArtifactConfig): Promise<GameArtifacts> {
    await mkdir(join(outputDir, 'players'), { recursive: true })
    writeFileSync(join(outputDir, 'events.jsonl'), '')
    await writeFile(join(outputDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')
    return new GameArtifacts(outputDir)
  }

  recordEvent(event: GameEvent): void {
    appendFileSync(this.eventsPath, JSON.stringify(event) + '\n')
  }

  recordPlayerEvent(playerId: string, data: unknown): void {
    const safe = basename(playerId)
    const playerPath = join(this.outputDir, 'players', `${safe}.jsonl`)
    appendFileSync(playerPath, JSON.stringify(data) + '\n')
  }

  async writeOutcome(outcome: GameOutcome): Promise<void> {
    await writeFile(join(this.outputDir, 'outcome.json'), JSON.stringify(outcome, null, 2) + '\n')
  }
}
```

- [ ] **Step 3: Update `src/core/artifacts.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GameArtifacts, type ArtifactConfig } from './artifacts.js'
import type { GameEvent } from './events.js'
import type { GameOutcome } from './types.js'

describe('GameArtifacts', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'artifacts-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('creates output directory and writes config.json', async () => {
    const config: ArtifactConfig = {
      gameId: 'test-1',
      players: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }],
    }
    const outputDir = join(tmpDir, 'test-1')
    await GameArtifacts.create(outputDir, config)

    const raw = await readFile(join(outputDir, 'config.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(config)
  })

  it('records game events to events.jsonl', async () => {
    const outputDir = join(tmpDir, 'test-events')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test', players: [] })

    const event1: GameEvent = {
      seq: 0, source: 'game', gameId: 'test',
      data: { description: 'Game started' }, timestamp: '2026-01-01T00:00:00.000Z',
    }
    const event2: GameEvent = {
      seq: 1, source: 'player', gameId: 'test', playerId: 'alice',
      data: 'approve', timestamp: '2026-01-01T00:00:01.000Z',
    }

    artifacts.recordEvent(event1)
    artifacts.recordEvent(event2)

    const lines = (await readFile(join(outputDir, 'events.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    expect(lines).toEqual([event1, event2])
  })

  it('records player private data to players/{id}.jsonl', async () => {
    const outputDir = join(tmpDir, 'test-player')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test', players: [] })

    const aliceData = { reasoning: 'I think bob is evil', memory: 'Round 1', action: 'approve' }
    const bobData = { reasoning: 'Trust alice', memory: 'Round 1', action: 'reject' }

    artifacts.recordPlayerEvent('alice', aliceData)
    artifacts.recordPlayerEvent('bob', bobData)

    const aliceLines = (await readFile(join(outputDir, 'players', 'alice.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    const bobLines = (await readFile(join(outputDir, 'players', 'bob.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))

    expect(aliceLines).toEqual([aliceData])
    expect(bobLines).toEqual([bobData])
  })

  it('writes outcome.json', async () => {
    const outputDir = join(tmpDir, 'test-outcome')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test', players: [] })

    const outcome: GameOutcome = {
      scores: { alice: 1, bob: 0 },
      metadata: { winner: 'good' },
    }

    await artifacts.writeOutcome(outcome)

    const raw = await readFile(join(outputDir, 'outcome.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(outcome)
  })
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/core/artifacts.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/player.ts src/core/artifacts.ts src/core/artifacts.test.ts
git commit -m "refactor: Player.onEvent emits raw data, artifacts takes (playerId, data)"
```

---

### Task 3: Update Engine to stamp events

**Files:**
- Modify: `src/core/engine.ts`
- Test: `src/core/engine.test.ts`

- [ ] **Step 1: Rewrite `src/core/engine.ts`**

```typescript
import type { Game, PlayerAction } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameOutcome } from './types.js'
import type { GameEvent } from './events.js'

interface PendingResponse {
  playerId: string
  action: unknown
  request: ActionRequest
}

export class Engine {
  readonly gameId: string
  private listeners: ((event: GameEvent) => void)[] = []
  private lastSeq = -1

  constructor(gameId: string) {
    this.gameId = gameId
  }

  onEvent(listener: (event: GameEvent) => void): void {
    this.listeners.push(listener)
  }

  private emitGameEvent(data: unknown): void {
    this.lastSeq++
    const event: GameEvent = {
      seq: this.lastSeq,
      source: 'game',
      gameId: this.gameId,
      data,
      timestamp: new Date().toISOString(),
    }
    for (const fn of this.listeners) fn(event)
  }

  private emitPlayerEvent(playerId: string, action: unknown, lastSeenSeq?: number): void {
    this.lastSeq++
    const event: GameEvent = {
      seq: this.lastSeq,
      source: 'player',
      gameId: this.gameId,
      playerId,
      lastSeenSeq,
      data: action,
      timestamp: new Date().toISOString(),
    }
    for (const fn of this.listeners) fn(event)
  }

  async run(game: Game, players: Map<string, Player>): Promise<GameOutcome | null> {
    const gen = game.play([...players.keys()])
    const pending = new Map<string, Promise<PendingResponse>>()
    this.lastSeq = -1

    let result = await gen.next()
    while (!result.done) {
      const { requests, events } = result.value
      for (const eventData of events) {
        this.emitGameEvent(eventData)
      }

      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const player = players.get(req.playerId)!
          const stamped = { ...req, lastSeenSeq: this.lastSeq }
          const promise = player.act(stamped)
            .then(action => ({ playerId: req.playerId, action, request: stamped }))
          pending.set(req.playerId, promise)
        }
      }

      if (pending.size === 0) return null

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)

      this.emitPlayerEvent(response.playerId, response.action, response.request.lastSeenSeq)

      result = await gen.next({ playerId: response.playerId, action: response.action })
    }

    return result.value
  }
}
```

- [ ] **Step 2: Rewrite `src/core/engine.test.ts`**

Games now yield raw data in `events` (no `source`/`timestamp`):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { Engine } from './engine.js'
import type { Game, GameFlow } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameOutcome } from './types.js'

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

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1')], events: [] }
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

  it('emits game events from yielded event data', async () => {
    const onEvent = vi.fn()
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'go' }),
    }

    const game: Game = {
      async *play() {
        yield {
          requests: [makeRequest('p1')],
          events: [{ type: 'init' }],
        }
        return { scores: {} }
      },
    }

    const engine = new Engine('g1')
    engine.onEvent(onEvent)
    await engine.run(game, new Map([['p1', player]]))
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'game', gameId: 'g1', data: { type: 'init' } })
    )
  })

  it('delivers parsed response to generator via .next()', async () => {
    const player: Player = {
      id: 'p1', name: 'Alice',
      act: vi.fn().mockResolvedValue({ move: 'right' }),
    }
    let deliveredAction: unknown

    const game: Game = {
      async *play() {
        const { action } = yield {
          requests: [makeRequest('p1')],
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

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1')], events: [] }
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
    const expected: GameOutcome = { scores: { p1: 10, p2: 5 } }

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1')], events: [] }
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
    const players = new Map<string, Player>([
      ['p1', { id: 'p1', name: 'Alice', act: p1Act }],
      ['p2', { id: 'p2', name: 'Bob', act: p2Act }],
    ])

    const game: Game = {
      async *play() {
        yield {
          requests: [makeRequest('p1'), makeRequest('p2')],
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

    const game: Game = {
      async *play() {
        yield { requests: [makeRequest('p1')], events: [] }
        yield { requests: [makeRequest('p1')], events: [] }
        yield { requests: [makeRequest('p1')], events: [] }
        return { scores: { p1: 3 } }
      },
    }

    const engine = new Engine('g1')
    const outcome = await engine.run(game, new Map([['p1', player]]))
    expect(actSpy).toHaveBeenCalledTimes(3)
    expect(outcome?.scores.p1).toBe(3)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm test src/core/engine.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/engine.ts src/core/engine.test.ts
git commit -m "refactor: engine stamps seq, gameId, timestamp on all events"
```

---

### Task 4: Update runGame and its test

**Files:**
- Modify: `src/core/run-game.ts`
- Test: `src/core/run-game.test.ts`

- [ ] **Step 1: Rewrite `src/core/run-game.ts`**

```typescript
import { Engine } from './engine.js'
import { GameArtifacts, type ArtifactConfig } from './artifacts.js'
import type { Game } from './game.js'
import type { Player } from './player.js'
import type { GameOutcome } from './types.js'

export interface RunGameOptions {
  gameId: string
  game: Game
  players: Player[]
  outputDir: string
}

export interface GameResult {
  outcome: GameOutcome | null
  outputDir: string
}

export async function runGame(options: RunGameOptions): Promise<GameResult> {
  const { gameId, game, players, outputDir } = options

  const playerMap = new Map(players.map(p => [p.id, p]))

  const config: ArtifactConfig = {
    gameId,
    players: players.map(p => ({ id: p.id, name: p.name })),
  }

  const artifacts = await GameArtifacts.create(outputDir, config)
  const engine = new Engine(gameId)

  engine.onEvent((event) => artifacts.recordEvent(event))
  for (const player of players) {
    if (player.onEvent) {
      player.onEvent((data) => artifacts.recordPlayerEvent(player.id, data))
    }
  }

  const outcome = await engine.run(game, playerMap)

  if (outcome) {
    await artifacts.writeOutcome(outcome)
  }

  return { outcome, outputDir }
}
```

- [ ] **Step 2: Rewrite `src/core/run-game.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { runGame } from './run-game.js'
import type { Game } from './game.js'
import type { Player } from './player.js'

describe('runGame', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'run-game-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('does not write outcome.json when game returns null', async () => {
    const game: Game = {
      async *play() {
        yield { requests: [], events: [] }
        return { scores: {} }
      },
    }

    const outputDir = join(tmpDir, 'test-null')
    const result = await runGame({
      gameId: 'test-null',
      game,
      players: [],
      outputDir,
    })

    expect(result.outcome).toBeNull()
    const files = await readdir(outputDir)
    expect(files).not.toContain('outcome.json')
  })

  it('runs a game and writes all artifacts', async () => {
    const game: Game = {
      async *play(playerIds) {
        const first = yield {
          requests: playerIds.map(id => ({
            playerId: id,
            view: 'your turn',
            actionSchema: z.literal('yes'),
          })),
          events: [{ type: 'start' }],
        }
        yield { requests: [], events: [] }
        return { scores: Object.fromEntries(playerIds.map(id => [id, 1])) }
      },
    }

    const makeMockPlayer = (id: string): Player => {
      const listeners: ((data: unknown) => void)[] = []
      return {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        async act() {
          for (const fn of listeners) {
            fn({ reasoning: `${id} thinking`, memory: '', action: 'yes' })
          }
          return 'yes'
        },
        onEvent(listener) { listeners.push(listener) },
      }
    }

    const outputDir = join(tmpDir, 'test-run')
    const result = await runGame({
      gameId: 'test-run',
      game,
      players: [makeMockPlayer('alice'), makeMockPlayer('bob')],
      outputDir,
    })

    expect(result.outcome).toEqual({ scores: { alice: 1, bob: 1 } })
    expect(result.outputDir).toBe(outputDir)

    const files = await readdir(outputDir)
    expect(files.sort()).toEqual(['config.json', 'events.jsonl', 'outcome.json', 'players'])

    const playerFiles = await readdir(join(outputDir, 'players'))
    expect(playerFiles.sort()).toEqual(['alice.jsonl', 'bob.jsonl'])

    const config = JSON.parse(await readFile(join(outputDir, 'config.json'), 'utf-8'))
    expect(config.gameId).toBe('test-run')
    expect(config.players).toEqual([
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ])

    const outcome = JSON.parse(await readFile(join(outputDir, 'outcome.json'), 'utf-8'))
    expect(outcome.scores).toEqual({ alice: 1, bob: 1 })

    const events = (await readFile(join(outputDir, 'events.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    expect(events.length).toBeGreaterThan(0)

    const aliceLog = (await readFile(join(outputDir, 'players', 'alice.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    expect(aliceLog.length).toBe(1)
    expect(aliceLog[0].reasoning).toBe('alice thinking')
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm test src/core/run-game.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/run-game.ts src/core/run-game.test.ts
git commit -m "refactor: runGame wires player raw data to artifacts"
```

---

### Task 5: Update Discussion module

**Files:**
- Modify: `src/core/discussion.ts`

- [ ] **Step 1: Rewrite `src/core/discussion.ts`**

Remove `GameYieldedEvent` import. `pendingEvents` becomes `unknown[]`. Remove `event()` helper.

```typescript
import { z } from 'zod'
import type { GameResponse } from './types.js'
import type { ActionRequest } from './types.js'
import type { PlayerAction } from './game.js'

export interface DiscussionStatement {
  playerId: string
  content: string
}

export interface DiscussionResult {
  statements: DiscussionStatement[]
  pendingEvents: unknown[]
}

export interface DiscussionOptions {
  firstSpeakers?: string[]
}

export interface Discussion {
  run(
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction>
}

export const DiscussionStatementSchema = z.object({
  statement: z.string().describe('Your statement to the group. Pass with empty string unless you have something to add.'),
})

const DEFAULT_PROMPT = `Share your thoughts with the group. Keep it short and direct. Address specific players when you have something to say to them.`

export class BroadcastDiscussion implements Discussion {
  private readonly prompt: string

  constructor(private readonly maxRounds: number = 3, prompt?: string) {
    this.prompt = prompt ?? DEFAULT_PROMPT
  }

  async *run(
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction> {
    const allStatements: DiscussionStatement[] = []
    const previousStatements: { playerId: string; content: string }[] = []
    let pendingEvents: unknown[] = []

    let activePlayers = [...playerIds]
    if (options?.firstSpeakers) {
      const first = options.firstSpeakers.filter(id => activePlayers.includes(id))
      const rest = activePlayers.filter(id => !first.includes(id))
      activePlayers = [...first, ...rest]
    }

    for (let round = 0; round < this.maxRounds; round++) {
      if (activePlayers.length === 0) break

      const requests: ActionRequest[] = activePlayers.map(id => ({
        playerId: id,
        view: {
          context: contexts[id],
          prompt: this.prompt,
          round,
          previousStatements: [...previousStatements],
        },
        actionSchema: DiscussionStatementSchema,
      }))

      const roundStatements: { playerId: string; content: string }[] = []

      const firstAction: PlayerAction = yield { requests, events: pendingEvents }
      pendingEvents = []
      let firstParsed = DiscussionStatementSchema.safeParse(firstAction.action)
      if (!firstParsed.success) {
        pendingEvents.push({ type: 'validation-failed', playerId: firstAction.playerId, raw: firstAction.action })
        firstParsed = { success: true, data: { statement: '' } } as any
      }
      roundStatements.push({ playerId: firstAction.playerId, content: firstParsed.data!.statement })

      while (roundStatements.length < activePlayers.length) {
        const action: PlayerAction = yield { requests: [], events: [] }
        let parsed = DiscussionStatementSchema.safeParse(action.action)
        if (!parsed.success) {
          pendingEvents.push({ type: 'validation-failed', playerId: action.playerId, raw: action.action })
          parsed = { success: true, data: { statement: '' } } as any
        }
        roundStatements.push({ playerId: action.playerId, content: parsed.data!.statement })
      }

      let allPassed = true
      for (const s of roundStatements) {
        if (s.content !== '') {
          allPassed = false
          allStatements.push({ playerId: s.playerId, content: s.content })
          previousStatements.push({ playerId: s.playerId, content: s.content })
        }
      }

      pendingEvents = [{
        type: 'discussion-round',
        round,
        statements: roundStatements.filter(s => s.content !== ''),
      }]

      if (allPassed) break
    }

    return { statements: allStatements, pendingEvents }
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: Remaining errors only in avalon.ts, ai-game.ts, llm-player.ts, game.test.ts, integration.test.ts.

- [ ] **Step 3: Commit**

```bash
git add src/core/discussion.ts
git commit -m "refactor: discussion yields raw event data"
```

---

### Task 6: Update Avalon with typed event data

**Files:**
- Modify: `src/games/avalon/types.ts`
- Modify: `src/games/avalon/avalon.ts`

- [ ] **Step 1: Add `AvalonEventData` to `src/games/avalon/types.ts`**

Add at end of file, after the action type aliases:

```typescript
// --- Event Data ---

export type AvalonEventData =
  | { type: 'game-start'; players: string[]; questConfigs: QuestConfig[] }
  | { type: 'team-proposed'; leader: string; team: string[]; questNumber: number }
  | { type: 'vote-result'; votes: Record<string, 'approve' | 'reject'>; result: 'approved' | 'rejected' }
  | { type: 'quest-result'; questNumber: number; result: 'success' | 'fail'; failVotes: number }
  | { type: 'assassination-attempt'; assassin: string; target: string; result: 'success' | 'fail' }
  | { type: 'game-end'; reason: 'three-successes' | 'three-fails' | 'assassination' | 'hammer'; winner: 'good' | 'evil' }
  | { type: 'validation-failed'; playerId: string; raw: unknown }
```

- [ ] **Step 2: Rewrite `src/games/avalon/avalon.ts`**

```typescript
import type { Game, GameFlow, PlayerAction } from '../../core/game.js'
import type { GameOutcome, ActionRequest } from '../../core/types.js'
import type { Discussion } from '../../core/discussion.js'
import {
  type AvalonPlayer, type AvalonState, type AvalonEventData,
  TeamProposalSchema, TeamVoteSchema, QuestVoteSchema, AssassinationTargetSchema,
  QUEST_CONFIGS, assignRoles, buildView,
} from './types.js'

export class Avalon implements Game {
  private seed: number
  private discussion?: Discussion

  constructor(options?: { seed?: number; discussion?: Discussion }) {
    this.seed = options?.seed ?? 0
    this.discussion = options?.discussion
  }

  play(playerIds: string[]): GameFlow {
    const self = this
    return (async function* () {
      const playerCount = playerIds.length
      const players = assignRoles(playerIds, self.seed)
      const questConfigs = QUEST_CONFIGS[playerCount]

      const state: AvalonState = {
        players,
        phase: 'team-proposal',
        questNumber: 0,
        questResults: [null, null, null, null, null],
        leaderIndex: self.seed % playerCount,
        proposalRejections: 0,
        proposedTeam: undefined,
      }

      let pendingEvents: AvalonEventData[] = [
        { type: 'game-start', players: playerIds, questConfigs },
      ]

      let successes = 0
      let fails = 0

      while (successes < 3 && fails < 3) {
        let teamApproved = false
        while (!teamApproved) {
          state.phase = 'team-proposal'
          state.proposedTeam = undefined
          const leader = players[state.leaderIndex]

          if (self.discussion) {
            const contexts = Object.fromEntries(
              players.map(p => [p.id, buildView(p, state)])
            )
            const result = yield* self.discussion.run(
              playerIds,
              contexts,
              { firstSpeakers: [leader.id] },
            )
            pendingEvents.push(...result.pendingEvents as AvalonEventData[])
          }

          const proposalAction: PlayerAction = yield {
            requests: [{ playerId: leader.id, view: buildView(leader, state), actionSchema: TeamProposalSchema }],
            events: pendingEvents,
          }
          pendingEvents = []

          let proposalParsed = TeamProposalSchema.safeParse(proposalAction.action)
          if (!proposalParsed.success) {
            pendingEvents.push({ type: 'validation-failed', playerId: leader.id, raw: proposalAction.action })
            proposalParsed = { success: true, data: { team: playerIds.slice(0, questConfigs[state.questNumber].teamSize) } } as any
          }
          state.proposedTeam = proposalParsed.data!.team

          const proposalEvent: AvalonEventData = {
            type: 'team-proposed', leader: leader.id, team: state.proposedTeam!, questNumber: state.questNumber,
          }

          state.phase = 'team-vote'
          const voteRequests: ActionRequest[] = players.map(p => ({
            playerId: p.id, view: buildView(p, state), actionSchema: TeamVoteSchema,
          }))

          const votes: Record<string, boolean> = {}
          const firstVote: PlayerAction = yield {
            requests: voteRequests,
            events: [proposalEvent],
          }
          let firstVoteParsed = TeamVoteSchema.safeParse(firstVote.action)
          if (!firstVoteParsed.success) {
            pendingEvents.push({ type: 'validation-failed', playerId: firstVote.playerId, raw: firstVote.action })
            firstVoteParsed = { success: true, data: { approve: false } } as any
          }
          votes[firstVote.playerId] = firstVoteParsed.data!.approve

          while (Object.keys(votes).length < playerCount) {
            const nextVote: PlayerAction = yield { requests: [], events: [] }
            let nextVoteParsed = TeamVoteSchema.safeParse(nextVote.action)
            if (!nextVoteParsed.success) {
              pendingEvents.push({ type: 'validation-failed', playerId: nextVote.playerId, raw: nextVote.action })
              nextVoteParsed = { success: true, data: { approve: false } } as any
            }
            votes[nextVote.playerId] = nextVoteParsed.data!.approve
          }

          const approvals = Object.values(votes).filter(v => v === true).length
          const approved = approvals > playerCount / 2

          const voteRecord: Record<string, 'approve' | 'reject'> = {}
          for (const [pid, v] of Object.entries(votes)) {
            voteRecord[pid] = v ? 'approve' : 'reject'
          }

          const voteResultEvent: AvalonEventData = {
            type: 'vote-result', votes: voteRecord, result: approved ? 'approved' : 'rejected',
          }

          if (approved) {
            teamApproved = true
            state.proposalRejections = 0
            pendingEvents = [voteResultEvent]
          } else {
            state.proposalRejections++
            if (state.proposalRejections >= 5) {
              const gameEndEvent: AvalonEventData = { type: 'game-end', reason: 'hammer', winner: 'evil' }
              return self.makeScores(players, 'evil', [voteResultEvent, gameEndEvent])
            }
            state.leaderIndex = (state.leaderIndex + 1) % playerCount
            pendingEvents = [voteResultEvent]
          }
        }

        state.phase = 'quest-vote'
        const team = players.filter(p => state.proposedTeam!.includes(p.id))
        const questRequests: ActionRequest[] = team.map(p => ({
          playerId: p.id, view: buildView(p, state), actionSchema: QuestVoteSchema,
        }))

        const questVotes: Record<string, boolean> = {}
        const firstQuest: PlayerAction = yield {
          requests: questRequests,
          events: pendingEvents,
        }
        pendingEvents = []
        let firstQuestParsed = QuestVoteSchema.safeParse(firstQuest.action)
        if (!firstQuestParsed.success) {
          pendingEvents.push({ type: 'validation-failed', playerId: firstQuest.playerId, raw: firstQuest.action })
          firstQuestParsed = { success: true, data: { success: true } } as any
        }
        questVotes[firstQuest.playerId] = firstQuestParsed.data!.success

        while (Object.keys(questVotes).length < team.length) {
          const nextQuest: PlayerAction = yield { requests: [], events: [] }
          let nextQuestParsed = QuestVoteSchema.safeParse(nextQuest.action)
          if (!nextQuestParsed.success) {
            pendingEvents.push({ type: 'validation-failed', playerId: nextQuest.playerId, raw: nextQuest.action })
            nextQuestParsed = { success: true, data: { success: true } } as any
          }
          questVotes[nextQuest.playerId] = nextQuestParsed.data!.success
        }

        const failCount = Object.values(questVotes).filter(v => v === false).length
        const questFailed = failCount >= questConfigs[state.questNumber].failsRequired
        state.questResults[state.questNumber] = questFailed ? 'fail' : 'success'

        if (questFailed) fails++
        else successes++

        const questResultEvent: AvalonEventData = {
          type: 'quest-result', questNumber: state.questNumber,
          result: questFailed ? 'fail' : 'success', failVotes: failCount,
        }

        state.questNumber++
        state.leaderIndex = (state.leaderIndex + 1) % playerCount
        state.proposalRejections = 0
        state.proposedTeam = undefined

        pendingEvents = [questResultEvent]
      }

      if (fails >= 3) {
        const gameEndEvent: AvalonEventData = { type: 'game-end', reason: 'three-fails', winner: 'evil' }
        return self.makeScores(players, 'evil', [...pendingEvents, gameEndEvent])
      }

      state.phase = 'assassination'
      const assassin = players.find(p => p.role === 'assassin')!
      const assassinAction: PlayerAction = yield {
        requests: [{ playerId: assassin.id, view: buildView(assassin, state), actionSchema: AssassinationTargetSchema }],
        events: pendingEvents,
      }
      pendingEvents = []

      let targetParsed = AssassinationTargetSchema.safeParse(assassinAction.action)
      if (!targetParsed.success) {
        pendingEvents.push({ type: 'validation-failed', playerId: assassin.id, raw: assassinAction.action })
        targetParsed = { success: true, data: { targetId: playerIds[0] } } as any
      }
      const targetId = targetParsed.data!.targetId
      const merlin = players.find(p => p.role === 'merlin')!
      const assassinationSuccess = targetId === merlin.id
      const winner = assassinationSuccess ? 'evil' : 'good'

      const finalEvents: AvalonEventData[] = [
        ...pendingEvents,
        { type: 'assassination-attempt', assassin: assassin.id, target: targetId, result: assassinationSuccess ? 'success' : 'fail' },
        { type: 'game-end', reason: assassinationSuccess ? 'assassination' : 'three-successes', winner },
      ]

      return self.makeScores(players, winner, finalEvents)
    })()
  }

  private makeScores(players: AvalonPlayer[], winner: 'good' | 'evil', finalEvents: unknown[] = []): GameOutcome {
    const scores: Record<string, number> = {}
    for (const p of players) {
      scores[p.id] = p.team === winner ? 1 : 0
    }
    return { scores, metadata: { finalEvents } }
  }
}
```

- [ ] **Step 3: Run Avalon tests**

Run: `pnpm test src/games/avalon/`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/games/avalon/types.ts src/games/avalon/avalon.ts
git commit -m "refactor: Avalon uses typed AvalonEventData, yields raw data"
```

---

### Task 7: Update AI Game, LLM Player, and remaining tests

**Files:**
- Modify: `src/games/ai_game/ai-game.ts`
- Modify: `src/players/llm-player.ts`
- Modify: `src/integration.test.ts`
- Modify: `src/core/game.test.ts`

- [ ] **Step 1: Update `src/games/ai_game/ai-game.ts`**

Remove `GameYieldedEvent` import. `processLLMResponse` returns `events: unknown[]`. Remove timestamp generation.

Remove this import line:
```typescript
import type { GameYieldedEvent } from '../../core/events.js'
```

Replace `processLLMResponse`:

```typescript
  private processLLMResponse(llmResponse: LLMGameResponse): { requests: ActionRequest[]; events: unknown[] } {
    const requests: ActionRequest[] = llmResponse.requests.map((req) => ({
      playerId: req.playerId,
      view: req.prompt,
      actionSchema: TextSchema,
    }))

    const events: unknown[] = llmResponse.events.map((evt) => {
      const data = parseEventData(evt.data)
      return { description: evt.description, ...((data && typeof data === 'object') ? data as Record<string, unknown> : { value: data }) }
    })

    return { requests, events }
  }
```

Also update the terminal return lines that reference `response.events` — the type of `events` in the destructured `{ requests, events }` from `processLLMResponse` is now `unknown[]`, so `metadata: { finalEvents: events }` still works.

- [ ] **Step 2: Rewrite `src/players/llm-player.ts`**

```typescript
import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Player } from '../core/player.js'
import type { ActionRequest } from '../core/types.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'

export interface LLMPlayerOptions {
  model?: string
  persona?: string
}

const BASE_PROMPT = `You are a board game player. You will receive a description of the current game state visible to you, and you must choose an action.

Always respond directly. Never refuse to act.`

const MEMORY_PROMPT = `You have a private memory that persists between turns. Use it to track observations, suspicions, and plans. Keep it concise — under 300 words. Focus on what matters most for your next decisions.`

const REASONING_PROMPT = `Think carefully before acting. Your reasoning is private and will not be shared with other players.`

function buildSystemPrompt(persona?: string): string {
  const parts = [BASE_PROMPT]
  if (persona) parts.push(persona)
  parts.push(MEMORY_PROMPT)
  parts.push(REASONING_PROMPT)
  return parts.join('\n\n')
}

export class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  private readonly model: string
  private readonly persona?: string
  private memory = ''
  private lastReasoning_?: string
  private privateListeners: ((data: unknown) => void)[] = []

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.model = options?.model ?? DEFAULT_MODEL
    this.persona = options?.persona
  }

  getMemory(): string { return this.memory }
  getLastReasoning(): string | undefined { return this.lastReasoning_ }

  onEvent(listener: (data: unknown) => void): void {
    this.privateListeners.push(listener)
  }

  private emitPrivate(data: unknown): void {
    for (const fn of this.privateListeners) fn(data)
  }

  async act(request: ActionRequest): Promise<unknown> {
    const systemPrompt = buildSystemPrompt(this.persona)
    const view = typeof request.view === 'string' ? request.view : JSON.stringify(request.view, null, 2)

    const parts = ['Current game state (your view):\n\n' + view]
    if (this.memory) {
      parts.push('Your memory from previous turns:\n\n' + this.memory)
    }
    parts.push('Choose your action.')
    const userMessage = parts.join('\n\n')

    const wrappedSchema = z.object({
      reasoning: z.string().describe('Your private reasoning about the current situation'),
      memory: z.string().describe('Updated memory — keep concise, under 300 words'),
      action: request.actionSchema as z.ZodTypeAny,
    })

    const result = await generateText({
      model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      tools: {
        submit_action: tool({
          description: 'Submit your reasoning, updated memory, and chosen action',
          inputSchema: wrappedSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'submit_action' },
    })

    const call = result.toolCalls[0]
    if (!call) throw new Error('LLM returned no tool call')

    const response = call.input as { reasoning: string; memory: string; action: unknown }
    this.memory = response.memory
    this.lastReasoning_ = response.reasoning
    this.emitPrivate({
      reasoning: response.reasoning,
      memory: response.memory,
      action: response.action,
      lastSeenSeq: request.lastSeenSeq,
    })

    return response.action
  }
}
```

- [ ] **Step 3: Rewrite `src/core/game.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { Game, GameFlow } from './game.js'
import type { GameResponse, GameOutcome } from './types.js'

class MockGame implements Game {
  play(playerIds: string[]): GameFlow {
    return (async function* () {
      const { action } = yield {
        requests: [{ playerId: playerIds[0], view: {}, actionSchema: z.unknown() }],
        events: [{ type: 'started' }],
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
```

- [ ] **Step 4: Rewrite `src/integration.test.ts`**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { z } from 'zod'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import type { Game, GameFlow } from './core/game.js'
import type { Player } from './core/player.js'
import type { ActionRequest } from './core/types.js'
import { Engine } from './core/engine.js'
import { Recorder } from './core/recorder.js'

const GuessSchema = z.number().int().min(1).max(10)

class GuessingGame implements Game {
  constructor(private readonly rounds: number = 3) {}

  play(playerIds: string[]): GameFlow {
    const players = playerIds
    const maxRounds = this.rounds
    const targets = [7, 3, 9]
    const wins: Record<string, number> = {}
    players.forEach(id => { wins[id] = 0 })

    return (async function* () {
      let pendingEvents: unknown[] = [{ type: 'start', players }]

      for (let round = 0; round < maxRounds; round++) {
        const guesses: Record<string, number> = {}
        const first = yield {
          requests: players.map(id => ({
            playerId: id,
            view: { round: round + 1, maxRounds },
            actionSchema: GuessSchema,
          })),
          events: pendingEvents,
        }
        pendingEvents = []
        guesses[first.playerId] = first.action as number

        while (Object.keys(guesses).length < players.length) {
          const { playerId, action } = yield { requests: [], events: [] }
          guesses[playerId] = action as number
        }

        const target = targets[round]
        let bestDist = Infinity
        let winner = ''
        for (const [id, guess] of Object.entries(guesses)) {
          const dist = Math.abs(guess - target)
          if (dist < bestDist) { bestDist = dist; winner = id }
        }
        wins[winner]++

        pendingEvents = [{ type: 'round-result', round: round + 1, target, guesses, winner }]
      }

      return { scores: { ...wins } }
    })()
  }
}

class FixedPlayer implements Player {
  constructor(
    readonly id: string,
    readonly name: string,
    private answers: number[],
  ) {}

  private idx = 0

  async act(_request: ActionRequest): Promise<unknown> {
    return this.answers[this.idx++]
  }
}

const LOG_FILE = '/tmp/boardgame-integration-test.jsonl'

afterEach(() => {
  if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE)
})

describe('integration: full game loop', () => {
  it('runs a 3-round guessing game end-to-end', async () => {
    const game = new GuessingGame()
    const recorder = new Recorder('test-game-1', LOG_FILE)

    const players = new Map<string, Player>([
      ['alice', new FixedPlayer('alice', 'Alice', [7, 5, 8])],
      ['bob', new FixedPlayer('bob', 'Bob', [4, 3, 10])],
    ])

    const engine = new Engine('test-game-1')
    engine.onEvent((e) => recorder.record(e))
    const outcome = await engine.run(game, players)
    recorder.flush()

    expect(outcome).not.toBeNull()
    expect(outcome!.scores).toHaveProperty('alice')
    expect(outcome!.scores).toHaveProperty('bob')
    expect(outcome!.scores.alice + outcome!.scores.bob).toBe(3)

    expect(outcome!.scores.alice).toBe(2)
    expect(outcome!.scores.bob).toBe(1)

    const lines = readFileSync(LOG_FILE, 'utf-8').trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(5)

    for (const line of lines) {
      const entry = JSON.parse(line)
      expect(entry.gameId).toBe('test-game-1')
    }
  })
})
```

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 6: Run typecheck**

Run: `pnpm run typecheck`
Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add src/games/ai_game/ai-game.ts src/players/llm-player.ts src/integration.test.ts src/core/game.test.ts
git commit -m "refactor: AI game, LLM player, and tests use raw event data"
```

---

### Task 8: Update docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/implementing-a-game.md`
- Modify: `docs/game-loop.md`

- [ ] **Step 1: Read current docs**

Read `docs/implementing-a-game.md` and `docs/game-loop.md` to find sections referencing `GameYieldedEvent`, `source: 'game'`, `timestamp`, `PlayerPrivateEvent`, or Zod event schemas.

- [ ] **Step 2: Update `docs/architecture.md`**

Key changes:
- Data flow diagram: games yield `events: unknown[]`, engine stamps into `GameSourceEvent`/`PlayerSourceEvent`
- Game section: remove `GameYieldedEvent` from exports table. Note `GameResponse.events` is `unknown[]`.
- Player section: `onEvent` callback is `(data: unknown) => void`, no `PlayerPrivateEvent` framework type
- Engine section: stamps `seq`, `gameId`, `timestamp` on all events
- Avalon section: note `AvalonEventData` union for compile-time event typing
- Add note: no Zod schemas for events — interfaces only

- [ ] **Step 3: Update `docs/implementing-a-game.md`**

- Event helper example: return raw data, not `{ source: 'game', ... }`
- Note that engine handles stamping
- Show per-game typed event pattern with `AvalonEventData` as example

- [ ] **Step 4: Update `docs/game-loop.md`**

- Update event flow description
- Game yields raw data in `events: unknown[]`
- Engine wraps into stamped `GameEvent`

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: update for new event type system"
```
