# Type System Design

## Problem: What types does each board game define?

Per board game, three concerns exist:

| Concern | Example (Avalon) | Purpose |
|---------|-----------------|---------|
| **State** | `AvalonState` | All game data including secrets — internal to game class |
| **Player view** | What one player sees | Passed as `unknown` through framework |
| **Action** | `AvalonAction` (union of propose, vote, quest, etc.) | What a player can do |

### Type flow

```
Game (holds state internally)
  │
  ├── getContext() ──► ActionRequest { view: unknown, actionSchema: ZodSchema }
  │                          │
  │                          ▼
  │                    Player.act(request) ──► unknown (action)
  │                                                │
  └── handleResponse(playerId, action) ◄───────────┘
       returns GameResponse { requests, events }
```

### Key decisions

**No generics in framework types.** The app supports different games at runtime — compile-time generics can't help. Zod schemas handle validation at runtime instead.

**State inside Game.** No `GameState<S>` wrapper or brand tags. Encapsulation enforces the information boundary — internal state never leaves the class, only views go out through `ActionRequest`. Deferred to v2: `clone()` for replay/history, state serialization.

**PlayerView is per-game.** Not a framework type. Each game constructs its own view shape and passes it as `unknown` through `ActionRequest`. The player (LLM) serializes whatever it receives — doesn't need to know the shape at compile time.

**ActionSchema replaces getValidActions.** Some actions have infinite options (propose a team, make a statement). A Zod schema describes constraints without enumerating. Also doubles as the validation layer for player responses.

**GameConfig options validated by game.** Framework has `options?: unknown`. Game provides `optionsSchema` (Zod) for validation. Game-specific config stays out of framework types.

**GameOutcome uses scores, not winner.** `scores: Record<string, number>` covers all cases — faction-based (Avalon), individual (ranking), draws (Chess 0.5/0.5).

---

## Framework types

```typescript
interface ActionRequest {
  readonly playerId: string
  readonly view: unknown
  readonly actionSchema: ZodSchema
}

interface GameResponse {
  readonly requests: ActionRequest[]
  readonly events: GameEvent[]
}

interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): GameResponse
  handleResponse(playerId: string, action: unknown): GameResponse
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}

interface Player {
  readonly id: string
  readonly name: string
  act(request: ActionRequest): Promise<unknown>
}
```

### Schemas

```typescript
GameConfig: {
  gameId: string
  seed: integer
  players: [{ id, name, model?, persona? }]
  options?: unknown   // game validates via game.optionsSchema
}

GameOutcome: {
  scores: Record<string, number>   // playerId or team -> points
  metadata?: unknown               // game-specific details
}
```

### Event schema

Two event sources, discriminated by `source` field:

```typescript
// Player did something
{
  source: 'player',
  gameId: string,
  playerId: string,
  data: unknown,
  reasoning?: string,
  timestamp: string,
}

// Game produced something (role assigned, quest result, game ended, etc.)
{
  source: 'game',
  gameId: string,
  data: unknown,      // self-describing, e.g. { type: 'quest-result', ... }
  timestamp: string,
}
```

Events are the log. JSONL is just serialized events. No separate GameLogEntry schema.

### Logging separation

- **Game events** → JSONL file (training data). Player actions and game state transitions.
- **Operational logs** → stderr/Pino (debugging). Network errors, retries, latency.

---

## Engine (custom mediator pattern)

Game is a state machine — produces requests, reacts to responses. Engine routes between Game and Players.

```typescript
class Engine {
  constructor(private recorder: Recorder) {}

  async run(game: Game, players: Map<string, Player>, config: GameConfig): Promise<GameOutcome | null> {
    const pending = new Map<string, Promise<PendingResponse>>()

    const initial = game.init(config)
    this.recordEvents(initial.events)
    let requests = initial.requests

    while (true) {
      // Send new requests only (diff against pending)
      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const promise = players.get(req.playerId)!
            .act(req)
            .then(action => ({ playerId: req.playerId, action, request: req }))
          pending.set(req.playerId, promise)
        }
      }

      if (pending.size === 0) break

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)

      // Structural validation with retry
      const parsed = await this.validateWithRetry(
        response, players.get(response.playerId)!, response.request
      )

      // Record player event
      this.recorder.record({
        source: 'player',
        gameId: config.gameId,
        playerId: response.playerId,
        data: parsed,
        timestamp: new Date().toISOString(),
      })

      // Deliver to game (game handles semantic validation + defaults internally)
      const gameResponse = game.handleResponse(response.playerId, parsed)
      this.recordEvents(gameResponse.events)
      requests = gameResponse.requests

      if (game.isTerminal()) break
    }

    return game.getOutcome()
  }
}
```

### Engine responsibilities

- Tracks pending requests per player (`Map<string, Promise>`)
- Game returns ALL current requests; engine diffs against pending, sends only new ones
- Structural validation via `actionSchema.safeParse()` with retry (infrastructure errors)
- Delivers parsed action to game; game handles semantic validation + defaults
- Records player events (source: 'player') and game events (source: 'game') via Recorder
- Stops when pending is empty or `game.isTerminal()`

### Validation: two layers

1. **Engine (structural)** — `actionSchema.safeParse()`. Failure = LLM/network issue → retry up to N times. On max retries, pass `null` to game.
2. **Game (semantic)** — checks game rules in `handleResponse`. Invalid = bad decision → game applies default action, logs as forced.

### Requests: game returns all, engine diffs

- `init()` and `handleResponse()` return `GameResponse` containing ALL current requests
- Engine diffs by playerId against pending map — only sends new ones
- Existing pending requests stay until resolved
- Game doesn't track what's new — engine handles that
- ActionRequest is immutable; game can cache to avoid redundant context building

---

## Per game, implement

- A class implementing `Game`
- An `optionsSchema` (Zod) for game-specific config validation
- Internal state — framework never sees it
- `init()` returns initial `GameResponse`
- `handleResponse()` returns `GameResponse` with updated requests and any events
