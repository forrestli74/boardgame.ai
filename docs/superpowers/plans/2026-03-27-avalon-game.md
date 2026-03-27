# Avalon Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Avalon as a native `Game` using the generator pattern — deterministic, testable with scripted players, experienced role config, 5-10 players.

**Architecture:** Single `Avalon` class implementing `Game` with `AsyncGenerator`-based `play()`. Types, schemas, lookup tables, and `buildView()` in `types.ts`. Reusable `scriptedPlayers` test helper. TDD throughout.

**Tech Stack:** TypeScript, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-avalon-game-design.md`

**Rules reference:** `docs/avalon-rules.md`

---

### Task 1: Scripted Players Test Helper

**Files:**
- Create: `src/test-utils/scripted-players.ts`
- Create: `src/test-utils/scripted-players.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test-utils/scripted-players.test.ts
import { describe, it, expect } from 'vitest'
import { scriptedPlayers } from './scripted-players.js'

describe('scriptedPlayers', () => {
  it('splits actions into per-player queues', async () => {
    const players = scriptedPlayers([
      ['alice', 'move-1'],
      ['bob', 'move-a'],
      ['alice', 'move-2'],
      ['bob', 'move-b'],
    ])

    expect(players.size).toBe(2)
    const alice = players.get('alice')!
    const bob = players.get('bob')!

    expect(await alice.act({ playerId: 'alice', view: {}, actionSchema: {} as any })).toBe('move-1')
    expect(await bob.act({ playerId: 'bob', view: {}, actionSchema: {} as any })).toBe('move-a')
    expect(await alice.act({ playerId: 'alice', view: {}, actionSchema: {} as any })).toBe('move-2')
    expect(await bob.act({ playerId: 'bob', view: {}, actionSchema: {} as any })).toBe('move-b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test-utils/scripted-players.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/test-utils/scripted-players.ts
import type { Player } from '../core/player.js'

export function scriptedPlayers(actions: [string, unknown][]): Map<string, Player> {
  const queues = new Map<string, unknown[]>()
  for (const [id, action] of actions) {
    if (!queues.has(id)) queues.set(id, [])
    queues.get(id)!.push(action)
  }
  return new Map(
    [...queues.keys()].map(id => [id, {
      id,
      name: id,
      act: async () => queues.get(id)!.shift(),
    }])
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test-utils/scripted-players.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/test-utils/scripted-players.ts src/test-utils/scripted-players.test.ts
git commit -m "feat: add scriptedPlayers test helper for deterministic game tests"
```

---

### Task 2: Avalon Types, Schemas, and Lookup Tables

**Files:**
- Create: `src/games/avalon/types.ts`
- Create: `src/games/avalon/types.test.ts`

- [ ] **Step 1: Write failing tests for lookup tables**

```typescript
// src/games/avalon/types.test.ts
import { describe, it, expect } from 'vitest'
import {
  TEAM_COUNTS, QUEST_CONFIGS, EXPERIENCED_ROLES,
  TeamProposalSchema, TeamVoteSchema, QuestVoteSchema, AssassinationTargetSchema,
  type Role, type Team,
} from './types.js'

describe('Avalon lookup tables', () => {
  it('TEAM_COUNTS has correct good/evil counts for 5-10 players', () => {
    expect(TEAM_COUNTS[5]).toEqual({ good: 3, evil: 2 })
    expect(TEAM_COUNTS[6]).toEqual({ good: 4, evil: 2 })
    expect(TEAM_COUNTS[7]).toEqual({ good: 4, evil: 3 })
    expect(TEAM_COUNTS[8]).toEqual({ good: 5, evil: 3 })
    expect(TEAM_COUNTS[9]).toEqual({ good: 6, evil: 3 })
    expect(TEAM_COUNTS[10]).toEqual({ good: 6, evil: 4 })
  })

  it('QUEST_CONFIGS has 5 quests per player count', () => {
    for (let n = 5; n <= 10; n++) {
      expect(QUEST_CONFIGS[n]).toHaveLength(5)
      for (const q of QUEST_CONFIGS[n]) {
        expect(q.teamSize).toBeGreaterThanOrEqual(2)
        expect(q.failsRequired).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('4th quest requires 2 fails for 7+ players', () => {
    expect(QUEST_CONFIGS[5][3].failsRequired).toBe(1)
    expect(QUEST_CONFIGS[6][3].failsRequired).toBe(1)
    expect(QUEST_CONFIGS[7][3].failsRequired).toBe(2)
    expect(QUEST_CONFIGS[8][3].failsRequired).toBe(2)
    expect(QUEST_CONFIGS[9][3].failsRequired).toBe(2)
    expect(QUEST_CONFIGS[10][3].failsRequired).toBe(2)
  })

  it('EXPERIENCED_ROLES has correct roles for each player count', () => {
    const count = (roles: Role[], role: Role) => roles.filter(r => r === role).length

    // 5 players: Merlin, Percival, Servant | Morgana, Assassin
    const r5 = EXPERIENCED_ROLES[5]
    expect(r5).toHaveLength(5)
    expect(count(r5, 'merlin')).toBe(1)
    expect(count(r5, 'percival')).toBe(1)
    expect(count(r5, 'loyal-servant')).toBe(1)
    expect(count(r5, 'morgana')).toBe(1)
    expect(count(r5, 'assassin')).toBe(1)

    // 7 players: adds Mordred
    const r7 = EXPERIENCED_ROLES[7]
    expect(r7).toHaveLength(7)
    expect(count(r7, 'mordred')).toBe(1)

    // 10 players: adds Oberon
    const r10 = EXPERIENCED_ROLES[10]
    expect(r10).toHaveLength(10)
    expect(count(r10, 'oberon')).toBe(1)
  })
})

describe('Avalon action schemas', () => {
  it('TeamProposalSchema validates team array', () => {
    expect(TeamProposalSchema.safeParse({ team: ['a', 'b'] }).success).toBe(true)
    expect(TeamProposalSchema.safeParse({ team: [] }).success).toBe(true)
    expect(TeamProposalSchema.safeParse({ team: 'a' }).success).toBe(false)
    expect(TeamProposalSchema.safeParse({}).success).toBe(false)
  })

  it('TeamVoteSchema validates approve/reject', () => {
    expect(TeamVoteSchema.safeParse({ vote: 'approve' }).success).toBe(true)
    expect(TeamVoteSchema.safeParse({ vote: 'reject' }).success).toBe(true)
    expect(TeamVoteSchema.safeParse({ vote: 'maybe' }).success).toBe(false)
  })

  it('QuestVoteSchema validates success/fail', () => {
    expect(QuestVoteSchema.safeParse({ questVote: 'success' }).success).toBe(true)
    expect(QuestVoteSchema.safeParse({ questVote: 'fail' }).success).toBe(true)
    expect(QuestVoteSchema.safeParse({ questVote: 'abstain' }).success).toBe(false)
  })

  it('AssassinationTargetSchema validates target', () => {
    expect(AssassinationTargetSchema.safeParse({ target: 'alice' }).success).toBe(true)
    expect(AssassinationTargetSchema.safeParse({}).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/avalon/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/games/avalon/types.ts
import { z } from 'zod'

// --- Teams & Roles ---

export type Team = 'good' | 'evil'

export type Role =
  | 'merlin' | 'percival' | 'loyal-servant'
  | 'assassin' | 'morgana' | 'mordred' | 'oberon' | 'minion'

export type Phase = 'team-proposal' | 'team-vote' | 'quest' | 'assassination' | 'game-over'

export const ROLE_TEAM: Record<Role, Team> = {
  'merlin': 'good',
  'percival': 'good',
  'loyal-servant': 'good',
  'assassin': 'evil',
  'morgana': 'evil',
  'mordred': 'evil',
  'oberon': 'evil',
  'minion': 'evil',
}

// --- Player & View ---

export interface AvalonPlayer {
  id: string
  role: Role
  team: Team
}

export interface PlayerView {
  yourId: string
  yourRole: Role
  yourTeam: Team
  knownPlayers: { id: string; appearance: 'evil' | 'merlin-or-morgana' }[]
  phase: Phase
  questNumber: number
  questResults: ('success' | 'fail' | null)[]
  leader: string
  proposalRejections: number
  proposedTeam?: string[]
  players: string[]
}

// --- Quest Config ---

export interface QuestConfig {
  teamSize: number
  failsRequired: number
}

// --- Lookup Tables ---

export const TEAM_COUNTS: Record<number, { good: number; evil: number }> = {
  5:  { good: 3, evil: 2 },
  6:  { good: 4, evil: 2 },
  7:  { good: 4, evil: 3 },
  8:  { good: 5, evil: 3 },
  9:  { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
}

const q = (teamSize: number, failsRequired = 1): QuestConfig => ({ teamSize, failsRequired })

export const QUEST_CONFIGS: Record<number, QuestConfig[]> = {
  5:  [q(2), q(3), q(2), q(3),    q(3)],
  6:  [q(2), q(3), q(4), q(3),    q(4)],
  7:  [q(2), q(3), q(3), q(4, 2), q(4)],
  8:  [q(3), q(4), q(4), q(5, 2), q(5)],
  9:  [q(3), q(4), q(4), q(5, 2), q(5)],
  10: [q(3), q(4), q(4), q(5, 2), q(5)],
}

export const EXPERIENCED_ROLES: Record<number, Role[]> = {
  5:  ['merlin', 'percival', 'loyal-servant', 'morgana', 'assassin'],
  6:  ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'morgana', 'assassin'],
  7:  ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'assassin'],
  8:  ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'assassin'],
  9:  ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'assassin'],
  10: ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'oberon', 'assassin'],
}

// --- Action Schemas ---

export const TeamProposalSchema = z.object({
  team: z.array(z.string()),
})
export type TeamProposal = z.infer<typeof TeamProposalSchema>

export const TeamVoteSchema = z.object({
  vote: z.enum(['approve', 'reject']),
})
export type TeamVote = z.infer<typeof TeamVoteSchema>

export const QuestVoteSchema = z.object({
  questVote: z.enum(['success', 'fail']),
})
export type QuestVote = z.infer<typeof QuestVoteSchema>

export const AssassinationTargetSchema = z.object({
  target: z.string(),
})
export type AssassinationTarget = z.infer<typeof AssassinationTargetSchema>

export const AvalonOptionsSchema = z.object({})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/avalon/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/avalon/types.ts src/games/avalon/types.test.ts
git commit -m "feat: add Avalon types, Zod schemas, and lookup tables"
```

---

### Task 3: Role Assignment

**Files:**
- Modify: `src/games/avalon/types.ts` (add `assignRoles`)
- Modify: `src/games/avalon/types.test.ts` (add role assignment tests)

- [ ] **Step 1: Write failing tests**

```typescript
// Add to src/games/avalon/types.test.ts
import { assignRoles, ROLE_TEAM } from './types.js'

describe('assignRoles', () => {
  it('assigns correct number of roles for 5 players', () => {
    const players = assignRoles(['a', 'b', 'c', 'd', 'e'], 42)
    expect(players).toHaveLength(5)
    const good = players.filter(p => p.team === 'good')
    const evil = players.filter(p => p.team === 'evil')
    expect(good).toHaveLength(3)
    expect(evil).toHaveLength(2)
  })

  it('assigns correct roles for 7 players (includes Mordred)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const players = assignRoles(ids, 42)
    const roles = players.map(p => p.role)
    expect(roles).toContain('mordred')
    expect(roles).toContain('merlin')
    expect(roles).toContain('percival')
    expect(roles).toContain('morgana')
    expect(roles).toContain('assassin')
  })

  it('assigns correct roles for 10 players (includes Oberon)', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`)
    const players = assignRoles(ids, 42)
    const roles = players.map(p => p.role)
    expect(roles).toContain('oberon')
  })

  it('is deterministic — same seed produces same assignment', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const first = assignRoles(ids, 99)
    const second = assignRoles(ids, 99)
    expect(first).toEqual(second)
  })

  it('different seeds produce different assignments', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const first = assignRoles(ids, 1)
    const second = assignRoles(ids, 2)
    const firstRoles = first.map(p => p.role).join(',')
    const secondRoles = second.map(p => p.role).join(',')
    expect(firstRoles).not.toBe(secondRoles)
  })

  it('every player role matches ROLE_TEAM', () => {
    const players = assignRoles(['a', 'b', 'c', 'd', 'e'], 42)
    for (const p of players) {
      expect(p.team).toBe(ROLE_TEAM[p.role])
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/avalon/types.test.ts`
Expected: FAIL — `assignRoles` not exported

- [ ] **Step 3: Write implementation**

Add to `src/games/avalon/types.ts`:

```typescript
// --- Seeded PRNG (mulberry32) ---

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// --- Role Assignment ---

export function assignRoles(playerIds: string[], seed: number): AvalonPlayer[] {
  const rand = mulberry32(seed)
  const roles = EXPERIENCED_ROLES[playerIds.length]
  if (!roles) throw new Error(`Unsupported player count: ${playerIds.length}`)

  const shuffledRoles = shuffle(roles, rand)
  return playerIds.map((id, i) => ({
    id,
    role: shuffledRoles[i],
    team: ROLE_TEAM[shuffledRoles[i]],
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/avalon/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/avalon/types.ts src/games/avalon/types.test.ts
git commit -m "feat: add seeded role assignment for Avalon"
```

---

### Task 4: buildView and View Isolation

**Files:**
- Modify: `src/games/avalon/types.ts` (add `buildView`, `AvalonState`)
- Modify: `src/games/avalon/types.test.ts` (add view tests)

- [ ] **Step 1: Write failing tests**

```typescript
// Add to src/games/avalon/types.test.ts
import { buildView, type AvalonState, type AvalonPlayer } from './types.js'

function makeState(overrides?: Partial<AvalonState>): AvalonState {
  return {
    players: [
      { id: 'alice', role: 'merlin', team: 'good' },
      { id: 'bob', role: 'percival', team: 'good' },
      { id: 'charlie', role: 'loyal-servant', team: 'good' },
      { id: 'diana', role: 'assassin', team: 'evil' },
      { id: 'eve', role: 'morgana', team: 'evil' },
    ],
    phase: 'team-proposal',
    questNumber: 0,
    questResults: [null, null, null, null, null],
    leaderIndex: 0,
    proposalRejections: 0,
    proposedTeam: undefined,
    ...overrides,
  }
}

describe('buildView', () => {
  it('Merlin sees evil players (not Mordred) as evil', () => {
    const state = makeState()
    const view = buildView(state.players[0], state) // alice = merlin
    expect(view.yourRole).toBe('merlin')
    expect(view.knownPlayers).toEqual(
      expect.arrayContaining([
        { id: 'diana', appearance: 'evil' },
        { id: 'eve', appearance: 'evil' },
      ])
    )
    expect(view.knownPlayers).toHaveLength(2)
  })

  it('Merlin does not see Mordred', () => {
    const state = makeState({
      players: [
        { id: 'alice', role: 'merlin', team: 'good' },
        { id: 'bob', role: 'percival', team: 'good' },
        { id: 'charlie', role: 'loyal-servant', team: 'good' },
        { id: 'diana', role: 'loyal-servant', team: 'good' },
        { id: 'eve', role: 'assassin', team: 'evil' },
        { id: 'frank', role: 'mordred', team: 'evil' },
        { id: 'grace', role: 'morgana', team: 'evil' },
      ],
    })
    const view = buildView(state.players[0], state) // alice = merlin
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).toContain('eve')       // assassin visible
    expect(knownIds).toContain('grace')     // morgana visible
    expect(knownIds).not.toContain('frank') // mordred hidden
  })

  it('Percival sees Merlin and Morgana as merlin-or-morgana', () => {
    const state = makeState()
    const view = buildView(state.players[1], state) // bob = percival
    expect(view.knownPlayers).toEqual(
      expect.arrayContaining([
        { id: 'alice', appearance: 'merlin-or-morgana' },
        { id: 'eve', appearance: 'merlin-or-morgana' },
      ])
    )
    expect(view.knownPlayers).toHaveLength(2)
  })

  it('Loyal Servant sees nothing', () => {
    const state = makeState()
    const view = buildView(state.players[2], state) // charlie = loyal-servant
    expect(view.knownPlayers).toEqual([])
  })

  it('Evil players see each other (not Oberon) as evil', () => {
    const state = makeState()
    const view = buildView(state.players[3], state) // diana = assassin
    expect(view.knownPlayers).toEqual([{ id: 'eve', appearance: 'evil' }])
  })

  it('Oberon sees nothing', () => {
    const state = makeState({
      players: [
        { id: 'a', role: 'merlin', team: 'good' },
        { id: 'b', role: 'percival', team: 'good' },
        { id: 'c', role: 'loyal-servant', team: 'good' },
        { id: 'd', role: 'loyal-servant', team: 'good' },
        { id: 'e', role: 'loyal-servant', team: 'good' },
        { id: 'f', role: 'loyal-servant', team: 'good' },
        { id: 'g', role: 'assassin', team: 'evil' },
        { id: 'h', role: 'mordred', team: 'evil' },
        { id: 'i', role: 'morgana', team: 'evil' },
        { id: 'j', role: 'oberon', team: 'evil' },
      ],
    })
    const view = buildView(state.players[9], state) // j = oberon
    expect(view.knownPlayers).toEqual([])
  })

  it('Evil players do not see Oberon', () => {
    const state = makeState({
      players: [
        { id: 'a', role: 'merlin', team: 'good' },
        { id: 'b', role: 'percival', team: 'good' },
        { id: 'c', role: 'loyal-servant', team: 'good' },
        { id: 'd', role: 'loyal-servant', team: 'good' },
        { id: 'e', role: 'loyal-servant', team: 'good' },
        { id: 'f', role: 'loyal-servant', team: 'good' },
        { id: 'g', role: 'assassin', team: 'evil' },
        { id: 'h', role: 'mordred', team: 'evil' },
        { id: 'i', role: 'morgana', team: 'evil' },
        { id: 'j', role: 'oberon', team: 'evil' },
      ],
    })
    const view = buildView(state.players[6], state) // g = assassin
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).toContain('h')       // mordred
    expect(knownIds).toContain('i')       // morgana
    expect(knownIds).not.toContain('j')   // oberon hidden
  })

  it('includes public game state in all views', () => {
    const state = makeState({ questNumber: 2, proposalRejections: 3, leaderIndex: 1 })
    const view = buildView(state.players[0], state)
    expect(view.phase).toBe('team-proposal')
    expect(view.questNumber).toBe(2)
    expect(view.proposalRejections).toBe(3)
    expect(view.leader).toBe('bob')
    expect(view.players).toEqual(['alice', 'bob', 'charlie', 'diana', 'eve'])
  })

  it('includes proposedTeam when set', () => {
    const state = makeState({ proposedTeam: ['alice', 'bob'] })
    const view = buildView(state.players[0], state)
    expect(view.proposedTeam).toEqual(['alice', 'bob'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/avalon/types.test.ts`
Expected: FAIL — `buildView`, `AvalonState` not exported

- [ ] **Step 3: Write implementation**

Add to `src/games/avalon/types.ts`:

```typescript
// --- Game State (internal, never exposed to players) ---

export interface AvalonState {
  players: AvalonPlayer[]
  phase: Phase
  questNumber: number
  questResults: ('success' | 'fail' | null)[]
  leaderIndex: number
  proposalRejections: number
  proposedTeam?: string[]
}

// --- View Builder ---

export function buildView(player: AvalonPlayer, state: AvalonState): PlayerView {
  return {
    yourId: player.id,
    yourRole: player.role,
    yourTeam: player.team,
    knownPlayers: getKnownPlayers(player, state.players),
    phase: state.phase,
    questNumber: state.questNumber,
    questResults: [...state.questResults],
    leader: state.players[state.leaderIndex].id,
    proposalRejections: state.proposalRejections,
    proposedTeam: state.proposedTeam ? [...state.proposedTeam] : undefined,
    players: state.players.map(p => p.id),
  }
}

function getKnownPlayers(
  viewer: AvalonPlayer,
  allPlayers: AvalonPlayer[],
): PlayerView['knownPlayers'] {
  const others = allPlayers.filter(p => p.id !== viewer.id)

  switch (viewer.role) {
    case 'merlin':
      // Sees all evil except Mordred
      return others
        .filter(p => p.team === 'evil' && p.role !== 'mordred')
        .map(p => ({ id: p.id, appearance: 'evil' as const }))

    case 'percival':
      // Sees Merlin and Morgana (can't distinguish)
      return others
        .filter(p => p.role === 'merlin' || p.role === 'morgana')
        .map(p => ({ id: p.id, appearance: 'merlin-or-morgana' as const }))

    case 'oberon':
      // Sees nothing
      return []

    case 'assassin':
    case 'morgana':
    case 'mordred':
    case 'minion':
      // Evil sees other evil except Oberon
      return others
        .filter(p => p.team === 'evil' && p.role !== 'oberon')
        .map(p => ({ id: p.id, appearance: 'evil' as const }))

    case 'loyal-servant':
    default:
      return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/avalon/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/avalon/types.ts src/games/avalon/types.test.ts
git commit -m "feat: add buildView with role-specific visibility for Avalon"
```

---

### Task 5: Avalon Game — Team Proposal Phase

**Files:**
- Create: `src/games/avalon/avalon.ts`
- Create: `src/games/avalon/avalon.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/games/avalon/avalon.test.ts
import { describe, it, expect } from 'vitest'
import { Engine } from '../../core/engine.js'
import { Avalon } from './avalon.js'
import { scriptedPlayers } from '../../test-utils/scripted-players.js'
import { assignRoles } from './types.js'
import type { GameEvent } from '../../core/events.js'

function makeConfig(playerCount: number, seed = 42) {
  const ids = ['alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace', 'heidi', 'ivan', 'judy'].slice(0, playerCount)
  return {
    gameId: 'test',
    seed,
    players: ids.map(id => ({ id, name: id })),
  }
}

describe('Avalon', () => {
  it('leader receives team proposal request on first yield', async () => {
    const config = makeConfig(5)
    const roles = assignRoles(config.players.map(p => p.id), config.seed)
    const leaderIdx = config.seed % 5
    const leaderId = config.players[leaderIdx].id

    // Leader proposes, then all vote reject (4 times), then 5th rejection → evil wins
    // For now we just need to verify the leader gets the first request
    const actions: [string, unknown][] = []

    // 5 rounds of: leader proposes, everyone rejects
    for (let round = 0; round < 5; round++) {
      const leader = config.players[(leaderIdx + round) % 5].id
      actions.push([leader, { team: [config.players[0].id, config.players[1].id] }])
      for (const p of config.players) {
        actions.push([p.id, { vote: 'reject' }])
      }
    }

    const players = scriptedPlayers(actions)
    const events: GameEvent[] = []
    const engine = new Engine()
    engine.onEvent(e => events.push(e))

    const outcome = await engine.run(new Avalon(), players, config)

    // Should have emitted a team-proposed event
    const proposalEvent = events.find(
      e => e.source === 'game' && (e.data as any).type === 'team-proposed'
    )
    expect(proposalEvent).toBeDefined()

    // Hammer rule: 5 rejections → evil wins
    expect(outcome).not.toBeNull()
    const evilPlayers = roles.filter(r => r.team === 'evil').map(r => r.id)
    const goodPlayers = roles.filter(r => r.team === 'good').map(r => r.id)
    for (const id of evilPlayers) expect(outcome!.scores[id]).toBe(1)
    for (const id of goodPlayers) expect(outcome!.scores[id]).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/games/avalon/avalon.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write initial Avalon class with proposal, vote, and hammer rule**

```typescript
// src/games/avalon/avalon.ts
import { z } from 'zod'
import type { Game, GameFlow, PlayerAction } from '../../core/game.js'
import type { GameConfig, GameOutcome, ActionRequest, GameResponse } from '../../core/types.js'
import type { GameEvent } from '../../core/events.js'
import {
  type AvalonPlayer, type AvalonState, type Phase,
  AvalonOptionsSchema, TeamProposalSchema, TeamVoteSchema, QuestVoteSchema, AssassinationTargetSchema,
  QUEST_CONFIGS, assignRoles, buildView, ROLE_TEAM,
} from './types.js'

function event(gameId: string, data: unknown): GameEvent {
  return { source: 'game', gameId, data, timestamp: new Date().toISOString() }
}

export class Avalon implements Game {
  readonly optionsSchema = AvalonOptionsSchema

  play(config: GameConfig): GameFlow {
    const self = this
    return (async function* () {
      const gameId = config.gameId
      const playerIds = config.players.map(p => p.id)
      const playerCount = playerIds.length
      const players = assignRoles(playerIds, config.seed)
      const questConfigs = QUEST_CONFIGS[playerCount]

      const state: AvalonState = {
        players,
        phase: 'team-proposal',
        questNumber: 0,
        questResults: [null, null, null, null, null],
        leaderIndex: config.seed % playerCount,
        proposalRejections: 0,
        proposedTeam: undefined,
      }

      // Emit game-start
      yield {
        requests: [],
        events: [event(gameId, {
          type: 'game-start',
          players: playerIds,
          questConfigs,
        })],
      }

      let successes = 0
      let fails = 0

      while (successes < 3 && fails < 3) {
        const questConfig = questConfigs[state.questNumber]

        // --- Team Proposal + Vote loop ---
        let teamApproved = false
        while (!teamApproved) {
          state.phase = 'team-proposal'
          state.proposedTeam = undefined
          const leader = players[state.leaderIndex]

          // Yield proposal request to leader
          const proposalAction: PlayerAction = yield {
            requests: [{
              playerId: leader.id,
              view: buildView(leader, state),
              actionSchema: TeamProposalSchema,
            }],
            events: [],
          }
          const proposal = proposalAction.action as { team: string[] }
          state.proposedTeam = proposal.team

          // Emit team-proposed event
          const proposalEvents = [event(gameId, {
            type: 'team-proposed',
            leader: leader.id,
            team: proposal.team,
            questNumber: state.questNumber,
          })]

          // --- Team Vote (parallel) ---
          state.phase = 'team-vote'
          const voteRequests: ActionRequest[] = players.map(p => ({
            playerId: p.id,
            view: buildView(p, state),
            actionSchema: TeamVoteSchema,
          }))

          const votes: Record<string, 'approve' | 'reject'> = {}
          const firstVote: PlayerAction = yield { requests: voteRequests, events: proposalEvents }
          votes[firstVote.playerId] = (firstVote.action as { vote: 'approve' | 'reject' }).vote

          while (Object.keys(votes).length < playerCount) {
            const nextVote: PlayerAction = yield { requests: [], events: [] }
            votes[nextVote.playerId] = (nextVote.action as { vote: 'approve' | 'reject' }).vote
          }

          const approvals = Object.values(votes).filter(v => v === 'approve').length
          const approved = approvals > playerCount / 2

          // Emit vote-result event
          yield {
            requests: [],
            events: [event(gameId, {
              type: 'vote-result',
              votes,
              result: approved ? 'approved' : 'rejected',
            })],
          }

          if (approved) {
            teamApproved = true
            state.proposalRejections = 0
          } else {
            state.proposalRejections++
            if (state.proposalRejections >= 5) {
              // Hammer rule — evil wins
              state.phase = 'game-over'
              yield {
                requests: [],
                events: [event(gameId, {
                  type: 'game-end',
                  reason: 'hammer',
                  winner: 'evil',
                })],
              }
              return self.makeScores(players, 'evil')
            }
            state.leaderIndex = (state.leaderIndex + 1) % playerCount
          }
        }

        // --- Quest Execution (parallel, team members only) ---
        state.phase = 'quest'
        const team = players.filter(p => state.proposedTeam!.includes(p.id))
        const questRequests: ActionRequest[] = team.map(p => ({
          playerId: p.id,
          view: buildView(p, state),
          actionSchema: QuestVoteSchema,
        }))

        const questVotes: Record<string, 'success' | 'fail'> = {}
        const firstQuest: PlayerAction = yield { requests: questRequests, events: [] }
        questVotes[firstQuest.playerId] = (firstQuest.action as { questVote: 'success' | 'fail' }).questVote

        while (Object.keys(questVotes).length < team.length) {
          const nextQuest: PlayerAction = yield { requests: [], events: [] }
          questVotes[nextQuest.playerId] = (nextQuest.action as { questVote: 'success' | 'fail' }).questVote
        }

        const failCount = Object.values(questVotes).filter(v => v === 'fail').length
        const questFailed = failCount >= questConfigs[state.questNumber].failsRequired
        state.questResults[state.questNumber] = questFailed ? 'fail' : 'success'

        if (questFailed) fails++
        else successes++

        yield {
          requests: [],
          events: [event(gameId, {
            type: 'quest-result',
            questNumber: state.questNumber,
            result: questFailed ? 'fail' : 'success',
            failVotes: failCount,
          })],
        }

        state.questNumber++
        state.leaderIndex = (state.leaderIndex + 1) % playerCount
        state.proposalRejections = 0
        state.proposedTeam = undefined
      }

      // --- Game End ---
      if (fails >= 3) {
        state.phase = 'game-over'
        yield {
          requests: [],
          events: [event(gameId, { type: 'game-end', reason: 'three-fails', winner: 'evil' })],
        }
        return self.makeScores(players, 'evil')
      }

      // --- Assassination Phase ---
      state.phase = 'assassination'
      const assassin = players.find(p => p.role === 'assassin')!
      const assassinAction: PlayerAction = yield {
        requests: [{
          playerId: assassin.id,
          view: buildView(assassin, state),
          actionSchema: AssassinationTargetSchema,
        }],
        events: [],
      }
      const target = (assassinAction.action as { target: string }).target
      const merlin = players.find(p => p.role === 'merlin')!
      const assassinationSuccess = target === merlin.id
      const winner = assassinationSuccess ? 'evil' : 'good'

      yield {
        requests: [],
        events: [event(gameId, {
          type: 'assassination-attempt',
          assassin: assassin.id,
          target,
          result: assassinationSuccess ? 'success' : 'fail',
        }),
        event(gameId, {
          type: 'game-end',
          reason: assassinationSuccess ? 'assassination' : 'three-successes',
          winner,
        })],
      }

      return self.makeScores(players, winner)
    })()
  }

  private makeScores(players: AvalonPlayer[], winner: 'good' | 'evil'): GameOutcome {
    const scores: Record<string, number> = {}
    for (const p of players) {
      scores[p.id] = p.team === winner ? 1 : 0
    }
    return { scores }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/games/avalon/avalon.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/avalon/avalon.ts src/games/avalon/avalon.test.ts
git commit -m "feat: implement Avalon game with full game loop"
```

---

### Task 6: Comprehensive Game Tests

**Files:**
- Modify: `src/games/avalon/avalon.test.ts`

- [ ] **Step 1: Add hammer rule test**

```typescript
it('evil wins by hammer rule (5 consecutive rejections)', async () => {
  const config = makeConfig(5)
  const roles = assignRoles(config.players.map(p => p.id), config.seed)
  const leaderIdx = config.seed % 5
  const actions: [string, unknown][] = []

  for (let round = 0; round < 5; round++) {
    const leader = config.players[(leaderIdx + round) % 5].id
    actions.push([leader, { team: [config.players[0].id, config.players[1].id] }])
    for (const p of config.players) {
      actions.push([p.id, { vote: 'reject' }])
    }
  }

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  const outcome = await engine.run(new Avalon(), players, config)

  expect(outcome).not.toBeNull()
  const evilPlayers = roles.filter(r => r.team === 'evil').map(r => r.id)
  for (const id of evilPlayers) expect(outcome!.scores[id]).toBe(1)
})
```

- [ ] **Step 2: Add evil wins by 3 fails test**

```typescript
it('evil wins by 3 quest failures (no assassination)', async () => {
  const config = makeConfig(5)
  const roles = assignRoles(config.players.map(p => p.id), config.seed)
  const leaderIdx = config.seed % 5
  const questConfigs = [2, 3, 2] // team sizes for quests 1-3 in 5-player
  const actions: [string, unknown][] = []
  const events: GameEvent[] = []

  // 3 quests: leader proposes team with evil, everyone approves, evil fails
  for (let quest = 0; quest < 3; quest++) {
    const leader = config.players[(leaderIdx + quest) % 5].id
    const teamSize = questConfigs[quest]
    // Pick team including at least one evil player
    const evilPlayer = roles.find(r => r.team === 'evil')!
    const team = [evilPlayer.id, ...roles.filter(r => r.id !== evilPlayer.id).slice(0, teamSize - 1).map(r => r.id)]

    actions.push([leader, { team }])
    for (const p of config.players) actions.push([p.id, { vote: 'approve' }])
    for (const memberId of team) {
      const member = roles.find(r => r.id === memberId)!
      actions.push([memberId, { questVote: member.team === 'evil' ? 'fail' : 'success' }])
    }
  }

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  engine.onEvent(e => events.push(e))
  const outcome = await engine.run(new Avalon(), players, config)

  expect(outcome).not.toBeNull()
  const evilPlayers = roles.filter(r => r.team === 'evil').map(r => r.id)
  for (const id of evilPlayers) expect(outcome!.scores[id]).toBe(1)

  // No assassination event
  const assassinationEvent = events.find(
    e => e.source === 'game' && (e.data as any).type === 'assassination-attempt'
  )
  expect(assassinationEvent).toBeUndefined()
})
```

- [ ] **Step 3: Add good wins (assassination miss) test**

```typescript
it('good wins when assassin guesses wrong', async () => {
  const config = makeConfig(5)
  const roles = assignRoles(config.players.map(p => p.id), config.seed)
  const leaderIdx = config.seed % 5
  const questConfigs = [2, 3, 2] // team sizes for quests 1-3 in 5-player
  const actions: [string, unknown][] = []

  // 3 quests: leader proposes good-only team, everyone approves, all success
  for (let quest = 0; quest < 3; quest++) {
    const leader = config.players[(leaderIdx + quest) % 5].id
    const teamSize = questConfigs[quest]
    const goodPlayers = roles.filter(r => r.team === 'good')
    const team = goodPlayers.slice(0, teamSize).map(r => r.id)

    actions.push([leader, { team }])
    for (const p of config.players) actions.push([p.id, { vote: 'approve' }])
    for (const memberId of team) actions.push([memberId, { questVote: 'success' }])
  }

  // Assassination: assassin guesses a non-Merlin good player
  const assassin = roles.find(r => r.role === 'assassin')!
  const merlin = roles.find(r => r.role === 'merlin')!
  const wrongTarget = roles.find(r => r.team === 'good' && r.role !== 'merlin')!
  actions.push([assassin.id, { target: wrongTarget.id }])

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  const outcome = await engine.run(new Avalon(), players, config)

  expect(outcome).not.toBeNull()
  const goodIds = roles.filter(r => r.team === 'good').map(r => r.id)
  for (const id of goodIds) expect(outcome!.scores[id]).toBe(1)
})
```

- [ ] **Step 4: Add evil wins by assassination test**

```typescript
it('evil wins when assassin correctly identifies Merlin', async () => {
  const config = makeConfig(5)
  const roles = assignRoles(config.players.map(p => p.id), config.seed)
  const leaderIdx = config.seed % 5
  const questConfigs = [2, 3, 2]
  const actions: [string, unknown][] = []

  // 3 successful quests (same as above)
  for (let quest = 0; quest < 3; quest++) {
    const leader = config.players[(leaderIdx + quest) % 5].id
    const teamSize = questConfigs[quest]
    const goodPlayers = roles.filter(r => r.team === 'good')
    const team = goodPlayers.slice(0, teamSize).map(r => r.id)

    actions.push([leader, { team }])
    for (const p of config.players) actions.push([p.id, { vote: 'approve' }])
    for (const memberId of team) actions.push([memberId, { questVote: 'success' }])
  }

  // Assassination: assassin correctly guesses Merlin
  const assassin = roles.find(r => r.role === 'assassin')!
  const merlin = roles.find(r => r.role === 'merlin')!
  actions.push([assassin.id, { target: merlin.id }])

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  const outcome = await engine.run(new Avalon(), players, config)

  expect(outcome).not.toBeNull()
  const evilIds = roles.filter(r => r.team === 'evil').map(r => r.id)
  for (const id of evilIds) expect(outcome!.scores[id]).toBe(1)
})
```

- [ ] **Step 5: Add 4th quest special rule test (7 players)**

```typescript
it('4th quest requires 2 fails for 7+ players', async () => {
  const config = makeConfig(7)
  const roles = assignRoles(config.players.map(p => p.id), config.seed)
  const leaderIdx = config.seed % 7
  const actions: [string, unknown][] = []
  const events: GameEvent[] = []

  // Skip to quest 4 by doing 3 quests first (2 success, 1 fail to avoid early end)
  const questSizes = [2, 3, 3, 4] // 7-player quest team sizes
  for (let quest = 0; quest < 4; quest++) {
    const leader = config.players[(leaderIdx + quest) % 7].id
    const teamSize = questSizes[quest]
    // Build a team with 1 evil player for quests 0-2, 2 evil for quest 3
    const evilPlayers = roles.filter(r => r.team === 'evil')
    const goodPlayers = roles.filter(r => r.team === 'good')

    let team: string[]
    if (quest < 2) {
      // Successes: all-good teams
      team = goodPlayers.slice(0, teamSize).map(r => r.id)
    } else if (quest === 2) {
      // Fail: include 1 evil
      team = [...goodPlayers.slice(0, teamSize - 1).map(r => r.id), evilPlayers[0].id]
    } else {
      // Quest 4: include 1 evil (should NOT fail — needs 2 fails)
      team = [...goodPlayers.slice(0, teamSize - 1).map(r => r.id), evilPlayers[0].id]
    }

    actions.push([leader, { team }])
    for (const p of config.players) actions.push([p.id, { vote: 'approve' }])
    for (const memberId of team) {
      const member = roles.find(r => r.id === memberId)!
      actions.push([memberId, { questVote: member.team === 'evil' ? 'fail' : 'success' }])
    }
  }

  // After quest 4 succeeds (1 fail < 2 required), good has 3 successes → assassination
  const assassin = roles.find(r => r.role === 'assassin')!
  const wrongTarget = roles.find(r => r.team === 'good' && r.role !== 'merlin')!
  actions.push([assassin.id, { target: wrongTarget.id }])

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  engine.onEvent(e => events.push(e))
  const outcome = await engine.run(new Avalon(), players, config)

  // Quest 4 should have succeeded (1 fail < 2 required)
  const quest4Result = events.find(
    e => e.source === 'game' && (e.data as any).type === 'quest-result' && (e.data as any).questNumber === 3
  )
  expect((quest4Result!.data as any).result).toBe('success')
  expect((quest4Result!.data as any).failVotes).toBe(1)

  // Good wins (3 successes + assassination miss)
  expect(outcome).not.toBeNull()
  const goodIds = roles.filter(r => r.team === 'good').map(r => r.id)
  for (const id of goodIds) expect(outcome!.scores[id]).toBe(1)
})
```

- [ ] **Step 6: Add team vote rejection with leader rotation test**

```typescript
it('rotates leader after team rejection', async () => {
  const config = makeConfig(5)
  const roles = assignRoles(config.players.map(p => p.id), config.seed)
  const leaderIdx = config.seed % 5
  const actions: [string, unknown][] = []
  const events: GameEvent[] = []

  // First proposal: rejected
  const leader1 = config.players[leaderIdx].id
  actions.push([leader1, { team: [config.players[0].id, config.players[1].id] }])
  for (const p of config.players) actions.push([p.id, { vote: 'reject' }])

  // Second proposal: different leader, approved, then quest
  const leader2 = config.players[(leaderIdx + 1) % 5].id
  const goodPlayers = roles.filter(r => r.team === 'good')
  const team = goodPlayers.slice(0, 2).map(r => r.id)
  actions.push([leader2, { team }])
  for (const p of config.players) actions.push([p.id, { vote: 'approve' }])
  for (const memberId of team) actions.push([memberId, { questVote: 'success' }])

  // Remaining quests to end the game (2 more successes + assassination miss)
  for (let quest = 1; quest < 3; quest++) {
    const leader = config.players[(leaderIdx + 1 + quest) % 5].id
    const teamSize = quest === 1 ? 3 : 2 // 5-player quest sizes: 2,3,2,3,3
    const qTeam = goodPlayers.slice(0, teamSize).map(r => r.id)
    actions.push([leader, { team: qTeam }])
    for (const p of config.players) actions.push([p.id, { vote: 'approve' }])
    for (const memberId of qTeam) actions.push([memberId, { questVote: 'success' }])
  }
  const assassin = roles.find(r => r.role === 'assassin')!
  const wrongTarget = roles.find(r => r.team === 'good' && r.role !== 'merlin')!
  actions.push([assassin.id, { target: wrongTarget.id }])

  const players = scriptedPlayers(actions)
  const engine = new Engine()
  engine.onEvent(e => events.push(e))
  await engine.run(new Avalon(), players, config)

  // Two proposal events with different leaders
  const proposals = events.filter(
    e => e.source === 'game' && (e.data as any).type === 'team-proposed'
  )
  expect(proposals.length).toBeGreaterThanOrEqual(2)
  expect((proposals[0].data as any).leader).toBe(leader1)
  expect((proposals[1].data as any).leader).toBe(leader2)
})
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run src/games/avalon/`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/games/avalon/avalon.test.ts
git commit -m "test: add comprehensive Avalon game tests — hammer, assassination, 4th quest, rotation"
```

---

### Task 7: Update Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/requirements.md`

- [ ] **Step 1: Update architecture.md**

Add after the AI Game section:

```markdown
## Avalon (`src/games/avalon/`)

Native Game implementation for The Resistance: Avalon. Deterministic game logic — no LLMs.

- **`types.ts`** — Types, Zod schemas, lookup tables (team counts, quest configs, role configs), `assignRoles()`, `buildView()`
- **`avalon.ts`** — `Avalon` implements `Game`. Generator-based: team proposal → vote → quest → assassination.
- **`avalon.test.ts`** — Deterministic tests with `scriptedPlayers` helper.
```

- [ ] **Step 2: Update requirements.md — mark AVLN items complete**

Change AVLN-01 through AVLN-08 from `- [ ]` to `- [x]`. Update traceability table Phase 2 status from "Pending" to "Complete".

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/requirements.md
git commit -m "docs: update architecture and requirements for native Avalon implementation"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-27-avalon-game.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?