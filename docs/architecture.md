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
     │            GameEvent (via onEvent listener)       │
     ├─────────────────────────────────────────────────▶│
```

## Engine (`src/core/engine.ts`)

Mediator. Owns the game loop.

- Calls `game.play(config)` to get a generator
- Drives the generator with `.next()` — first call starts the game, subsequent calls deliver player responses
- **Diffs requests** — each yield returns ALL current requests; engine only sends new ones (keyed by `playerId`)
- **Validates** responses via `actionSchema.safeParse()` with retry (3 attempts), passes `null` on exhaustion
- Emits events via `onEvent()` listeners (e.g., Recorder for JSONL logging)
- Stops when `pending.size === 0` (returns null) or generator completes (returns `GameOutcome`)

## Game (`src/core/game.ts`)

Generator-based state machine. The `play()` method is a generator that yields `GameResponse` objects and returns a `GameOutcome` when the game ends.

| Export | Purpose |
|---|---|
| `Game` | Interface — `optionsSchema` + `play(config): GameFlow` |
| `GameFlow` | `Generator<GameResponse, GameOutcome, PlayerAction>` |
| `PlayerAction` | `{ playerId: string; action: unknown }` — passed to generator via `.next()` |

Each `yield` sends requests + events to the engine. Each `.next(playerAction)` delivers one player's validated response. Generator completion signals the game is terminal; the return value is the outcome.

## Player (`src/core/player.ts`)

Agent. Single method: `act(request) → Promise<unknown>`.

Receives `ActionRequest` with `playerId`, `view` (game-specific, opaque), and `actionSchema` (Zod).

## Discussion (`src/core/discussion.ts`)

Modular discussion system. Games delegate discussion via `yield*` to a `Discussion` implementation. Events emitted per round during discussion.

- **`Discussion`** — Interface: `run(gameId, playerIds, contexts, options?)` returns `AsyncGenerator`. Per-player contexts support hidden information.
- **`BroadcastDiscussion`** — Multi-round parallel broadcast. All players speak or pass each round. Configurable `maxRounds` and `prompt`. Early exit when all pass.
- **`DiscussionStatement`** — `{ playerId, content, lastSeen? }`. `lastSeen` is logging metadata, not sent to players.

## Recorder (`src/core/recorder.ts`)

JSONL writer backed by Pino. Sync mode for predictable ordering.

## Concurrency

- All players act in parallel via `Promise.race`
- Engine processes the first response that resolves
- Remaining pending requests stay active
- Game may return overlapping requests — engine skips duplicates
- **Parallel collection**: When multiple players act simultaneously, the generator buffers responses via a `while` loop, yielding `{ requests: [], events: [] }` (no-ops) until all responses are collected. The engine continues dispatching pending responses via `Promise.race`.

## AI Game (`src/games/ai_game/`)

LLM-powered Game implementation. Instead of hard-coding game rules in TypeScript, it feeds a markdown rules document to an LLM and asks it to manage game state.

- **`ai-game.ts`** — `AIGame` implements `Game`. Constructor takes `rulesDoc` + optional `model` string (default: `'google:gemini-2.5-flash'`). Uses Vercel AI SDK `generateText()` with forced tool use for structured output.
- **`prompts.ts`** — System prompt and message builders for game master LLM calls.
- **`schemas.ts`** — `LLMGameResponseSchema` (Zod) + `jsonSchemaToZod` converter (LLM produces JSON Schema for action validation; this converts it back to Zod at runtime).

## Avalon (`src/games/avalon/`)

Native Game implementation for The Resistance: Avalon. Deterministic game logic — no LLMs.

- **`types.ts`** — Types, Zod schemas, lookup tables (team counts, quest configs, role configs), `assignRoles()`, `buildView()`
- **`avalon.ts`** — `Avalon` implements `Game`. Generator-based: team proposal → vote → quest → assassination.
- **`avalon.test.ts`** — Deterministic tests with `scriptedPlayers` helper.

## LLM Player (`src/players/llm-player.ts`)

LLM-powered Player implementation. Receives an `ActionRequest` and uses the Vercel AI SDK's `generateText()` with forced tool use to get a structured action from the LLM. Supports optional `persona` string and configurable model via `'provider:model'` string (default: `'google:gemini-2.5-flash'`). Stateless per request.

## Provider Registry (`src/core/llm-registry.ts`)

Shared provider registry built with Vercel AI SDK's `createProviderRegistry()`. Registers Google (Gemini) as the sole provider. Resolves `'google:model'` strings (e.g., `'google:gemini-2.5-flash'`) to model instances. API key is read from `GEMINI_API_KEY` environment variable.

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
│   ├── llm-registry.ts       # Provider registry (AI SDK)
│   └── *.test.ts             # Co-located tests
│
├── games/
│   ├── avalon/               # Native Avalon implementation
│   │   ├── types.ts          # Types, schemas, tables, assignRoles, buildView
│   │   ├── avalon.ts         # Avalon implements Game
│   │   └── avalon.test.ts    # Deterministic tests
│   │
│   └── ai_game/              # LLM-powered Game implementation
│       ├── ai-game.ts        # AIGame implements Game
│       ├── prompts.ts        # Prompt builders
│       ├── schemas.ts        # LLM response schema + JSON Schema ↔ Zod
│       └── *.test.ts         # Co-located tests
│
├── players/                  # Player implementations
│   └── llm-player.ts         # LLM-backed agent
│
rules/                        # Markdown rules documents for AIGame
├── tic-tac-toe.md
└── avalon.md
```

## Anti-Patterns

- **Game logic in Engine** — all game rules live in the Game implementation, never in Engine
- **Global mutable state** — each game holds its own state; each Engine instance is independent
- **Player knowing about specific games** — Player receives opaque view + schema, no game-specific logic
- **Untyped LLM responses** — always validate with `actionSchema.parse()`; never cast `as ActionType`
- **Synchronous batch** — use `Promise.allSettled` + `p-limit`; respect API rate limits
