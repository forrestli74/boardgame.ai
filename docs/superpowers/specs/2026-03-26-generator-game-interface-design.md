# Generator Game Interface

Replace the 4-method `Game` interface with a single generator-based `play()` method. Then implement Avalon as the first game using this pattern.

## Motivation

The current `Game` interface (init, handleResponse, isTerminal, getOutcome) splits game flow across 4 methods. The game author must maintain phase state, track terminal conditions, and store outcomes — all of which the generator pattern handles implicitly. The framework should own this complexity once, not each game.

## Scope

- Replace `Game` interface with generator-based `play()`
- Update `Engine` to drive generators
- Update all tests
- Implement `AvalonGame` using the new interface
- Keep docs up to date

Out of scope: Lady of the Lake, Targeting variant, async generator support (AIGameMaster is deleted/WIP — address when it stabilizes).

## Game Interface

### Before

```typescript
interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): Promise<GameResponse> | GameResponse
  handleResponse(playerId: string, action: unknown): Promise<GameResponse> | GameResponse
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}
```

### After

```typescript
interface Game {
  readonly optionsSchema: ZodSchema
  play(config: GameConfig): GameFlow
}

type PlayerAction = { playerId: string; action: unknown }
type GameFlow = Generator<GameResponse, GameOutcome, PlayerAction>
```

- `play()` returns a sync `Generator`
- Each `yield` produces a `GameResponse` (requests + events)
- Each `.next(playerAction)` delivers one player's response
- Generator `return` value is `GameOutcome` — no separate `getOutcome()`
- Generator completion = terminal — no separate `isTerminal()`

## Engine Changes

The engine loop simplifies. No more `isTerminal()` or `getOutcome()` calls.

```typescript
async run(game: Game, players: Map<string, Player>, config: GameConfig): Promise<GameOutcome | null> {
  const gen = game.play(config)
  const pending = new Map<string, Promise<PendingResponse>>()

  let result = gen.next()          // first yield = init
  while (!result.done) {
    const { requests, events } = result.value
    for (const event of events) this.recorder.record(event)

    for (const req of requests) {
      if (!pending.has(req.playerId)) {
        const player = players.get(req.playerId)!
        pending.set(req.playerId, player.act(req).then(
          action => ({ playerId: req.playerId, action, request: req })
        ))
      }
    }

    if (pending.size === 0) return null

    const response = await Promise.race(pending.values())
    pending.delete(response.playerId)
    const parsed = await this.validateWithRetry(
      response.action, response.request, players.get(response.playerId)!
    )

    this.recorder.record({
      source: 'player', gameId: config.gameId,
      playerId: response.playerId, data: parsed,
      timestamp: new Date().toISOString(),
    })

    result = gen.next({ playerId: response.playerId, action: parsed })
  }

  return result.value   // GameOutcome
}
```

## Parallel Collection Pattern

Voting and quest cards require collecting responses from multiple players before resolving. The generator buffers via a `while` loop:

```typescript
private *collectVotes(players: string[]): Generator<GameResponse, VoteResult, PlayerAction> {
  const votes: Record<string, boolean> = {}
  const first = yield {
    requests: players.map(p => ({ playerId: p, view: this.viewFor(p), actionSchema: VoteSchema })),
    events: [],
  }
  votes[first.playerId] = (first.action as boolean | null) ?? true
  while (Object.keys(votes).length < players.length) {
    const { playerId, action } = yield { requests: [], events: [] }
    votes[playerId] = (action as boolean | null) ?? true
  }
  const approvals = Object.values(votes).filter(v => v).length
  return { approved: approvals > players.length / 2, votes }
}
```

Called from the main flow via `yield*`:

```typescript
const voteResult = yield* this.collectVotes(this.playerIds)
```

This is the same pattern AIGameMaster uses for response batching — collect all actions before processing. The generator makes the batching explicit in the flow rather than hidden in buffering state.

## Avalon Implementation

### File Structure

```
src/games/avalon/
  avalon-game.ts      # AvalonGame class — play() generator + sub-generators
  roles.ts            # Role assignment, visibility rules
  phases.ts           # Pure resolution functions (resolveVotes, resolveQuest)
  schemas.ts          # Zod schemas (actions, options, views)
  views.ts            # Per-player view construction
  constants.ts        # Team sizes, fail requirements by player count
  avalon-game.test.ts # Flow integration tests
  phases.test.ts      # Unit tests for pure resolution functions
  roles.test.ts       # Unit tests for role assignment + visibility
```

### Options Schema

Experienced role setup only. Extensible for future options (Lady of the Lake, custom role sets).

```typescript
const AvalonOptionsSchema = z.object({}).default({})
```

