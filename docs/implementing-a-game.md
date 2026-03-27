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

The `play()` method returns a generator:
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

  play(config: GameConfig): GameFlow {
    const playerId = config.players[0].id
    const gameId = config.gameId
    const result = Math.random() > 0.5 ? 'heads' : 'tails'

    return (function* () {
      const { action } = yield {
        requests: [{
          playerId,
          view: { message: 'Call it: heads or tails' },
          actionSchema: CallSchema,
        }],
        events: [event(gameId, { type: 'flip', result })],
      }

      const call = (action ?? result) as 'heads' | 'tails'
      return { scores: { [playerId]: call === result ? 1 : 0 } }
    })()
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
import { Engine } from './core/engine.js'
import { Recorder } from './core/recorder.js'

const game = new CoinFlip()
const recorder = new Recorder('game-1', '/tmp/coinflip.jsonl')
const players = new Map([['p1', somePlayer]])
const config = { gameId: 'game-1', seed: 42, players: [{ id: 'p1', name: 'Alice' }] }

const engine = new Engine()
engine.onEvent((e) => recorder.record(e))
const outcome = await engine.run(game, players, config)
recorder.flush()
```
