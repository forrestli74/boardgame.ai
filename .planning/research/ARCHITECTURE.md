# Architecture Research

**Domain:** AI board game agent framework (TypeScript, turn-based, LLM-driven)
**Researched:** 2026-03-21
**Updated:** 2026-03-22 (aligned with final type system design)
**Confidence:** MEDIUM-HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   GameRunner (single) │ BatchRunner (parallel)            │  │
│  └────────────────────────┬──────────────────────────────────┘  │
├───────────────────────────┼─────────────────────────────────────┤
│                    Orchestration Layer                            │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │                       Engine                               │  │
│  │  (mediator: routes ActionRequests, validates, logs)         │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │                                                        │
│  ┌──────▼──────┐   ┌────────────┐   ┌───────────────────────┐  │
│  │ Game        │   │ EventBus   │   │   Logger / Recorder   │  │
│  │ (state      │   └──────┬─────┘   └───────────────────────┘  │
│  │  machine)   │          │                                      │
│  └─────────────┘          │                                      │
├──────────────────────────┬┴────────────────────────────────────-┤
│                   Player Layer                                    │
│  ┌────────────────────┐  │  ┌────────────────────────────────┐  │
│  │  Player            │  │  │   LLMPlayer                    │  │
│  │  (interface)       │◄─┘  │   AlgoPlayer                   │  │
│  └────────────────────┘     │   HumanPlayer (future)         │  │
│                              └────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                   Game Implementation Layer                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             AvalonGame (implements Game)                    │   │
│  │  Roles │ Phases │ VoteLogic │ QuestLogic │ WinConditions  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `Engine` | Mediator: routes ActionRequests between Game and Players, validates responses via schema, logs to EventBus, tracks pending requests | `Game`, `Player`, `EventBus` |
| `Game` interface | State machine: `init()` returns initial ActionRequests, `handleResponse()` returns new ActionRequests, holds state internally | `Engine` only (via ActionRequest) |
| `Player` interface | Provide an action given an ActionRequest (view + schema) | `Engine` (called by engine) |
| `LLMPlayer` | Format view as prompt, call LLM, parse response, record reasoning | `LLMClient`, `Engine` |
| `EventBus` | Publish game events (action-taken, phase-changed, game-ended, custom) | All components (pub/sub) |
| `Logger / Recorder` | Subscribe to EventBus, write structured JSONL game log | `EventBus`, filesystem |
| `BatchRunner` | Spawn N parallel game instances, aggregate results | `Engine`, filesystem |
| `CLI` | Parse config, wire dependencies, invoke runner | All top-level |
| `AvalonGame` | Implement `Game`: roles, team proposals, voting, quests, Merlin/assassin | `Engine` via `Game` interface |

## Recommended Project Structure

```
src/
├── core/                     # Game-agnostic framework
│   ├── types.ts              # ActionRequest, GameConfig, GameOutcome
│   ├── engine.ts             # Engine — mediator between Game and Player
│   ├── game.ts               # Game interface (state machine)
│   ├── player.ts             # Player interface
│   ├── events.ts             # GameEvent discriminated union + Zod schema
│   └── event-bus.ts          # EventBus — typed pub/sub
│
├── players/                  # Player implementations
│   ├── llm-player.ts         # LLM-backed agent
│   ├── llm-client.ts         # Thin wrapper: OpenAI / Anthropic / etc.
│   └── algo-player.ts        # Deterministic baseline
│
├── games/                    # Game implementations
│   └── avalon/
│       ├── types.ts          # AvalonState, AvalonAction, AvalonRole
│       ├── game.ts           # AvalonGame implements Game
│       ├── phases.ts         # Phase state machine
│       ├── roles.ts          # Role assignment logic
│       └── prompts.ts        # LLM prompt templates per phase
│
├── runner/
│   ├── game-runner.ts        # Run a single game
│   └── batch-runner.ts       # Run N games in parallel
│
├── logging/
│   ├── recorder.ts           # EventBus subscriber → writes JSONL via Pino
│   └── schema.ts             # GameLogEntry Zod schema
│
└── cli/
    ├── index.ts              # Entry point
    └── config.ts             # Config schema and loader
```

### Structure Rationale