No beginner mode. Future options added as optional fields with defaults.

### Roles

```typescript
type GoodRole = 'merlin' | 'percival' | 'loyal-servant'
type EvilRole = 'assassin' | 'morgana' | 'mordred' | 'oberon' | 'minion-of-mordred'
type Role = GoodRole | EvilRole
type Alignment = 'good' | 'evil'
```

Role assignment follows the experienced setup table from `docs/avalon-rules.md`:

| Players | Good | Evil |
|---------|------|------|
| 5 | Merlin, Percival, Servant | Morgana, Assassin |
| 6 | Merlin, Percival, Servant x2 | Morgana, Assassin |
| 7 | Merlin, Percival, Servant x2 | Mordred, Morgana, Assassin |
| 8 | Merlin, Percival, Servant x3 | Mordred, Morgana, Assassin |
| 9 | Merlin, Percival, Servant x4 | Mordred, Morgana, Assassin |
| 10 | Merlin, Percival, Servant x4 | Mordred, Morgana, Oberon, Assassin |

Assignment uses a seeded PRNG (from `config.seed`) to shuffle players before dealing roles. Randomness is pre-computed in TypeScript per RAND-01.

### Visibility Rules

Each role sees specific information during the reveal phase:

| Role | Sees |
|------|------|
| Merlin | All evil except Mordred |
| Percival | Merlin and Morgana (indistinguishable) |
| Evil (except Oberon) | Other evil (except Oberon) |
| Oberon | Nothing |
| Loyal Servant | Nothing |

Visibility is a pure function: `getVisiblePlayers(role, assignments) => string[]`

### Game Flow

The `play()` generator follows the Avalon game phases:

```typescript
*play(config: GameConfig): GameFlow {
  // Setup
  const assignments = assignRoles(config.players, config.seed)
  yield* this.revealRoles(assignments)

  const questResults: boolean[] = []
  let leaderIndex = seededRandom(config.seed).nextInt(config.players.length)
  let voteTrack = 0

  // Main loop — 5 quests
  while (questResults.filter(r => r).length < 3 && questResults.filter(r => !r).length < 3) {
    const quest = questResults.length
    const leader = config.players[leaderIndex % config.players.length].id

    // Team building — leader proposes
    const team = yield* this.teamBuilding(leader, quest)

    // Team vote — all players
    const voteResult = yield* this.collectVotes(this.playerIds)

    if (!voteResult.approved) {
      voteTrack++
      if (voteTrack >= 5) {
        return this.evilWins('five-rejects', assignments)
      }
      leaderIndex++
      continue
    }

    voteTrack = 0

    // Quest — team members play cards
    const questResult = yield* this.runQuest(team, quest)
    questResults.push(questResult.success)
    leaderIndex++
  }

  // 3 quests failed → evil wins
  if (questResults.filter(r => !r).length >= 3) {
    return this.evilWins('three-fails', assignments)
  }

  // 3 quests succeeded → assassination phase
  const assassinationResult = yield* this.assassination(assignments)
  if (assassinationResult.correct) {
    return this.evilWins('assassination', assignments)
  }

  return this.goodWins(assignments)
}
```

### Phases as Sub-Generators

Each phase is a sub-generator using `yield*`:

- **`revealRoles()`** — Yields one event per player with their role + visible info. No requests (no player action needed).
- **`teamBuilding(leader, quest)`** — Yields a request to the leader with `TeamProposalSchema`. Returns the proposed team.
- **`collectVotes(players)`** — Parallel collection. Returns `{ approved, votes }`.
- **`runQuest(team, quest)`** — Parallel collection from team members. Good must play success; evil may play success or fail. Returns `{ success, failCount }`.
- **`assassination(assignments)`** — Sequential. Assassin picks a target. Returns `{ correct, target }`.

### Action Schemas

```typescript
const TeamProposalSchema = z.object({
  team: z.array(z.string())   // structural validation only (array of strings)
})
// Semantic validation (correct team size, valid IDs, no duplicates)
// happens in the generator after receiving the action.
// Invalid proposals are treated as null → default team.

const VoteSchema = z.object({
  vote: z.boolean()            // true = approve, false = reject
})

const QuestSchema = z.object({
  success: z.boolean()         // good must play true; evil can play either
})

const AssassinationSchema = z.object({
  target: z.string()           // must be a good player ID
})
```

### Player Views

Each view contains only what that player should see. View shape depends on phase:

```typescript
// Team building — leader sees
{ phase: 'team-building', quest, teamSize, players, role, visibleInfo, questResults, voteTrack }

// Voting — all see
{ phase: 'team-vote', quest, proposedTeam, leader, role, visibleInfo, questResults }

// Quest — team members see
{ phase: 'quest', quest, team, role, visibleInfo, questResults }

// Assassination — assassin sees
{ phase: 'assassination', questResults, role, visibleInfo }
```

