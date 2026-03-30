# Implementing a Game

Build a class implementing `Game`. The framework handles player communication, validation, logging, and concurrency.

## Interface

```typescript
import type { GameResponse, GameOutcome } from './core/types.js'

type PlayerAction = { playerId: string; action: unknown }
type GameFlow = AsyncGenerator<GameResponse, GameOutcome, PlayerAction>

interface Game {
  play(playerIds: string[]): GameFlow
}
```

The `play()` method returns an async generator:
- **`yield`** sends `{ requests, events: unknown[] }` to the engine — events are raw data, the engine stamps `seq`, `gameId`, `timestamp`
- **`.next(playerAction)`** receives one player's raw response
- **`return`** produces the final `GameOutcome` and ends the game

## Minimal Example: Coin Flip

```typescript
import { z } from 'zod'
import type { Game, GameFlow } from './core/game.js'

const CallSchema = z.enum(['heads', 'tails'])

class CoinFlip implements Game {
  play(playerIds: string[]): GameFlow {
    const playerId = playerIds[0]
    const result = Math.random() > 0.5 ? 'heads' : 'tails'

    return (async function* () {
      const { action } = yield {
        requests: [{
          playerId,
          view: { message: 'Call it: heads or tails' },
          actionSchema: CallSchema,
        }],
        events: [{ type: 'flip', result }],
      }

      const call = (action ?? result) as 'heads' | 'tails'
      return { scores: { [playerId]: call === result ? 1 : 0 } }
    })()
  }
}
```

Events are raw data objects — no `source`, `gameId`, or `timestamp`. The engine stamps those. For compile-time safety, define a typed event union for your game (see Avalon's `AvalonEventData` for the pattern).

## Checklist

- [ ] **State is internal** — never expose full state through `view`
- [ ] **`view` is per-player** — only show what that player should see
- [ ] **Yield ALL current requests** — engine diffs against pending
- [ ] **Validate player actions** — engine passes raw actions; use `actionSchema.safeParse()` to validate and re-request on failure
- [ ] **`actionSchema` is a Zod schema** — describes what the player can do
- [ ] **Events are self-describing** — use `data.type` to distinguish (e.g., `round-result`, `role-assigned`)
- [ ] **Generator returns `GameOutcome`** — `{ scores: Record<string, number> }`
- [ ] **Don't yield with empty requests after last player acts** — engine returns null when `pending.size === 0`

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
*play(config: GameConfig) {
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
import { runGame } from './core/run-game.js'

const result = await runGame({
  gameId: 'game-1',
  game: new CoinFlip(),
  players: [somePlayer],
  outputDir: './output/game-1',
})
// result.outcome, result.outputDir
```
