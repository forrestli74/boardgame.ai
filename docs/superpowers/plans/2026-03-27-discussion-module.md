# Discussion Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modular discussion system to core with `BroadcastDiscussion` implementation, and integrate it into Avalon as an optional feature.

**Architecture:** `Discussion` interface in core, `BroadcastDiscussion` as first implementation. Games delegate via `yield*`. Events emitted per round as discussion happens. Avalon takes optional `Discussion` in constructor — non-breaking change.

**Tech Stack:** TypeScript, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-discussion-design.md`

---

### Task 1: Discussion Interface and Types

**Files:**
- Create: `src/core/discussion.ts`
- Create: `src/core/discussion.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/discussion.test.ts
import { describe, it, expect } from 'vitest'
import { DiscussionStatementSchema } from './discussion.js'

describe('Discussion types', () => {
  it('DiscussionStatementSchema validates statement', () => {
    expect(DiscussionStatementSchema.safeParse({ statement: 'I think alice is evil' }).success).toBe(true)
    expect(DiscussionStatementSchema.safeParse({ statement: '' }).success).toBe(true) // pass
    expect(DiscussionStatementSchema.safeParse({}).success).toBe(false)
    expect(DiscussionStatementSchema.safeParse({ statement: 123 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/discussion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/core/discussion.ts
import { z } from 'zod'
import type { GameResponse } from './types.js'
import type { PlayerAction } from './game.js'

// --- Types ---

export interface DiscussionStatement {
  playerId: string
  content: string
  lastSeen?: { playerId: string; content: string }
}

export interface DiscussionResult {
  statements: DiscussionStatement[]
}

export interface DiscussionOptions {
  firstSpeakers?: string[]
}

export interface Discussion {
  run(
    gameId: string,
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction>
}

// --- Action Schema ---

export const DiscussionStatementSchema = z.object({
  statement: z.string(),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/discussion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/discussion.ts src/core/discussion.test.ts
git commit -m "feat: add Discussion interface and types"
```

---

### Task 2: BroadcastDiscussion Implementation

**Files:**
- Modify: `src/core/discussion.ts` (add `BroadcastDiscussion`)
- Modify: `src/core/discussion.test.ts` (add tests)

- [ ] **Step 1: Write failing test — single round, all players speak**

```typescript
// Add to src/core/discussion.test.ts
import { BroadcastDiscussion, type DiscussionStatement } from './discussion.js'
import { Engine } from './engine.js'
import { scriptedPlayers } from '../test-utils/scripted-players.js'
import type { Game, GameFlow } from './game.js'
import type { GameConfig, GameOutcome } from './types.js'
import type { GameEvent } from './events.js'
import { z } from 'zod'

// Helper: a game that just runs a discussion and returns
function discussionGame(discussion: BroadcastDiscussion, playerIds: string[]): Game {
  return {
    optionsSchema: z.object({}),
    play(config: GameConfig): GameFlow {
      return (async function* () {
        const contexts = Object.fromEntries(playerIds.map(id => [id, { info: 'test' }]))
        const result = yield* discussion.run(config.gameId, playerIds, contexts)
        return { scores: {}, metadata: { discussion: result } }
      })()
    },
  }
}

describe('BroadcastDiscussion', () => {
  it('collects statements from all players in one round', async () => {
    const discussion = new BroadcastDiscussion(1)
    const players = scriptedPlayers([
      ['alice', { statement: 'I am good' }],
      ['bob', { statement: 'Trust me' }],
    ])

    const engine = new Engine()
    const events: GameEvent[] = []
    engine.onEvent(e => events.push(e))

    const outcome = await engine.run(
      discussionGame(discussion, ['alice', 'bob']),
      players,
      { gameId: 'test', seed: 1, players: [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }] },
    )

    const result = outcome!.metadata!.discussion as { statements: DiscussionStatement[] }
    expect(result.statements).toHaveLength(2)
    expect(result.statements[0].content).toBe('I am good')
    expect(result.statements[1].content).toBe('Trust me')

    // Round 1 speakers have no lastSeen
    expect(result.statements[0].lastSeen).toBeUndefined()
    expect(result.statements[1].lastSeen).toBeUndefined()
  })

  it('emits discussion-round event per round', async () => {
    const discussion = new BroadcastDiscussion(1)
    const players = scriptedPlayers([
      ['alice', { statement: 'hello' }],
      ['bob', { statement: 'hi' }],
    ])

    const engine = new Engine()
    const events: GameEvent[] = []
    engine.onEvent(e => events.push(e))

    await engine.run(
      discussionGame(discussion, ['alice', 'bob']),
      players,
      { gameId: 'test', seed: 1, players: [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }] },
    )

    const discussionEvents = events.filter(e => e.source === 'game' && (e.data as any).type === 'discussion-round')
    expect(discussionEvents).toHaveLength(1)
    expect((discussionEvents[0].data as any).statements).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/discussion.test.ts`
Expected: FAIL — `BroadcastDiscussion` not exported

- [ ] **Step 3: Write implementation**

Add to `src/core/discussion.ts`:

```typescript
import type { GameEvent } from './events.js'
import type { ActionRequest } from './types.js'

function event(gameId: string, data: unknown): GameEvent {
  return { source: 'game', gameId, data, timestamp: new Date().toISOString() }
}

export class BroadcastDiscussion implements Discussion {
  constructor(private maxRounds: number = 3) {}

  async *run(
    gameId: string,
    playerIds: string[],
    contexts: Record<string, unknown>,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction> {
    const allStatements: DiscussionStatement[] = []
    const previousStatements: { playerId: string; content: string }[] = []
    let activePlayers = [...playerIds]

    // Reorder: firstSpeakers go first
    if (options?.firstSpeakers) {
      const first = options.firstSpeakers.filter(id => activePlayers.includes(id))
      const rest = activePlayers.filter(id => !first.includes(id))
      activePlayers = [...first, ...rest]
    }

    for (let round = 0; round < this.maxRounds; round++) {
      if (activePlayers.length === 0) break

      // Determine lastSeen for this round
      const lastSeen = previousStatements.length > 0
        ? { playerId: previousStatements[previousStatements.length - 1].playerId, content: previousStatements[previousStatements.length - 1].content }
        : undefined

      // Build requests for all active players
      const requests: ActionRequest[] = activePlayers.map(id => ({
        playerId: id,
        view: {
          context: contexts[id],
          round,
          maxRounds: this.maxRounds,
          previousStatements: [...previousStatements],
        },
        actionSchema: DiscussionStatementSchema,
      }))

      // Collect all statements (parallel)
      const roundStatements: { playerId: string; content: string }[] = []
      const firstAction: PlayerAction = yield { requests, events: [] }
      roundStatements.push({ playerId: firstAction.playerId, content: (firstAction.action as { statement: string }).statement })

      while (roundStatements.length < activePlayers.length) {
        const action: PlayerAction = yield { requests: [], events: [] }
        roundStatements.push({ playerId: action.playerId, content: (action.action as { statement: string }).statement })
      }

      // Process statements
      const passedPlayers: string[] = []
      for (const s of roundStatements) {
        if (s.content === '') {
          passedPlayers.push(s.playerId)
        } else {
          allStatements.push({ playerId: s.playerId, content: s.content, lastSeen })
          previousStatements.push({ playerId: s.playerId, content: s.content })
        }
      }

      // Emit discussion-round event
      yield {
        requests: [],
        events: [event(gameId, {
          type: 'discussion-round',
          round,
          statements: roundStatements.filter(s => s.content !== ''),
        })],
      }

      // Remove passed players from active
      activePlayers = activePlayers.filter(id => !passedPlayers.includes(id))

      // Early exit: all passed
      if (activePlayers.length === 0) break
    }

    return { statements: allStatements }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/discussion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/discussion.ts src/core/discussion.test.ts
git commit -m "feat: implement BroadcastDiscussion with parallel collection"
```

---

### Task 3: BroadcastDiscussion — Multi-round, Passing, and Early Exit

**Files:**
- Modify: `src/core/discussion.test.ts`

- [ ] **Step 1: Add multi-round test**

```typescript
it('runs multiple rounds — players see previous statements', async () => {
  const discussion = new BroadcastDiscussion(2)
  const players = scriptedPlayers([
    ['alice', { statement: 'Round 1 from alice' }],
    ['bob', { statement: 'Round 1 from bob' }],
    ['alice', { statement: 'Round 2 from alice' }],
    ['bob', { statement: 'Round 2 from bob' }],
  ])

  const engine = new Engine()
  const outcome = await engine.run(
    discussionGame(discussion, ['alice', 'bob']),
    players,
    { gameId: 'test', seed: 1, players: [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }] },
  )

  const result = outcome!.metadata!.discussion as { statements: DiscussionStatement[] }
  expect(result.statements).toHaveLength(4)
  // Round 2 statements should have lastSeen pointing to last statement of round 1
  expect(result.statements[2].lastSeen).toEqual({ playerId: 'bob', content: 'Round 1 from bob' })
  expect(result.statements[3].lastSeen).toEqual({ playerId: 'bob', content: 'Round 1 from bob' })
})
```

- [ ] **Step 2: Add passing test**

```typescript
it('empty statement = pass, player drops out of subsequent rounds', async () => {
  const discussion = new BroadcastDiscussion(3)
  const players = scriptedPlayers([
    ['alice', { statement: 'hello' }],
    ['bob', { statement: '' }],          // bob passes round 1
    ['alice', { statement: 'just me now' }],
    // bob is not asked in round 2
    ['alice', { statement: 'still me' }],
    // bob is not asked in round 3
  ])

  const engine = new Engine()
  const events: GameEvent[] = []
  engine.onEvent(e => events.push(e))

  const outcome = await engine.run(
    discussionGame(discussion, ['alice', 'bob']),
    players,
    { gameId: 'test', seed: 1, players: [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }] },
  )

  const result = outcome!.metadata!.discussion as { statements: DiscussionStatement[] }
  // Only alice's 3 statements (bob passed)
  expect(result.statements).toHaveLength(3)
  expect(result.statements.every(s => s.playerId === 'alice')).toBe(true)
})
```

- [ ] **Step 3: Add early exit test**

```typescript
it('ends early when all players pass', async () => {
  const discussion = new BroadcastDiscussion(5)
  const players = scriptedPlayers([
    ['alice', { statement: 'one thing' }],
    ['bob', { statement: 'me too' }],
    ['alice', { statement: '' }],  // both pass round 2
    ['bob', { statement: '' }],
  ])

  const engine = new Engine()
  const events: GameEvent[] = []
  engine.onEvent(e => events.push(e))

  const outcome = await engine.run(
    discussionGame(discussion, ['alice', 'bob']),
    players,
    { gameId: 'test', seed: 1, players: [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }] },
  )

  const result = outcome!.metadata!.discussion as { statements: DiscussionStatement[] }
  expect(result.statements).toHaveLength(2) // only round 1 statements

  // Only 2 discussion-round events (round 1 with statements, round 2 with all passes)
  const discussionEvents = events.filter(e => e.source === 'game' && (e.data as any).type === 'discussion-round')
  expect(discussionEvents).toHaveLength(2)
})
```

- [ ] **Step 4: Add firstSpeakers ordering test**

```typescript
it('firstSpeakers are placed first in request array', async () => {
  const discussion = new BroadcastDiscussion(1)
  let capturedRequestOrder: string[] = []

  // Custom game that captures request order
  const game: Game = {
    optionsSchema: z.object({}),
    play(config: GameConfig): GameFlow {
      return (async function* () {
        const contexts = Object.fromEntries(['alice', 'bob', 'charlie'].map(id => [id, {}]))
        const gen = discussion.run(config.gameId, ['alice', 'bob', 'charlie'], contexts, { firstSpeakers: ['charlie'] })

        let res = await gen.next()
        while (!res.done) {
          if (res.value.requests.length > 0 && capturedRequestOrder.length === 0) {
            capturedRequestOrder = res.value.requests.map(r => r.playerId)
          }
          const action = yield res.value
          res = await gen.next(action)
        }
        return { scores: {}, metadata: { discussion: res.value } }
      })()
    },
  }

  const players = scriptedPlayers([
    ['alice', { statement: 'hi' }],
    ['bob', { statement: 'hey' }],
    ['charlie', { statement: 'yo' }],
  ])

  const engine = new Engine()
  await engine.run(game, players, {
    gameId: 'test', seed: 1,
    players: [{ id: 'alice', name: 'alice' }, { id: 'bob', name: 'bob' }, { id: 'charlie', name: 'charlie' }],
  })

  expect(capturedRequestOrder[0]).toBe('charlie')
})
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/core/discussion.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/discussion.test.ts
git commit -m "test: add multi-round, passing, early exit, and firstSpeakers tests"
```

---

### Task 4: Avalon Discussion Integration

**Files:**
- Modify: `src/games/avalon/avalon.ts` (add optional discussion to constructor + flow)
- Modify: `src/games/avalon/avalon.test.ts` (add discussion integration test)

- [ ] **Step 1: Write failing test**

```typescript
// Add to src/games/avalon/avalon.test.ts
import { BroadcastDiscussion } from '../../core/discussion.js'
import type { GameEvent } from '../../core/events.js'

it('runs discussion before each team proposal when configured', async () => {
  const config = makeConfig(5)
  // seed=42, 5 players: leaderIndex=2 (charlie)
  // Quest 1 team size: 2
  const players5 = ['alice', 'bob', 'charlie', 'diana', 'eve']

  const actions: [string, unknown][] = [
    // Discussion before quest 1 proposal (all 5 speak)
    ['alice', { statement: 'I trust charlie' }],
    ['bob', { statement: 'Lets go team' }],
    ['charlie', { statement: 'I will pick a good team' }],
    ['diana', { statement: 'sounds good' }],
    ['eve', { statement: 'agree' }],

    // Quest 1: charlie proposes, all approve, quest succeeds
    ['charlie', { team: ['alice', 'charlie'] }],
    ...allApprove(players5),
    ['alice', { success: true }],
    ['charlie', { success: true }],

    // Discussion before quest 2 proposal (all 5 speak)
    ['alice', { statement: 'good start' }],
    ['bob', { statement: '' }],       // pass
    ['charlie', { statement: '' }],   // pass
    ['diana', { statement: 'keep going' }],
    ['eve', { statement: '' }],       // pass

    // Quest 2: diana proposes, all approve, quest succeeds
    ['diana', { team: ['alice', 'diana', 'charlie'] }],
    ...allApprove(players5),
    ['alice', { success: true }],
    ['diana', { success: true }],   // evil but votes success
    ['charlie', { success: true }],

    // Discussion before quest 3 proposal
    ['alice', { statement: '' }],
    ['bob', { statement: '' }],
    ['charlie', { statement: '' }],
    ['diana', { statement: '' }],
    ['eve', { statement: '' }],     // all pass round 1 → early exit

    // Quest 3: eve proposes, all approve, quest succeeds
    ['eve', { team: ['alice', 'charlie'] }],
    ...allApprove(players5),
    ['alice', { success: true }],
    ['charlie', { success: true }],

    // Assassination: bob (assassin) guesses wrong
    ['bob', { targetId: 'charlie' }],
  ]

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  const events: GameEvent[] = []
  engine.onEvent(e => events.push(e))

  const outcome = await engine.run(
    new Avalon(new BroadcastDiscussion(1)),
    players,
    config,
  )

  // Game completed — good wins
  expect(outcome).not.toBeNull()
  expect(outcome!.scores['alice']).toBe(1)

  // Discussion events were emitted
  const discussionEvents = events.filter(e => e.source === 'game' && (e.data as any).type === 'discussion-round')
  expect(discussionEvents.length).toBeGreaterThanOrEqual(3) // one per quest proposal
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/avalon/avalon.test.ts`
Expected: FAIL — `Avalon` constructor doesn't accept arguments

- [ ] **Step 3: Modify Avalon to accept optional Discussion**

In `src/games/avalon/avalon.ts`, change the class:

```typescript
import type { Discussion } from '../../core/discussion.js'

export class Avalon implements Game {
  readonly optionsSchema = AvalonOptionsSchema

  constructor(private discussion?: Discussion) {}

  play(config: GameConfig): GameFlow {
    const self = this
    return (async function* () {
      // ... existing setup code ...

      while (successes < 3 && fails < 3) {
        // --- Team Proposal + Vote loop ---
        let teamApproved = false
        while (!teamApproved) {
          state.phase = 'team-proposal'
          state.proposedTeam = undefined
          const leader = players[state.leaderIndex]

          // --- Discussion phase (if configured) ---
          if (self.discussion) {
            const contexts = Object.fromEntries(
              players.map(p => [p.id, buildView(p, state)])
            )
            const result = yield* self.discussion.run(
              gameId,
              playerIds,
              contexts,
              { firstSpeakers: [leader.id] },
            )
            // Events already emitted by discussion.run()
            // result.statements available if needed
          }

          // Yield team-proposal request, carrying forward any pending events
          const proposalAction: PlayerAction = yield {
            // ... rest unchanged ...
```

The only change is:
1. Add `constructor(private discussion?: Discussion) {}`
2. Add the discussion block before the proposal yield inside the proposal loop
3. Import `Discussion` type

- [ ] **Step 4: Run all Avalon tests to verify nothing broke + new test passes**

Run: `npx vitest run src/games/avalon/avalon.test.ts`
Expected: ALL PASS (existing tests unaffected since they pass no discussion)

- [ ] **Step 5: Commit**

```bash
git add src/games/avalon/avalon.ts src/games/avalon/avalon.test.ts
git commit -m "feat: integrate optional discussion into Avalon before team proposals"
```

---

### Task 5: Update Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/requirements.md`

- [ ] **Step 1: Update architecture.md**

Add after the Engine section:

```markdown
## Discussion (`src/core/discussion.ts`)

Modular discussion system. Games delegate discussion via `yield*` to a `Discussion` implementation. Events emitted per round during discussion.

- **`Discussion`** — Interface: `run(gameId, playerIds, contexts, options?)` returns `AsyncGenerator`. Per-player contexts support hidden information.
- **`BroadcastDiscussion`** — Multi-round parallel broadcast. Players speak or pass each round. Configurable `maxRounds`. Early exit when all pass.
- **`DiscussionStatement`** — `{ playerId, content, lastSeen? }`. `lastSeen` is logging metadata, not sent to players.
```

- [ ] **Step 2: Update requirements.md — mark DISC items complete**

Change DISC-01 and DISC-02 from `- [ ]` to `- [x]`.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/requirements.md
git commit -m "docs: add Discussion module to architecture, mark DISC-01/02 complete"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-27-discussion-module.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