`visibleInfo` is derived from the role's visibility rules — player IDs the role can see, without distinguishing (e.g., Percival sees `merlinOrMorgana: ['p2', 'p5']`).

### Outcome

```typescript
function evilWins(reason: string, assignments: RoleAssignments): GameOutcome {
  return {
    scores: Object.fromEntries(
      Object.entries(assignments).map(([id, role]) => [id, isEvil(role) ? 1 : 0])
    ),
    metadata: { winner: 'evil', reason },
  }
}
```

Scores: 1 for winners, 0 for losers. `metadata.winner` and `metadata.reason` for analysis.

### Null Action Defaults

When the engine sends `null` (validation exhaustion):

| Phase | Default |
|-------|---------|
| Team proposal | First N valid players in seat order |
| Vote | Approve (`true`) |
| Quest | Success (`true`) |
| Assassination | First good player in seat order |

### Events

All events use `source: 'game'` with a discriminating `data.type`:

- `role-assigned` — per player, with role + visible info
- `team-proposed` — leader, team
- `vote-result` — per-player votes, approved/rejected, vote track
- `quest-result` — success/fail, fail count (not who played what)
- `assassination-attempt` — target, correct, actual merlin
- `game-over` — winner (good/evil), reason

### Seeded PRNG

Role assignment and initial leader selection use a seeded PRNG from `config.seed`. Implementation: a simple linear congruential generator or use the `seedrandom` package. This satisfies RAND-01.

## Testing Strategy

### Unit tests (phases.test.ts, roles.test.ts)

Pure functions tested in isolation:

- `assignRoles(players, seed)` — correct counts per player count, deterministic with seed
- `getVisibility(role, assignments)` — each role sees correct players
- `resolveVotes(votes)` — majority/tie/unanimous
- `resolveQuest(cards, failsRequired)` — 4th quest 2-fail rule at 7+ players

### Flow integration tests (avalon-game.test.ts)

Drive `AvalonGame` through the `Game` interface using test helpers:

```typescript
function playQuest(game, { leader, team, votes, questCards }) {
  game.handleResponse(leader, { team })
  for (const [id, vote] of Object.entries(votes))
    game.handleResponse(id, { vote })
  for (const [id, success] of Object.entries(questCards))
    game.handleResponse(id, { success })
}
```

Wait — with the generator interface, there's no `handleResponse`. Tests drive the generator directly via a thin wrapper or the same `play()` method. The test helper above is pseudo-code for:

```typescript
function driveQuest(gen, { leader, team, votes, questCards }) {
  gen.next({ playerId: leader, action: { team } })
  for (const [id, vote] of Object.entries(votes))
    gen.next({ playerId: id, action: { vote } })
  for (const [id, success] of Object.entries(questCards))
    gen.next({ playerId: id, action: { success } })
}
```

Test cases:
- Good wins: 3 successful quests + failed assassination
- Evil wins: 3 failed quests
- Evil wins: successful assassination after 3 good quests
- Evil wins: 5 consecutive vote rejections
- Vote rejection advances leader, resets on quest completion
- 4th quest requires 2 fails at 7+ players
- Null actions use defaults

### Engine integration (1-2 smoke tests)

Run `Engine` with scripted `Player` stubs to confirm the full loop works end-to-end with the new interface.

## Doc Updates

After implementation, update:
- `docs/architecture.md` — new Game interface, Avalon in project structure, remove 4-method interface
- `docs/implementing-a-game.md` — generator pattern as the standard, update CoinFlip example
- `docs/game-loop.md` — update lifecycle diagram
- `README.md` — reflect Phase 2 status

## Requirements Coverage

| Requirement | Covered by |
|-------------|-----------|
| AVLN-01: Role assignment | `roles.ts` + role assignment tests |
| AVLN-02: Team proposal | `teamBuilding` sub-generator |
| AVLN-03: Team voting | `collectVotes` sub-generator |
| AVLN-04: Quest phase | `runQuest` sub-generator |
| AVLN-05: Game end conditions | Main loop + 5-reject check |
| AVLN-06: Merlin assassination | `assassination` sub-generator |
| AVLN-07: Role-specific visibility | `getVisibility` in roles.ts |
| AVLN-08: Player view isolation | `viewFor()` in views.ts |
| RAND-01: Seeded PRNG | `config.seed` for role assignment + leader |

## Implementation Order

1. Change `Game` interface + `Engine` + all existing tests (framework)
2. Implement Avalon: roles, constants, schemas, phases, views, game flow
3. Test Avalon: unit + flow + engine integration
4. Update docs
