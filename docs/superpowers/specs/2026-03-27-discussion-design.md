# Discussion Module

## Goal

Add a modular discussion system to core. Games delegate discussion via `yield*`. Implementations are swappable. First implementation: `BroadcastDiscussion` (multi-round, parallel, pass-to-drop-out).

## Interface (`src/core/discussion.ts`)

```typescript
interface DiscussionStatement {
  playerId: string
  content: string
  lastSeen?: { playerId: string; content: string }  // last message seen before speaking, for logging/analysis only
}

interface DiscussionResult {
  statements: DiscussionStatement[]  // flat ordered list, mode-agnostic
}

interface DiscussionOptions {
  firstSpeakers?: string[]    // hint: these players speak first in round ordering
}

interface Discussion {
  run(
    gameId: string,
    playerIds: string[],
    contexts: Record<string, unknown>,  // per-player context (keyed by playerId)
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction>
}
```

- `contexts` — per-player opaque game state, keyed by playerId. Each player sees only their own context. Supports games with hidden information (e.g., Avalon role-specific views).
- `firstSpeakers` — hint for ordering. Implementation decides how to use it (e.g., put them first in the request array).
- `DiscussionResult.statements` — flat list, mode-agnostic. Any implementation returns an ordered list of who said what.
- `lastSeen` — metadata for logging/analysis. Records what the player had seen when they spoke. NOT sent to the player (their view already contains previous statements).

## BroadcastDiscussion

```typescript
class BroadcastDiscussion implements Discussion {
  constructor(private maxRounds: number = 3) {}
}
```

### Flow

- **Every round**: All active players speak or pass (parallel)
- **Early exit**: All players pass in a round → discussion ends
- **Parallel**: Each round collects all statements simultaneously using the standard parallel collection pattern

### Action Schema

```typescript
const DiscussionStatementSchema = z.object({
  statement: z.string(),  // empty string = pass
})
```

Empty string = pass. Player who passes drops out of subsequent rounds. If all players pass, discussion ends early.

### Player View

Each player receives:
```typescript
{
  context: unknown,          // per-player game context (e.g., role-specific view)
  round: number,             // current round (0-indexed)
  maxRounds: number,
  previousStatements: { playerId: string; content: string }[],  // all prior statements (no lastSeen)
}
```

`previousStatements` is a flat list of all statements from prior rounds. `lastSeen` is not included — it's internal metadata.

### firstSpeakers Behavior

Players in `firstSpeakers` are placed first in the request array for each round. The Engine dispatches them first, which means their statements tend to appear first in the parallel collection. This is a soft ordering hint, not a guarantee.

### lastSeen Behavior

For `BroadcastDiscussion`:
- Round 1 speakers: `lastSeen` is `undefined` (saw nothing)
- Round 2+ speakers: `lastSeen` is the last statement from the previous round

## Integration with Avalon

Avalon takes an optional `Discussion` in its constructor:

```typescript
class Avalon implements Game {
  constructor(private discussion?: Discussion) {}
}
```

In the game flow, before each team proposal:

```typescript
// Discussion phase (if configured)
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
  // Events already emitted by discussion.run() during each round
  // result.statements available for game logic if needed
}

// Then proceed to team proposal...
```

Discussion is optional — Avalon works without it (current behavior). This is a non-breaking change.

## Events

Events are emitted as the discussion happens — each round's statements are yielded as a `GameEvent` immediately after collection, not batched at the end. This means the `run()` generator yields `{ requests: [...], events: [roundEvent] }` as part of its flow. The calling game does not need to emit discussion events separately.

## Files

```
src/core/
├── discussion.ts              # Discussion interface + BroadcastDiscussion
└── discussion.test.ts         # Unit tests with scripted players

src/games/avalon/
├── avalon.ts                  # Add optional discussion to constructor + flow
└── avalon.test.ts             # Add discussion integration test
```

## Out of Scope

- Reply targets / accusation mechanics (future Discussion implementations)
- Discussion between quest phases
- Per-player discussion history tracking across quests
- LLM prompt engineering for discussion (Phase 3 concern)
