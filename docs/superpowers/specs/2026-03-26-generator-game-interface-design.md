# Generator Game Interface

Replace the 4-method `Game` interface with a single generator-based `play()` method.

## Motivation

The current `Game` interface (init, handleResponse, isTerminal, getOutcome) splits game flow across 4 methods. The game author must maintain phase state, track terminal conditions, and store outcomes — all of which the generator pattern handles implicitly. The framework should own this complexity once, not each game.

## Scope

- Replace `Game` interface with generator-based `play()`
- Add `PlayerAction` and `GameFlow` types
- Update `Engine` to drive generators
- Update all existing tests (game.test.ts, engine.test.ts)
- Update docs (architecture.md, implementing-a-game.md, game-loop.md)

Out of scope: Avalon implementation (separate spec), async generator support (AIGameMaster is deleted/WIP — address when it stabilizes).

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

For reference — this is how games will collect parallel responses (e.g., voting). Not implemented in this spec, but the framework must support it.

The generator yields requests for all players, then buffers responses via a `while` loop. Each intermediate `.next()` receives one response and yields `{ requests: [], events: [] }` (no-op). The final response triggers resolution.

```typescript
// Example: collecting votes from all players
private *collectVotes(players: string[]): Generator<GameResponse, VoteResult, PlayerAction> {
  const votes: Record<string, boolean> = {}
  const first = yield {
    requests: players.map(p => ({ playerId: p, view: ..., actionSchema: VoteSchema })),
    events: [],
  }
  votes[first.playerId] = first.action as boolean
  while (Object.keys(votes).length < players.length) {
    const { playerId, action } = yield { requests: [], events: [] }
    votes[playerId] = action as boolean
  }
  return { approved: ..., votes }
}
```

This is the same pattern AIGameMaster uses for response batching — collect all actions before processing. The generator makes the batching explicit in the flow rather than hidden in buffering state.

## Test Updates

### game.test.ts

`MockGame` changes from a class with 4 methods to a class with `play()` returning a generator:

```typescript
class MockGame implements Game {
  readonly optionsSchema = z.object({})

  *play(config: GameConfig): GameFlow {
    const { action } = yield {
      requests: [{ playerId: config.players[0].id, view: {}, actionSchema: z.unknown() }],
      events: [{ source: 'game', gameId: config.gameId, data: { type: 'started' }, timestamp: ts }],
    }
    return { scores: { p1: 1 } }
  }
}
```

Test cases to preserve:
- Can be implemented with internal state
- play() yields GameResponse with requests and events
- Generator return produces GameOutcome
- Has optionsSchema property

### engine.test.ts

All existing tests remain — same behaviors, just the mock games use `play()` generators instead of 4-method classes. Key behaviors to preserve:

- Sends initial requests from first yield to correct players
- Diffs requests against pending — only sends new ones
- Skips duplicate requests for same player
- Validates with actionSchema.safeParse() + retry
- Passes null on max retries exceeded
- Records player events and game events
- Handles parallel requests (multiple players simultaneously)
- Handles sequential requests (one player at a time)
- Stops when pending is empty (returns null)
- Stops when generator completes (returns GameOutcome)

## Doc Updates

### docs/architecture.md

- Update Game interface section with new `play()` / `GameFlow` / `PlayerAction` types
- Remove init/handleResponse/isTerminal/getOutcome from the method table
- Replace with: play() returns generator, yield = requests+events, return = outcome
- Update project structure if file names change

### docs/implementing-a-game.md

- Update interface definition
- Rewrite CoinFlip example as a generator
- Update checklist (remove "isTerminal() is idempotent", add "generator returns GameOutcome")
- Update parallel/sequential/mixed patterns to use generator syntax
- Update "Running Your Game" section

### docs/game-loop.md

- Update lifecycle diagram: remove init/handleResponse/isTerminal steps, replace with gen.next() loop
- Update example walkthrough

## Files Changed

| File | Change |
|------|--------|
| `src/core/game.ts` | Replace interface + add PlayerAction, GameFlow types |
| `src/core/types.ts` | No change (GameResponse, GameConfig, GameOutcome unchanged) |
| `src/core/engine.ts` | Rewrite run() to drive generator |
| `src/core/game.test.ts` | Rewrite MockGame + tests for generator interface |
| `src/core/engine.test.ts` | Rewrite mock games as generators |
| `docs/architecture.md` | Update Game section |
| `docs/implementing-a-game.md` | Rewrite examples + checklist |
| `docs/game-loop.md` | Update lifecycle diagram |
