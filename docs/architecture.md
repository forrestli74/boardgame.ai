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

## AI Game Master (`src/ai-game-master/`)

LLM-powered Game implementation. Instead of hard-coding game rules in TypeScript, it feeds a markdown rules document to an LLM and asks it to manage game state.

- **`game-master.ts`** — `AIGameMaster` implements `Game`. Constructor takes `rulesDoc` + `llmClient`. Each `init()`/`handleResponse()` call sends the full rules + state to the LLM (stateless — no conversation history).
- **`llm-client.ts`** — Thin Anthropic SDK wrapper. Uses forced tool use (`tool_choice: { type: 'tool', name: ... }`) for structured output.
- **`prompts.ts`** — System prompt and message builders for game master LLM calls.
- **`schemas.ts`** — `LLMGameResponseSchema` (Zod) + `jsonSchemaToZod` converter (LLM produces JSON Schema for action validation; this converts it back to Zod at runtime).

## LLM Player (`src/players/llm-player.ts`)

LLM-powered Player implementation. Receives an `ActionRequest`, converts the Zod action schema to JSON Schema via `z.toJSONSchema()`, and uses forced tool use to get a structured action from the LLM. Supports optional `persona` string. Stateless per request.

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
├── ai-game-master/           # LLM-powered Game implementation
│   ├── game-master.ts        # AIGameMaster implements Game
│   ├── llm-client.ts         # Anthropic SDK wrapper with forced tool use
│   ├── prompts.ts            # Prompt builders
│   ├── schemas.ts            # LLM response schema + JSON Schema ↔ Zod
│   └── *.test.ts             # Co-located tests
│
├── players/                  # Player implementations
│   └── llm-player.ts         # LLM-backed agent
│
rules/                        # Markdown rules documents for AIGameMaster
├── tic-tac-toe.md
└── avalon.md
```

## Anti-Patterns

- **Game logic in Engine** — all game rules live in the Game implementation, never in Engine
- **Global mutable state** — each game holds its own state; each Engine instance is independent
- **Player knowing about specific games** — Player receives opaque view + schema, no game-specific logic
- **Untyped LLM responses** — always validate with `actionSchema.parse()`; never cast `as ActionType`
- **Synchronous batch** — use `Promise.allSettled` + `p-limit`; respect API rate limits
