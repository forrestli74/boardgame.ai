# Architecture Research

**Domain:** AI board game agent framework (TypeScript, turn-based, LLM-driven)
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   GameRunner (single) │ BatchRunner (parallel)            │  │
│  └────────────────────────┬──────────────────────────────────┘  │
├───────────────────────────┼─────────────────────────────────────┤
│                    Orchestration Layer                            │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │                     GameEngine<S, A>                       │  │
│  │  (game-agnostic loop: turns, phases, win conditions)       │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │ reads/writes                                           │
│  ┌──────▼──────┐   ┌────────────┐   ┌───────────────────────┐  │
│  │ GameState<S>│   │ EventBus   │   │   Logger / Recorder   │  │
│  └─────────────┘   └──────┬─────┘   └───────────────────────┘  │
├──────────────────────────┬┴────────────────────────────────────-┤
│                   Player Layer                                    │
│  ┌────────────────────┐  │  ┌────────────────────────────────┐  │
│  │  Player<S, A>      │  │  │   LLMPlayer<S, A>              │  │
│  │  (interface)       │◄─┘  │   AlgoPlayer<S, A>             │  │
│  └────────────────────┘     │   HumanPlayer<S, A> (future)   │  │
│                              └────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                   Game Implementation Layer                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             AvalonGame (implements Game<AvalonState>)      │   │
│  │  Roles │ Phases │ VoteLogic │ QuestLogic │ WinConditions  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `GameEngine<S, A>` | Generic turn loop, phase transitions, invokes players for actions | `Game<S>`, `Player<S,A>[]`, `EventBus`, `Logger` |
| `Game<S>` interface | Game-specific rules: initial state, valid actions, state transitions, win check | `GameEngine` only |
| `GameState<S>` | Immutable snapshot of game state at each step; carries public + private views | `GameEngine`, `Player`, `Logger` |
| `Player<S, A>` interface | Provide an action given a player-scoped state view | `GameEngine` (called by engine) |
| `LLMPlayer<S, A>` | Format state as prompt, call LLM, parse response, record reasoning | `LLMClient`, `GameEngine` |
| `EventBus` | Publish game events (phase-change, action-taken, vote-cast, quest-result) | All components (pub/sub) |
| `Logger / Recorder` | Subscribe to EventBus, write structured JSONL game log | `EventBus`, filesystem |
| `BatchRunner` | Spawn N parallel `GameEngine` instances, aggregate results | `GameEngine`, filesystem |
| `CLI` | Parse config, wire dependencies, invoke `GameRunner` or `BatchRunner` | All top-level |
| `AvalonGame` | Implement `Game<AvalonState>`: roles, team proposals, voting, quests, Merlin/assassin | `GameEngine` via `Game<S>` interface |

## Recommended Project Structure

```
src/
├── core/                     # Game-agnostic framework
│   ├── types.ts              # GameState<S>, Action<A>, PlayerView<S>, GameEvent
│   ├── engine.ts             # GameEngine<S, A> — the turn loop
│   ├── game.ts               # Game<S, A> interface
│   ├── player.ts             # Player<S, A> interface
│   └── event-bus.ts          # EventBus — typed pub/sub
│
├── players/                  # Player implementations
│   ├── llm-player.ts         # LLMPlayer<S, A> — LLM-backed agent
│   ├── llm-client.ts         # Thin wrapper: OpenAI / Anthropic / etc.
│   └── algo-player.ts        # AlgoPlayer<S, A> — deterministic baseline
│
├── games/                    # Game implementations
│   └── avalon/
│       ├── types.ts          # AvalonState, AvalonAction, AvalonRole
│       ├── game.ts           # AvalonGame implements Game<AvalonState>
│       ├── phases.ts         # Phase state machine: TeamProposal → Vote → Quest → …
│       ├── roles.ts          # Role assignment, Merlin, Percival, Assassin logic
│       └── prompts.ts        # LLM prompt templates for each phase
│
├── runner/
│   ├── game-runner.ts        # Run a single game, return GameLog
│   └── batch-runner.ts       # Run N games in parallel (Promise.allSettled)
│
├── logging/
│   ├── recorder.ts           # EventBus subscriber → writes GameLog
│   ├── schema.ts             # GameLog, TurnRecord, ReasoningTrace types
│   └── replayer.ts           # Read JSONL log, reconstruct game timeline
│
└── cli/
    ├── index.ts              # Entry point (commander / yargs)
    └── config.ts             # Config schema (zod) and loader
```

### Structure Rationale

