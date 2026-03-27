# Native Avalon Game Implementation

## Goal

Implement Avalon as a native `Game` using the generator pattern. No LLMs — deterministic game logic, testable with scripted players. Experienced role config by default, all 5-10 player counts supported. Standard rules only (no targeting variant, no Lady of the Lake).

## Types (`src/games/avalon/types.ts`)

```typescript
type Team = 'good' | 'evil'
type Role = 'merlin' | 'percival' | 'loyal-servant' | 'assassin' | 'morgana' | 'mordred' | 'oberon' | 'minion'
type Phase = 'team-proposal' | 'team-vote' | 'quest' | 'assassination' | 'game-over'

interface AvalonPlayer { id: string; role: Role; team: Team }

interface PlayerView {
  yourId: string
  yourRole: Role
  yourTeam: Team
  knownPlayers: { id: string; appearance: 'evil' | 'merlin-or-morgana' }[]
  phase: Phase
  questNumber: number
  questResults: ('success' | 'fail' | null)[]  // length 5
  leader: string
  proposalRejections: number
  proposedTeam?: string[]
  players: string[]
}

interface QuestConfig { teamSize: number; failsRequired: number }

// Actions
type TeamProposal = { team: string[] }
type TeamVote = { vote: 'approve' | 'reject' }
type QuestVote = { questVote: 'success' | 'fail' }
type AssassinationTarget = { target: string }
```

All types get corresponding Zod schemas for action validation.

### Lookup Tables

- `TEAM_COUNTS`: player count → { good, evil }
- `QUEST_CONFIGS`: player count → QuestConfig[5]
- `ROLE_CONFIGS`: player count → Role[] (experienced default)

### Visibility Rules

| Role | `knownPlayers` |
|------|---------------|
| Merlin | All evil except Mordred → `'evil'` |
| Percival | Merlin + Morgana → `'merlin-or-morgana'` |
| Evil (not Oberon) | All evil except Oberon → `'evil'` |
| Oberon | Empty |
| Loyal Servant | Empty |

## Architecture

```
src/games/avalon/
├── types.ts          # Types, Zod schemas, lookup tables, buildView()
├── avalon.ts         # Avalon implements Game
└── avalon.test.ts    # Deterministic tests with scripted players
```

### `Avalon` class (`src/games/avalon/avalon.ts`)

```typescript
class Avalon implements Game {
  readonly optionsSchema = AvalonOptionsSchema

  play(config: GameConfig): GameFlow {
    // 1. Assign roles (seeded PRNG)
    // 2. Generator loop: proposal → vote → quest → check end
    // 3. Assassination if good wins 3
    // 4. Return scores
  }

  private *collectAll(playerIds, schema, buildView) { /* parallel collection */ }
}
```

Sub-generators via `yield*`:
- `*collectAll(playerIds, schema, viewBuilder)` — parallel collection pattern
- Main loop handles phase transitions inline

### `buildView(player, state)` in `types.ts`

Constructs per-player view from internal state. Filters `knownPlayers` based on role. Called each time a request is yielded.

## Game Flow

1. **Setup**: Assign roles via seeded PRNG, pick leader (`seed % playerCount`), emit `game-start`
2. **Quest loop** (until 3 successes or 3 fails):
   - **Proposal**: yield to leader → receive team
   - **Vote**: yield to all → collect votes
     - Majority approves → quest execution
     - 5th consecutive rejection → evil wins (hammer)
     - Otherwise → rotate leader, re-propose
   - **Quest**: yield to team → collect success/fail
     - Evaluate result (4th quest / 7+ needs 2 fails)
     - Emit `quest-result`, rotate leader, reset rejections
3. **End**:
   - 3 fails → evil wins
   - 3 successes → assassination: yield to assassin
     - Correct → evil wins
     - Wrong → good wins
4. **Scoring**: winners get 1, losers get 0

### Events

`game-start`, `team-proposed`, `vote-result`, `quest-result`, `assassination-attempt`, `game-end`

## Testing (TDD)

### Test helper (`src/test-utils/scripted-players.ts`)

```typescript
export function scriptedPlayers(actions: [string, unknown][]): Map<string, Player> {
  const queues = new Map<string, unknown[]>()
  for (const [id, action] of actions) {
    if (!queues.has(id)) queues.set(id, [])
    queues.get(id)!.push(action)
  }
  return new Map(
    [...queues.keys()].map(id => [id, { act: async () => queues.get(id)!.shift() }])
  )
}
```

Reusable for any game. Linear action list splits into per-player queues.

### Test groups

1. **Role assignment** — seed → expected roles, correct counts for 5-10
2. **View isolation** — each role sees only permitted info
3. **Team proposal** — leader gets request, correct team size
4. **Team vote** — majority approve, tie rejects, leader rotates
5. **Hammer rule** — 5 rejections → evil wins
6. **Quest execution** — fail threshold, good must play success
7. **4th quest rule** — 7+ players, needs 2 fails
8. **Assassination** — correct guess (evil wins), wrong (good wins)
9. **Evil wins by 3 fails** — no assassination phase
10. **Full games** — 5-player and 7-player to completion

### Test style

```typescript
it('good wins when assassin misses Merlin', async () => {
  const players = scriptedPlayers([
    // Quest 1 — leader: alice
    ['alice',   { team: ['alice', 'bob'] }],
    ['alice',   'approve'],
    ['bob',     'approve'],
    ['charlie', 'approve'],
    ['diana',   'reject'],
    ['eve',     'reject'],
    ['alice',   'success'],
    ['bob',     'success'],
    // ... Quest 2, 3 ...
    ['diana',   { target: 'charlie' }],  // wrong guess
  ])

  const engine = new Engine()
  const outcome = await engine.run(
    new Avalon(),
    players,
    { gameId: 'test', seed: 1, players: [...players.keys()].map(id => ({ id, name: id })) },
  )
  expect(outcome!.scores).toEqual({
    alice: 1, bob: 1, charlie: 1, diana: 0, eve: 0,
  })
})
```

## Implementation Order (TDD)

1. Types + Zod schemas + lookup tables
2. `scriptedPlayers` test helper
3. Role assignment + tests
4. `buildView` + view isolation tests
5. Team proposal phase + tests
6. Team vote phase + tests (including hammer rule)
7. Quest execution + tests (including 4th quest rule)
8. Assassination phase + tests
9. Full game integration tests (5-player, 7-player)
10. Update docs

## Out of Scope

- Targeting variant
- Lady of the Lake
- Custom role configurations (future — `optionsSchema` supports it later)
- LLM players (Phase 3)
- Discussion phase (Phase 3)
