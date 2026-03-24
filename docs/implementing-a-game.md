# Implementing a Game

Build a class implementing `Game`. The framework handles player communication, validation, logging, and concurrency.

## Interface

```typescript
interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): GameResponse
  handleResponse(playerId: string, action: unknown): GameResponse
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}
```

## Minimal Example: Coin Flip

```typescript
import { z } from 'zod'
import type { Game } from './core/game.js'
import type { GameConfig, GameResponse, GameOutcome } from './core/types.js'
import type { GameEvent } from './core/events.js'

const CallSchema = z.enum(['heads', 'tails'])

class CoinFlip implements Game {
  readonly optionsSchema = z.object({})
  private gameId = ''
  private playerId = ''
  private result: 'heads' | 'tails' = 'heads'
  private done = false

  init(config: GameConfig): GameResponse {
    this.gameId = config.gameId
    this.playerId = config.players[0].id
    this.result = Math.random() > 0.5 ? 'heads' : 'tails'
    return {
      requests: [{
        playerId: this.playerId,
        view: { message: 'Call it: heads or tails' },
        actionSchema: CallSchema,
      }],
      events: [this.event({ type: 'flip', result: this.result })],
    }
  }

  handleResponse(playerId: string, action: unknown): GameResponse {
    const call = action as 'heads' | 'tails'
    this.done = true
    return {
      requests: [],
      events: [this.event({ type: 'result', call, won: call === this.result })],
    }
  }

  isTerminal() { return this.done }

  getOutcome(): GameOutcome | null {
    if (!this.done) return null
    return { scores: { [this.playerId]: this.done ? 1 : 0 } }
  }

  private event(data: unknown): GameEvent {
    return { source: 'game', gameId: this.gameId, data, timestamp: new Date().toISOString() }
  }
}
```

## Checklist

- [ ] **State is internal** — never expose full state through `view`
- [ ] **`view` is per-player** — only show what that player should see
- [ ] **Return ALL current requests** from `init()` and `handleResponse()` — engine diffs
- [ ] **Handle `null` actions** — engine sends null when validation retries exhausted; apply a default
- [ ] **`actionSchema` is a Zod schema** — describes what the player can do
- [ ] **Events are self-describing** — use `data.type` to distinguish (e.g., `round-result`, `role-assigned`)
- [ ] **`isTerminal()` is idempotent** — engine may call it multiple times

## Patterns

### Parallel: Collecting All Responses

All players act simultaneously. Buffer responses, resolve when all are in:

```typescript
private guesses: Record<string, number> = {}

handleResponse(playerId: string, action: unknown): GameResponse {
  this.guesses[playerId] = action as number
  if (Object.keys(this.guesses).length < this.playerCount) {
    return { requests: [], events: [] }
  }
  // All in — resolve round...
}
```

### Sequential: Turn-Based

Return one request at a time. Engine only has one pending:

```typescript
handleResponse(playerId: string, action: unknown): GameResponse {
  // process action...
  return {
    requests: [{ playerId: this.getNextPlayer(), view: ..., actionSchema: ... }],
    events: [...],
  }
}
```

### Mixed Phases

Switch between parallel and sequential by varying requests:

```typescript
// Proposal: one player
requests: [{ playerId: leader, ... }]

// Voting: all players
requests: players.map(id => ({ playerId: id, ... }))

// Quest: team members only
requests: team.map(id => ({ playerId: id, ... }))
```

## Running Your Game

```typescript
import { Engine } from './core/engine.js'
import { Recorder } from './core/recorder.js'

const game = new CoinFlip()
const recorder = new Recorder('game-1', '/tmp/coinflip.jsonl')
const players = new Map([['p1', somePlayer]])
const config = { gameId: 'game-1', seed: 42, players: [{ id: 'p1', name: 'Alice' }] }

const outcome = await new Engine(recorder).run(game, players, config)
recorder.flush()
```
