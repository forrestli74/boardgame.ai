# Discussion Module

## Goal

Add a modular discussion system to core. Games delegate discussion via `yield*`. Implementations are swappable. First implementation: `BroadcastDiscussion` (multi-round, parallel, pass-to-drop-out).

## Interface (`src/core/discussion.ts`)

```typescript
interface DiscussionOptions {
  firstSpeakers?: string[]  // hint: these players speak first in round ordering
}

interface DiscussionStatement {
  playerId: string
  content: string
}

interface DiscussionResult {
  rounds: DiscussionStatement[][]  // statements grouped by round
}

interface Discussion {
  run(
    playerIds: string[],
    context: unknown,
    options?: DiscussionOptions,
  ): AsyncGenerator<GameResponse, DiscussionResult, PlayerAction>
}
```

- `context` — opaque game state passed to players as part of their view. The discussion module doesn't interpret it.
- `firstSpeakers` — hint for ordering. Implementation decides how to use it (e.g., put them first in the request array).
- `DiscussionResult.rounds` — grouped by round for logging/analysis. Games can flatten if they don't care.

## BroadcastDiscussion

```typescript
class BroadcastDiscussion implements Discussion {
  constructor(private maxRounds: number = 3) {}
}
```

### Flow

- **Round 1**: All players must speak (mandatory, no passing)
- **Round 2 to maxRounds**: All players speak or pass (parallel)
- **Early exit**: All players pass in a round → discussion ends
- **Parallel**: Each round collects all statements simultaneously using the standard parallel collection pattern

### Action Schema

```typescript
const DiscussionStatementSchema = z.object({
  statement: z.string(),  // empty string = pass (round 2+)
})
```

Round 1: empty string is treated as a statement (player chose to say nothing meaningful, but it still counts — no re-prompt).

Round 2+: empty string = pass, player drops out of subsequent rounds.

### Player View

Each player receives:
```typescript
{
  context: unknown,          // game-provided context (e.g., game state)
  round: number,             // current round (0-indexed)
  maxRounds: number,
  previousRounds: DiscussionStatement[][],  // all prior rounds
  canPass: boolean,          // false for round 1, true after
}
```

### firstSpeakers Behavior

Players in `firstSpeakers` are placed first in the request array for each round. The Engine dispatches them first, which means their statements tend to appear first in the parallel collection. This is a soft ordering hint, not a guarantee.

## Integration with Avalon

Avalon takes an optional `Discussion` in its constructor:

```typescript
class Avalon implements Game {
  constructor(private discussion?: Discussion) {}
}
```

In the game flow, before each team vote:

```typescript
// Discussion phase (if configured)
if (self.discussion) {
  const result = yield* self.discussion.run(
    playerIds,
    buildDiscussionContext(state),
    { firstSpeakers: [leader.id] },
  )
  // Emit discussion events
  for (const round of result.rounds) {
    pendingEvents.push(event(gameId, { type: 'discussion-round', statements: round }))
  }
}

// Then proceed to team vote...
```

Discussion is optional — Avalon works without it (current behavior). This is a non-breaking change.

## Events

- `discussion-round` — emitted per round, contains `DiscussionStatement[]`

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