- **core/**: Zero game-specific code. `GameEngine` calls only `Game<S>` and `Player<S,A>` interfaces. Swapping Avalon for another game is one import change.
- **players/**: Isolated from game rules. `LLMPlayer` needs no knowledge of Avalon; it formats state and parses actions through game-provided prompt templates.
- **games/avalon/**: All Avalon-specific logic lives here. The phase state machine is internal to `AvalonGame`; the engine sees only `getValidActions()` and `applyAction()`.
- **runner/**: Thin orchestration. `BatchRunner` is a thin parallel wrapper over `GameRunner` — no game logic.
- **logging/**: Subscriber-only. Never mutates game state. Writes structured JSONL for downstream ML pipelines.
- **cli/**: Config wiring only. Constructs dependency graph and delegates.

## Architectural Patterns

### Pattern 1: Generic Game / Player Interfaces

**What:** Parameterize the framework over game state `S` and action type `A`. `GameEngine`, `Player`, and `Game` are all generic.
**When to use:** Always — this is the core extensibility mechanism.
**Trade-offs:** Requires TypeScript generics discipline. Pays off when adding a second game (no framework changes).

```typescript
// core/game.ts
interface Game<S, A> {
  initialState(players: PlayerConfig[]): S
  getPlayerView(state: S, playerId: string): Readonly<Partial<S>>
  getValidActions(state: S, playerId: string): A[]
  applyAction(state: S, playerId: string, action: A): S
  getWinner(state: S): string | null
  isTerminal(state: S): boolean
}

// core/player.ts
interface Player<S, A> {
  readonly id: string
  readonly name: string
  act(view: Readonly<Partial<S>>, validActions: A[]): Promise<A>
}

// core/engine.ts
class GameEngine<S, A> {
  constructor(
    private game: Game<S, A>,
    private players: Player<S, A>[],
    private eventBus: EventBus,
  ) {}
  async run(): Promise<GameResult> { /* turn loop */ }
}
```

### Pattern 2: Immutable State + Event Sourcing

**What:** `applyAction` returns a new state object (never mutates). The `EventBus` emits typed events for each state transition. The `Logger` reconstructs the full game history from events alone.
**When to use:** Always for this domain — enables replay, debugging, and training data generation without coupling the logger to game logic.
**Trade-offs:** Slightly more memory; structurally cloning state is cheap for turn-based games (no 60fps loop).

```typescript
// core/event-bus.ts
type GameEvent =
  | { type: 'action-taken'; playerId: string; action: unknown; reasoning?: string }
  | { type: 'phase-changed'; from: string; to: string }
  | { type: 'game-ended'; winner: string; turns: number }

class EventBus {
  private handlers = new Map<string, ((e: GameEvent) => void)[]>()
  emit(event: GameEvent): void { /* dispatch */ }
  on(type: GameEvent['type'], handler: (e: GameEvent) => void): void { /* subscribe */ }
}
```

### Pattern 3: Player View Isolation (Information Hiding)

**What:** `Game<S>` implements `getPlayerView(state, playerId)` which returns a partial view of state — only information that player is allowed to see. `LLMPlayer` receives this partial view, never the full state.
**When to use:** Required for social deduction games where hidden roles and information asymmetry are core mechanics.
**Trade-offs:** Game implementer must be careful about what to expose. Merlin in Avalon is a special case (sees evil roles but must hide this).

```typescript
// games/avalon/game.ts
getPlayerView(state: AvalonState, playerId: string): AvalonPlayerView {
  const player = state.players.find(p => p.id === playerId)!
  return {
    publicState: state.publicState,
    myRole: player.role,
    // Merlin sees evil; others see only their alignment
    knownRoles: this.computeKnownRoles(state, player),
    currentPhase: state.currentPhase,
  }
}
```

### Pattern 4: Dependency Injection via Constructor

**What:** All components receive their dependencies via constructor, not via global singletons or service locators. No DI framework needed at this scale.
**When to use:** Sufficient for this project — a DI container (tsyringe, inversify) would be over-engineering for a CLI tool.
**Trade-offs:** Slightly verbose wiring in `cli/index.ts`, but excellent testability and zero magic.

```typescript
// cli/index.ts — wiring example
const eventBus = new EventBus()
const recorder = new Recorder(eventBus, outputPath)
const llmClient = new LLMClient({ model: config.model, apiKey: config.apiKey })
const players = config.players.map(p => new LLMPlayer(p.id, p.persona, llmClient, eventBus))
const game = new AvalonGame(config.game)
const engine = new GameEngine(game, players, eventBus)
await engine.run()
```

### Pattern 5: Prompt Templates Co-Located with Game

**What:** LLM prompt templates live in `games/avalon/prompts.ts`, not in `LLMPlayer`. The player calls `game.formatPrompt(view, phase, validActions)` to get a prompt string.
**When to use:** When prompt content is inherently game-specific (role descriptions, game history, valid action labels differ per game).
**Trade-offs:** Tightly couples prompt format to game implementation, but this is correct coupling — the game knows how to describe itself.

## Data Flow

### Single Game Execution

```
CLI → GameRunner → GameEngine.run()
                        │
                        ▼
                   game.initialState()
                        │
                        ▼ (loop)
                   identify active player
                        │
                        ▼
                   game.getPlayerView(state, playerId)
                        │
                        ▼
                   player.act(view, validActions)  ← LLMPlayer calls LLM here
                        │
                        ▼
                   eventBus.emit('action-taken', { action, reasoning })
                        │
                        ├──→ Recorder writes to JSONL log
                        │
                        ▼
                   game.applyAction(state, playerId, action)
                        │
                        ▼
                   game.isTerminal(newState)?
                        │ yes
                        ▼
                   eventBus.emit('game-ended', winner)
                        │
                        ▼
                   GameRunner returns GameResult
