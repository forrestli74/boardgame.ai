# Architecture

## Data Flow

```
┌──────────┐     ┌────────┐     ┌──────────┐     ┌──────────┐
│  Engine   │────▶│  Game   │     │  Player  │     │ Recorder │
│ (mediator)│◀────│ (state) │     │  (agent) │     │  (JSONL)  │
└──────────┘     └────────┘     └──────────┘     └──────────┘
     │                                │                 ▲
     │         ActionRequest          │                 │
     ├───────────────────────────────▶│                 │
     │         action (unknown)       │                 │
     │◀──────────────────────────────┤                 │
     │                                                  │
     │            GameEvent                             │
     ├─────────────────────────────────────────────────▶│
```

## Engine (`src/core/engine.ts`)

Mediator. Owns the game loop.

- Calls `game.init(config)` to start
- Sends `ActionRequest` to players, collects responses
- **Diffs requests** — game returns ALL current requests; engine only sends new ones (keyed by `playerId`)
- **Validates** responses via `actionSchema.safeParse()` with retry (3 attempts), passes `null` on exhaustion
- Records all events via Recorder
- Stops when `pending.size === 0` or `game.isTerminal()`

## Game (`src/core/game.ts`)

State machine. Holds all game state internally.

| Method | Purpose |
|---|---|
| `init(config)` | Setup, return initial requests + events |
| `handleResponse(playerId, action)` | Process action, return new requests + events |
| `isTerminal()` | Is the game over? |
| `getOutcome()` | Final scores (null if not terminal) |
| `optionsSchema` | Zod schema for game-specific config |

## Player (`src/core/player.ts`)

Agent. Single method: `act(request) → Promise<unknown>`.

Receives `ActionRequest` with `playerId`, `view` (game-specific, opaque), and `actionSchema` (Zod).

## Recorder (`src/core/recorder.ts`)

JSONL writer backed by Pino. Sync mode for predictable ordering.

## Concurrency

- All players act in parallel via `Promise.race`
- Engine processes the first response that resolves
- Remaining pending requests stay active
- Game may return overlapping requests — engine skips duplicates

## Project Structure

```
src/
├── core/                     # Game-agnostic framework
│   ├── types.ts              # ActionRequest, GameConfig, GameOutcome
│   ├── engine.ts             # Engine — mediator
│   ├── game.ts               # Game interface
│   ├── player.ts             # Player interface
│   ├── events.ts             # GameEvent discriminated union
│   ├── recorder.ts           # JSONL writer via Pino
│   └── *.test.ts             # Co-located tests
│
├── players/                  # Player implementations (Phase 3+)
│   └── llm-player.ts         # LLM-backed agent
│
├── games/                    # Game implementations (Phase 2+)
│   └── avalon/
│       ├── game.ts           # AvalonGame implements Game
│       ├── roles.ts          # Role assignment
│       └── prompts.ts        # Role-specific prompts
│
├── runner/                   # Execution (Phase 4–5)
│   ├── game-runner.ts
│   └── batch-runner.ts
│
└── cli/                      # CLI entry point (Phase 4)
    └── index.ts
```

## Anti-Patterns

- **Avalon logic in Engine** — all game rules live in the Game implementation, never in Engine
- **Global mutable state** — each game holds its own state; each Engine instance is independent
- **LLMPlayer knowing about Avalon** — Player receives opaque view + schema, no game-specific logic
- **Untyped LLM responses** — always validate with `actionSchema.parse()`; never cast `as ActionType`
- **Synchronous batch** — use `Promise.allSettled` + `p-limit`; respect API rate limits
