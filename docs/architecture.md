# Architecture

## Data Flow

```
Game events:     Game ──▶ Engine (stamps seq/gameId/ts) ──▶ listeners ──▶ Recorder/Artifacts
Player actions:  Player.act() ──▶ Engine (stamps seq/gameId/ts) ──▶ listeners ──▶ Recorder/Artifacts
Private events:  Player emits raw data ──▶ runGame wires ──▶ Artifacts (players/{id}.jsonl)
```

Games yield `events: unknown[]` (raw data). The engine wraps each into a `GameSourceEvent` with `seq`, `gameId`, `timestamp`. Player actions are wrapped into `PlayerSourceEvent` the same way. Player private events (e.g., LLM reasoning) bypass the engine entirely — `runGame` wires them to artifacts.

## Engine (`src/core/engine.ts`)

Mediator. Owns the game loop. Constructed with `new Engine(gameId)`.

- Calls `game.play(playerIds)` to get a generator via `run(game, players)`
- Drives the generator with `.next()` — first call starts the game, subsequent calls deliver player responses
- **Diffs requests** — each yield returns ALL current requests; engine only sends new ones (keyed by `playerId`)
- **Passes raw actions** to the game without validation — games validate themselves
- **Stamps `seq`, `gameId`, `timestamp`** on all events before emitting
- Emits events via `onEvent()` listeners (e.g., Recorder for JSONL logging)
- Stops when `pending.size === 0` (returns null) or generator completes (returns `GameOutcome`)

## Game (`src/core/game.ts`)

Generator-based state machine. The `play()` method is a generator that yields `GameResponse` objects and returns a `GameOutcome` when the game ends.

| Export | Purpose |
|---|---|
| `Game` | Interface — `play(playerIds: string[]): GameFlow` |
| `GameFlow` | `Generator<GameResponse, GameOutcome, PlayerAction>` |
| `PlayerAction` | `{ playerId: string; action: unknown }` — passed to generator via `.next()` |

Each `yield` sends `{ requests, events: unknown[] }` to the engine. Events are raw data — the engine stamps them. Each `.next(playerAction)` delivers one player's raw response. The game is responsible for validating actions. Generator completion signals the game is terminal; the return value is the outcome.

## Player (`src/core/player.ts`)

Agent. Single method: `act(request) → Promise<unknown>`.

Receives `ActionRequest` with `playerId`, `view` (game-specific, opaque), and `actionSchema` (Zod).

## Discussion (`src/core/discussion.ts`)

Modular discussion system. Games delegate discussion via `yield*` to a `Discussion` implementation. Events emitted per round during discussion.

- **`Discussion`** — Interface: `run(playerIds, contexts, options?)` returns `AsyncGenerator`. Per-player contexts support hidden information.
- **`BroadcastDiscussion`** — Multi-round parallel broadcast. All players speak or pass each round. Configurable `maxRounds` and `prompt`. Early exit when all pass.
- **`DiscussionStatement`** — `{ playerId, content }`. Flat ordered list of who said what.

## Recorder (`src/core/recorder.ts`)

JSONL writer backed by Pino. Sync mode for predictable ordering.

## GameArtifacts (`src/core/artifacts.ts`)

Organizes all game run outputs into a directory. Creates the directory structure, writes `config.json` on creation, records events and player traces during the game, and writes the outcome after.

### Output directory layout

```
{outputDir}/
  config.json          # Game config snapshot
  events.jsonl         # All GameEvents (sync append)
  outcome.json         # GameOutcome (written after game ends)
  players/
    {playerId}.jsonl   # Raw private data per turn (shape defined by player impl)
```

## runGame (`src/core/run-game.ts`)

Single entry point for running a game with artifact collection. Creates Engine, GameArtifacts, wires event listeners, runs the game, writes the outcome.

```typescript
const result = await runGame({
  gameId: 'avalon-1',
  game: new Avalon({ seed: 42 }),
  players: [new LLMPlayer('alice', 'Alice', { persona: '...' }), ...],
  outputDir: './output/avalon-1',
})
// result.outcome, result.outputDir
```

## Concurrency

- All players act in parallel via `Promise.race`
- Engine processes the first response that resolves
- Remaining pending requests stay active
- Game may return overlapping requests — engine skips duplicates
- **Parallel collection**: When multiple players act simultaneously, the generator buffers responses via a `while` loop, yielding `{ requests: [], events: [] }` (no-ops) until all responses are collected. The engine continues dispatching pending responses via `Promise.race`.

## AI Game (`src/games/ai_game/`)

LLM-powered Game implementation. Instead of hard-coding game rules in TypeScript, it feeds a markdown rules document to an LLM and asks it to manage game state.

- **`ai-game.ts`** — `AIGame` implements `Game`. Constructor takes `rulesDoc` + `{ gameId, seed, model?, gameOptions? }`. Uses Vercel AI SDK `generateText()` with forced tool use for structured output.
- **`prompts.ts`** — System prompt and message builders for game master LLM calls.
- **`schemas.ts`** — `LLMGameResponseSchema` (Zod) + `jsonSchemaToZod` converter (LLM produces JSON Schema for action validation; this converts it back to Zod at runtime).

## Avalon (`src/games/avalon/`)

Native Game implementation for The Resistance: Avalon. Deterministic game logic — no LLMs.

- **`types.ts`** — Types, Zod schemas, lookup tables, `AvalonEventData` typed event union, `assignRoles()`, `buildView()`
- **`avalon.ts`** — `Avalon` implements `Game`. Constructor takes `{ seed?, discussion? }`. Generator-based: team proposal → vote → quest → assassination.
- **`avalon.test.ts`** — Deterministic tests with `scriptedPlayers` helper.

## LLM Player (`src/players/llm-player.ts`)

LLM-powered Player implementation with persistent memory and chain-of-thought reasoning. Each turn, the LLM receives the game view + its memory, and returns reasoning + updated memory + action via forced tool use.

- **Memory**: Free-form string persisting across `act()` calls. Soft-capped at 300 words via prompt instruction.
- **Chain of thought**: Private reasoning logged each turn, not shared with other players.
- **Persona**: Optional personality + strategy text concatenated into system prompt.
- **Dev visibility**: `getMemory()`, `getLastReasoning()` accessors + `onEvent()` listener (emits raw `{ reasoning, memory, action, lastSeenSeq }`).
- **Schema wrapping**: The game's `actionSchema` is wrapped in `{ reasoning, memory, action }`. Only `action` is returned to the Engine.

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
│   ├── events.ts             # GameEvent types (GameSourceEvent, PlayerSourceEvent)
│   ├── recorder.ts           # JSONL writer via Pino
│   ├── artifacts.ts          # GameArtifacts — output directory + JSONL files
│   ├── run-game.ts           # runGame() free function
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