```

### Batch Execution

```
CLI → BatchRunner
          │
          ├── Promise.allSettled([
          │     GameRunner.run(config, seed=1),
          │     GameRunner.run(config, seed=2),
          │     ...N games
          │   ])
          │
          ▼
      Aggregate results → summary stats → write batch manifest JSONL
```

### LLM Player Internal Flow

```
player.act(view, validActions)
    │
    ├── game.formatPrompt(view, validActions)  → prompt string
    │
    ├── llmClient.complete(prompt)             → raw LLM response
    │
    ├── parseAction(response, validActions)    → A (validated)
    │
    ├── eventBus.emit('reasoning-recorded', { raw: response })
    │
    └── return action
```

### Key Data Flows Summary

1. **State flow:** `initialState → applyAction → applyAction → … → terminal` — always forward, never mutated in place.
2. **Information flow:** Full `GameState<S>` → `getPlayerView` → partial `PlayerView<S>` → LLM prompt. Information only narrows, never widens.
3. **Log flow:** `EventBus` → `Recorder` → JSONL file. Decoupled from game loop; recorder is a passive subscriber.
4. **Batch flow:** `BatchRunner` fans out N `GameRunner` instances via `Promise.allSettled`; each runner owns its own `EventBus` and output file. No shared state between games.

## Build Order (Suggested)

Dependencies flow bottom-up. Build in this order:

1. **`core/types.ts`** — define `GameState<S>`, `Action<A>`, `GameEvent`, `PlayerView<S>`. No deps.
2. **`core/event-bus.ts`** — typed pub/sub. No deps.
3. **`core/game.ts` + `core/player.ts`** — interfaces only. No deps.
4. **`logging/schema.ts` + `logging/recorder.ts`** — depends on `EventBus` and type definitions.
5. **`games/avalon/types.ts`** — `AvalonState`, `AvalonAction`, `AvalonRole`. No deps.
6. **`games/avalon/phases.ts` + `games/avalon/roles.ts`** — pure logic, depends on Avalon types.
7. **`games/avalon/game.ts`** — `AvalonGame implements Game<AvalonState>`. Depends on phases, roles.
8. **`core/engine.ts`** — `GameEngine<S, A>`. Depends on `Game`, `Player`, `EventBus` interfaces.
9. **`players/llm-client.ts`** — thin LLM API wrapper. No game deps.
10. **`games/avalon/prompts.ts`** — LLM prompt templates. Depends on Avalon types.
11. **`players/llm-player.ts`** — `LLMPlayer<S, A>`. Depends on `LLMClient`, `EventBus`, `Player` interface.
12. **`runner/game-runner.ts`** — wires engine + players + recorder for one game.
13. **`runner/batch-runner.ts`** — parallel fan-out over `GameRunner`.
14. **`cli/`** — final wiring. Depends on everything.

## Anti-Patterns

### Anti-Pattern 1: Avalon Logic Leaking into GameEngine

**What people do:** Add role-checking, Merlin-reveal, or quest failure counting directly in `GameEngine`.
**Why it's wrong:** Breaks game-agnosticism. Adding a second game requires touching the engine.
**Do this instead:** All game rules live in `AvalonGame.applyAction()` and `AvalonGame.isTerminal()`. Engine only calls those methods.

### Anti-Pattern 2: Global Mutable State

**What people do:** Store current `GameState` in a module-level variable or singleton for easy access from players and loggers.
**Why it's wrong:** Impossible to run parallel games (BatchRunner) — they'd share state and corrupt each other.
**Do this instead:** `GameEngine` owns state as a local variable. Pass views to players and events to the bus. Each `GameEngine` instance is fully isolated.

### Anti-Pattern 3: LLMPlayer Knowing About Avalon

**What people do:** Write prompt logic inside `LLMPlayer` with Avalon-specific references ("you are a Merlin, list the evil players…").
**Why it's wrong:** Ties the player implementation to one game. Adding a new game requires forking `LLMPlayer`.
**Do this instead:** `LLMPlayer.act()` calls `game.formatPrompt(view, validActions)` — the game provides the prompt. `LLMPlayer` only calls the API and parses a structured response.

### Anti-Pattern 4: Untyped LLM Response Parsing

**What people do:** Parse LLM output with a regex or `JSON.parse` and pass it directly as an action.
**Why it's wrong:** LLMs hallucinate invalid actions. An unparsed response reaching `applyAction` corrupts game state.
**Do this instead:** Validate parsed output against `getValidActions()`. If invalid, retry the LLM call with an error message (up to a retry limit), then fall back to a random valid action. Log all parsing failures.

### Anti-Pattern 5: Synchronous Batch Execution

**What people do:** Run N games in a for-loop sequentially.
**Why it's wrong:** LLM API latency dominates. 100 games × 30 turns × 300ms/turn = 15 minutes sequential vs ~90 seconds at 10× parallelism.
**Do this instead:** `BatchRunner` uses `Promise.allSettled` with configurable concurrency (p-limit). Respect LLM provider rate limits via a shared rate-limiter instance.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LLM API (OpenAI, Anthropic) | `LLMClient` wrapper in `players/llm-client.ts` | Abstract behind interface so provider is swappable; use `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` env vars |
| Filesystem (game logs) | `Recorder` writes JSONL to configured output dir | One file per game, named by game ID + timestamp; batch manifest file aggregates metadata |
| Environment config | zod schema in `cli/config.ts` | Validate at startup, fail fast on missing keys |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `GameEngine` ↔ `Game<S>` | Direct method calls via interface | Synchronous; game logic is pure functions |
| `GameEngine` ↔ `Player<S,A>` | `await player.act(view, actions)` | Async; LLM calls happen here |
| `GameEngine` → `EventBus` | `eventBus.emit(event)` fire-and-forget | Engine does not await listener responses |
| `Recorder` ← `EventBus` | `eventBus.on(type, handler)` | Recorder is a passive listener; writes are async but non-blocking to game loop |
| `BatchRunner` → `GameRunner` | `Promise.allSettled` with concurrency cap | Each game fully isolated; no shared mutable state |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1–10 games/session | Current architecture sufficient; no changes needed |
| 100–1000 games/session | Add `p-limit` concurrency cap (10–20) to respect LLM rate limits; implement exponential backoff in `LLMClient` |
| 10K+ games (training data pipeline) | Consider worker_threads for CPU-bound post-processing; stream logs rather than buffering in memory; add progress bar (CLI) and resumable batch state |

### Scaling Priorities

1. **First bottleneck:** LLM API rate limits. Fix with `p-limit` concurrency cap and retry logic in `LLMClient`.
2. **Second bottleneck:** Log file I/O when running thousands of games. Fix with streaming JSONL writes (no buffering full game in memory before writing).

## Sources

- [AvalonBench: Evaluating LLMs Playing the Game of Avalon (arxiv)](https://arxiv.org/pdf/2310.05036) — MEDIUM confidence (architecture reference, Python)
- [LLM Agent Framework Architecture: Core Components 2025 (FutureAGI)](https://futureagi.com/blogs/llm-agent-architectures-core-components) — MEDIUM confidence
- [Building a Social Deduction Game with a State Machine (DEV.to)](https://dev.to/asaleg/building-a-social-deduction-game-with-a-state-machine-7-games-in-7-weeks-week-4-2jj8) — MEDIUM confidence
- [VoltAgent TypeScript AI Agent Framework](https://voltagent.dev/blog/typescript-ai-agent-framework/) — MEDIUM confidence
- [A Turn-Based Game Loop (stuffwithstuff.com)](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/) — HIGH confidence (established pattern)
- [XState documentation](https://stately.ai/docs/xstate) — HIGH confidence (not used directly, but informs phase state machine design)
- [Microsoft tsyringe DI container](https://github.com/microsoft/tsyringe) — HIGH confidence (considered and rejected in favor of manual DI at this scale)

---
*Architecture research for: TypeScript AI board game agent framework (Avalon)*
*Researched: 2026-03-21*