- **core/**: Zero game-specific code. No generics — all types use `unknown` at boundaries. Zod schemas validate at runtime.
- **players/**: Isolated from game rules. Player receives ActionRequest with opaque view, returns action validated by schema.
- **games/avalon/**: All Avalon-specific logic. State is internal to AvalonGame. The engine sees only ActionRequests and responses.
- **runner/**: Thin orchestration. One Engine instance per game.
- **logging/**: Subscriber-only. Never mutates game state. Writes structured JSONL.
- **cli/**: Config wiring only.

## Architectural Patterns

### Pattern 1: Game as State Machine (no generics)

The Game interface has no type parameters. State is internal. The game produces ActionRequests and reacts to responses.

```typescript
interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): ActionRequest[]
  handleResponse(playerId: string, action: unknown): ActionRequest[]
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}
```

### Pattern 2: Engine as Mediator

Engine sits between Game and Player. Neither knows about the other. Engine handles validation, logging, and pending request tracking.

```typescript
class Engine {
  async run(game: Game, players: Map<string, Player>, config: GameConfig) {
    let requests = game.init(config)
    const pending = new Map()

    while (true) {
      for (const req of requests) {
        if (pending.has(req.playerId)) {
          console.warn(`Warning: new request for ${req.playerId} while pending`)
          continue
        }
        pending.set(req.playerId, player.act(req).then(...))
      }
      if (pending.size === 0) break

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)
      const parsed = response.request.actionSchema.parse(response.action)
      eventBus.emit(...)
      requests = game.handleResponse(response.playerId, parsed)
    }
    return game.getOutcome()
  }
}
```

### Pattern 3: ActionRequest as the Only Message Type

Game and Player communicate via ActionRequest only. No separate notify messages. Players get updated state in their next request's view.

```typescript
interface ActionRequest {
  playerId: string
  view: unknown          // game constructs, player consumes
  actionSchema: ZodSchema // describes valid response shape
}

interface Player {
  readonly id: string
  readonly name: string
  act(request: ActionRequest): Promise<unknown>
}
```

### Pattern 4: Event-Based Logging (fire-and-forget)

EventBus is for dev logging, not game flow. Engine emits events; Recorder subscribes and writes JSONL. Game never touches EventBus directly.

### Pattern 5: Dependency Injection via Constructor

All components receive dependencies via constructor. No DI framework needed at this scale.

## Data Flow

### Single Game Execution

```
CLI → GameRunner → Engine.run()
                        │
                        ▼
                   game.init(config) → ActionRequest[]
                        │
                        ▼ (loop)
                   send ActionRequests to Players
                        │
                        ▼
                   await Promise.race(pending)
                        │
                        ▼
                   actionSchema.parse(response)
                        │
                        ├──→ eventBus.emit('action-taken', ...)
                        │        │
                        │        └──→ Recorder writes JSONL
                        ▼
                   game.handleResponse(playerId, action) → new ActionRequest[]
                        │
                        ▼
                   pending empty? → game.getOutcome()
```

### Batch Execution

```
CLI → BatchRunner
          │
          ├── Promise.allSettled([
          │     Engine.run(new AvalonGame(), players, config1),
          │     Engine.run(new AvalonGame(), players, config2),
          │     ...N games (one Game instance per game)
          │   ])
          │
          ▼
      Aggregate results → batch manifest
```

## Anti-Patterns

### Anti-Pattern 1: Avalon Logic Leaking into Engine

All game rules live in `AvalonGame.handleResponse()`. Engine only routes ActionRequests and validates responses.

### Anti-Pattern 2: Global Mutable State

Each game holds its own state. Each Engine instance is independent. No shared mutable state between games in batch mode.

### Anti-Pattern 3: LLMPlayer Knowing About Avalon

`LLMPlayer.act()` receives an opaque view and a schema. It formats the view into a prompt and parses the response against the schema. No game-specific logic in Player.

### Anti-Pattern 4: Untyped LLM Response Parsing

Always validate with `actionSchema.parse()`. If invalid, retry with clarification. Never cast `as ActionType` without schema validation.

### Anti-Pattern 5: Synchronous Batch Execution

Use `Promise.allSettled` with configurable concurrency (`p-limit`). Respect LLM provider rate limits.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LLM API (OpenAI, Anthropic) | `LLMClient` wrapper in `players/llm-client.ts` | Abstract behind interface; env vars for API keys |
| Filesystem (game logs) | `Recorder` writes JSONL to configured output dir | One file per game |
| Environment config | Zod schema in `cli/config.ts` | Validate at startup, fail fast |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `Engine` ↔ `Game` | `init()` / `handleResponse()` returning `ActionRequest[]` | Game is a state machine |
| `Engine` ↔ `Player` | `player.act(request)` returning `Promise<unknown>` | Async; LLM calls happen here |
| `Engine` → `EventBus` | `eventBus.emit(event)` fire-and-forget | Engine does not await listeners |
| `Recorder` ← `EventBus` | `eventBus.on(type, handler)` | Passive listener; async Pino writes |
| `BatchRunner` → `Engine` | One Engine + Game instance per game | Fully isolated; no shared state |

## Sources

- [AvalonBench: Evaluating LLMs Playing the Game of Avalon (arxiv)](https://arxiv.org/pdf/2310.05036)
- [A Turn-Based Game Loop (stuffwithstuff.com)](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/)
- [Game Programming Patterns — Architecture](https://gameprogrammingpatterns.com/architecture-performance-and-games.html)

---
*Architecture research for: TypeScript AI board game agent framework (Avalon)*
*Researched: 2026-03-21, Updated: 2026-03-22*
