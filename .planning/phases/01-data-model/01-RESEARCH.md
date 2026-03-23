# Phase 1: Data Model - Research

**Researched:** 2026-03-21
**Domain:** TypeScript type system design — game-agnostic generics, discriminated unions, compile-time information hiding, Zod schema validation, Pino JSONL logging
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Event Schema Design**
- One event per atomic action (fine-grained granularity)
- Single `reasoning` string field per action event — concise justification only
- Full chain-of-thought stays as agent internal memory, not logged in events
- Event schema must be game-agnostic — no Avalon-specific fields in the core types
- Discussion is an action type (same event schema as other actions like vote, propose, quest)

**Type System**
- No generics in framework types — all runtime-resolved, Zod validates
- Game as state machine with internal state — `init()` returns `ActionRequest[]`, `handleResponse()` returns new `ActionRequest[]`
- Player not generic — `act(request: ActionRequest): Promise<unknown>`
- ActionRequest: `{ playerId, view: unknown, actionSchema: ZodSchema }`
- Engine as mediator — tracks pending requests, validates, logs
- PlayerView is per-game, passed as `unknown` through ActionRequest
- GameOutcome uses `scores: Record<string, number>`
- GameConfig has `options: unknown` validated by game's `optionsSchema`

**Game Config Format**
- JSON format (can migrate to YAML later if needed)
- Single seed controls all game setup randomness (role assignment, starting leader, team sizes)
- Seed does NOT control LLM outputs — reproducibility means same game setup, not same game outcome

**Log and Action History Separation**
- Event log is strictly for devs — full observability, everything recorded as JSONL output
- Action history is a game-level concern — each game decides how players access past actions
- Games may reuse events to build action history, or implement custom rules
- Visibility/anonymization is handled by game-defined rules, not the framework
- The framework provides a generic visibility mechanism; games configure it with their specific rules

### Claude's Discretion
- EventBus implementation details
- Log file naming and directory conventions

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRAME-01 | Game-agnostic engine interface — Game as state machine, Engine as mediator, no generics | `Game` interface with `init()`/`handleResponse()` returning `ActionRequest[]`; `Engine` as mediator routing between Game and Player |
| FRAME-02 | Pluggable player interface — any player type implements the same protocol | `Player` interface; `act(request: ActionRequest): Promise<unknown>` signature; not generic |
| FRAME-03 | Event-based game logging decoupled from game loop | EventBus pub/sub pattern; Pino child loggers; Recorder as passive EventBus subscriber |
| DATA-01 | Structured JSONL game log with event schema (turn, phase, player, action, reasoning) | Pino v10 NDJSON output; Zod v4 discriminated union for GameEvent; schema-first design |
| DATA-02 | Post-game outcome record — `scores: Record<string, number>` with optional metadata | `GameOutcomeSchema` Zod schema; emitted as terminal `game-ended` event |
| DATA-03 | Reproducible game configs — seed, players, `options: unknown` validated by game | `GameConfigSchema` Zod schema; `options` validated by `game.optionsSchema` |
</phase_requirements>

---

## Summary

Phase 1 defines the core type system, engine loop, and event/logging infrastructure. No generics in framework types — all boundaries use `unknown` with Zod validation at runtime. The key deliverables are: (1) Game as a state machine that produces ActionRequests and reacts to responses, (2) Engine as a mediator that routes between Game and Player, and (3) GameEvent discriminated union for dev logging.

**Primary recommendation:** Use Zod v4 `z.discriminatedUnion` for `GameEvent`. Use `unknown` at all framework type boundaries with schema validation. No branded types or compile-time generics — encapsulation enforces the information boundary.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Language | Strict mode; no generics in framework types; `unknown` at boundaries |
| Zod | 4.x | Schema validation + type inference | `z.discriminatedUnion` for GameEvent; `z.object` for GameConfig and GameLog; infers TypeScript types from schemas |
| Pino | 10.x | JSONL structured logging | Outputs NDJSON natively — no marshaling step; fastest Node.js logger; child loggers carry `gameId` automatically |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino-pretty` | 13.x | Human-readable dev output | Dev only — pipe stdout through it; never in test assertions or production |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod discriminated union | TypeScript native discriminated union only | Zod adds runtime validation; TypeScript types alone give no runtime safety for log output |
| Encapsulation for view separation | Branded types / separate nominal types | Game holds state internally; view is `unknown` — no type-level enforcement needed |
| Pino child logger per game | Single pino instance with manual `gameId` field | Child loggers auto-carry context fields; reduces risk of forgetting `gameId` in every log call |

**Installation (Phase 1 only):**
```bash
pnpm add zod pino
pnpm add -D typescript tsx vitest pino-pretty @types/node
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)

```
src/
├── core/
│   ├── types.ts        # ActionRequest, GameConfig, GameOutcome (no generics)
│   ├── events.ts       # GameEvent discriminated union + Zod schema
│   ├── game.ts         # Game interface (state machine, no generics)
│   ├── player.ts       # Player interface (not generic)
│   ├── engine.ts       # Engine (mediator between Game and Player)
│   └── event-bus.ts    # EventBus — typed pub/sub
└── logging/
    ├── schema.ts       # GameLogEntry Zod schema (the JSONL record shape)
    └── recorder.ts     # EventBus subscriber → writes JSONL via Pino child logger
```

Files outside this scope (players, games/avalon) are created in later phases.

### Pattern 1: Game as State Machine + Engine as Mediator

**What:** Game holds state internally and communicates via ActionRequests. Engine sits between Game and Player, routing requests, validating responses, and logging events. No generics anywhere.

**When to use:** Always — this is the core architecture. Game produces ActionRequests, Engine delivers them to Players, Players respond, Engine validates and delivers back to Game.

**Example:**
```typescript
// src/core/game.ts
interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): ActionRequest[]
  handleResponse(playerId: string, action: unknown): ActionRequest[]
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}

// src/core/types.ts
interface ActionRequest {
  playerId: string
  view: unknown
  actionSchema: ZodSchema
}
```

State is the game's internal concern. The framework never sees it.

### Pattern 2: Zod Discriminated Union for GameEvent

**What:** Define `GameEvent` as a `z.discriminatedUnion('type', [...])`. Each event variant is a `z.object` with a literal `type` field. Zod v4 supports union and pipe discriminators, so variants can be extended without restructuring the union.

**When to use:** Whenever emitting events and validating log entries. The Zod schema drives both runtime validation and TypeScript type inference.

**Example:**
```typescript
// src/core/events.ts
import { z } from 'zod'

export const ActionEventSchema = z.object({
  type: z.literal('action-taken'),
  gameId: z.string(),
  roundId: z.number().int(),
  playerId: z.string(),
  action: z.unknown(),       // game-specific; validated by game layer
  reasoning: z.string().optional(),
  timestamp: z.string().datetime(),
})

export const PhaseChangedEventSchema = z.object({
  type: z.literal('phase-changed'),
  gameId: z.string(),
  from: z.string(),
  to: z.string(),
  timestamp: z.string().datetime(),
})

export const GameEndedEventSchema = z.object({
  type: z.literal('game-ended'),
  gameId: z.string(),
  outcome: GameOutcomeSchema,   // defined separately
  timestamp: z.string().datetime(),
})

export const GameEventSchema = z.discriminatedUnion('type', [
  ActionEventSchema,
  PhaseChangedEventSchema,
  GameEndedEventSchema,
])

export type GameEvent = z.infer<typeof GameEventSchema>
```

### Pattern 3: Pino Child Logger as Game-Scoped Recorder

**What:** Create a root Pino logger at startup. Per game, call `logger.child({ gameId })` to get a child logger that auto-stamps every JSONL line with `gameId`. The Recorder subscribes to EventBus and calls `childLogger.info(event)` for each event.

**When to use:** This is the only log emission pattern. All game event logging goes through the Recorder subscriber — never direct `console.log` or top-level pino calls from game logic.

**Example:**
```typescript
// src/logging/recorder.ts
import pino from 'pino'
import type { EventBus } from '../core/event-bus.js'
import { GameEventSchema } from '../core/events.js'

export class Recorder {
  private logger: pino.Logger

  constructor(eventBus: EventBus, gameId: string, destination: string) {
    const root = pino({ level: 'info' }, pino.destination(destination))
    this.logger = root.child({ gameId })

    eventBus.on('action-taken', (e) => this.logger.info(e))
    eventBus.on('phase-changed', (e) => this.logger.info(e))
    eventBus.on('game-ended', (e) => this.logger.info(e))
  }
}
```

### Pattern 4: EventBus with Typed Subscriptions

**What:** EventBus uses a `Map<GameEvent['type'], Set<Handler>>` internally. The public API is `emit(event: GameEvent)` and `on(type, handler)`. No external dependencies needed.

**When to use:** The EventBus is the decoupling boundary between the game engine (emitter) and all observers (Recorder, future analytics). It must never be game-specific.

**Example:**
```typescript
// src/core/event-bus.ts
import type { GameEvent } from './events.js'

type Handler<T extends GameEvent> = (event: T) => void

export class EventBus {
  private handlers = new Map<string, Set<Handler<GameEvent>>>()

  emit(event: GameEvent): void {
    const hs = this.handlers.get(event.type)
    if (hs) for (const h of hs) h(event)
  }

  on<T extends GameEvent['type']>(
    type: T,
    handler: Handler<Extract<GameEvent, { type: T }>>,
  ): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler as Handler<GameEvent>)
  }
}
```

### Pattern 5: GameConfig Zod Schema

**What:** `GameConfig` is validated at load time. Game-specific options go in `options: unknown`, validated by `game.optionsSchema`.

**Example:**
```typescript
// src/core/types.ts
import { z } from 'zod'

export const GameConfigSchema = z.object({
  gameId: z.string(),
  seed: z.number().int(),
  players: z.array(z.object({
    id: z.string(),
    name: z.string(),
    model: z.string().optional(),
    persona: z.string().optional(),
  })).min(1),
  options: z.unknown().optional(),  // game-specific; validated by game.optionsSchema
})

export type GameConfig = z.infer<typeof GameConfigSchema>
```

### Pattern 6: GameLog Entry Schema (JSONL record)

Each JSONL line includes framework-level fields. Game-specific fields (role, round) go in `metadata`.

```typescript
// src/logging/schema.ts
import { z } from 'zod'

export const GameLogEntrySchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  action: z.unknown(),
  reasoning: z.string().optional(),
  phase: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type GameLogEntry = z.infer<typeof GameLogEntrySchema>
```

### Anti-Patterns to Avoid

- **Generics in framework types:** Framework types use `unknown` at boundaries. Zod validates at runtime. No `Game<S, A>` or `Player<V, A>`.
- **Game state exposed outside the class:** State is internal to Game. Only views go out through ActionRequest. Engine and Player never see raw game state.
- **Event `action` field typed as `any`:** Use `z.unknown()` in the core schema; game layers validate with their own Zod schemas. `any` silently bypasses Zod.
- **Pino logger as a module singleton:** Each game instance needs its own child logger with `gameId` bound. A module-level singleton makes batch games share a logger and lose per-game context.
- **Emitting unvalidated events:** Always validate events before emitting. Skip validation and a malformed event silently corrupts the log.
- **Game-specific fields in framework schemas:** Fields like `role`, `roundId`, `publicStatement` belong in game-level metadata, not core schemas.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime event validation | Custom event type guards | Zod discriminated union `.parse()` | Type guards miss nested field violations; Zod gives a descriptive error path |
| JSONL serialization | `JSON.stringify` + manual newlines | Pino (outputs NDJSON natively) | Pino handles escaping, async buffering, and file rotation; hand-rolled serializers corrupt logs on newlines in field values |
| Information hiding | Branded types / class hierarchies | Encapsulation — Game holds state internally, exposes view as `unknown` | Simpler; no type machinery needed |
| Config file loading + validation | Custom JSON parser | Zod `.parse()` on `JSON.parse()` output | Zod generates a typed parse result with descriptive error messages; custom parsers silently coerce bad values |

**Key insight:** Zod and Pino together cover all runtime correctness concerns for this phase. Any custom solution for validation or serialization will be less correct and harder to extend.

---

## Common Pitfalls

### Pitfall 1: Game State Leaking to Players

**What goes wrong:** Full game state reaches a player — they see hidden roles, secret votes, etc. Training data is invalidated.

**Why it happens:** Game state is passed around as a value and someone accidentally passes the full state instead of a filtered view.

**How to avoid:** Game holds state internally. Only views go out through ActionRequest as `unknown`. The engine never has access to game state — only ActionRequests.

**Warning signs:** Any function that accepts both game state and player view types; any place where game internals are serialized into player-facing data.

### Pitfall 2: Log Entry Missing gameId / roundId

**What goes wrong:** Log entries are written without `gameId` or `roundId`. Post-processing ML pipelines can't join events across a game or sequence them by round.

**Why it happens:** Logging is added incrementally — early events get `gameId`, later ones don't. No schema enforcement at emit time.

**How to avoid:** Validate every emitted `GameLogEntry` against `GameLogEntrySchema` before writing. Use Pino child loggers that auto-include `gameId`.

**Warning signs:** Any `pino.info({ ...eventWithoutGameId })` call in the codebase.

### Pitfall 3: action Field Typed as `any` in GameEvent

**What goes wrong:** The `action` field in `ActionEventSchema` is typed as `any`, bypassing Zod validation for nested action data. Game-specific actions with invalid shapes reach the log silently.

**Why it happens:** The core schema can't know game-specific action shapes, so `any` feels like the right escape hatch.

**How to avoid:** Use `z.unknown()` in the core schema. Each game layer validates its actions against a game-specific Zod schema before emitting the event. The framework never sees raw `any`.

**Warning signs:** `action: z.any()` in `ActionEventSchema`.

### Pitfall 4: Event Types Added in Later Phases Break Discriminated Union

**What goes wrong:** Phase 2 adds a `quest-result` event type but the Zod discriminated union is in `core/events.ts`, which Phase 1 locked. All callsites that `switch` on `event.type` become non-exhaustive.

**Why it happens:** The event union feels "locked" but game phases require new event types. No mechanism for extension.

**How to avoid:** Design the EventBus to accept `GameEvent | GameSpecificEvent` where `GameSpecificEvent` is defined by the game layer. Alternatively, reserve a generic `custom` event type with a `subtype: string` field for game-specific events, keeping the core union small and stable.

**Warning signs:** Adding Avalon-specific event types directly to `core/events.ts` in Phase 2.

### Pitfall 5: Sync EventBus Blocking Game Loop on Slow Subscribers

**What goes wrong:** The Recorder subscriber does synchronous file I/O inside the EventBus handler. The game loop blocks on every event emit until the write completes.

**Why it happens:** `pino.info()` is non-blocking, but wrapping it in synchronous error handling or flushing makes it blocking. Or the handler does a `JSON.parse` + schema validation that takes non-trivial time on large payloads.

**How to avoid:** Pino uses async buffered writes by default — don't override with sync destinations in production. EventBus handlers must be fire-and-forget. Zod validation in the handler should be in-process (fast) — no async I/O in handlers.

**Warning signs:** `fs.writeFileSync` anywhere in the Recorder; `await` inside an EventBus handler.

---

## Code Examples

Verified patterns from project architecture research and Zod v4 docs:

### Game + Engine Pattern (No Generics)
```typescript
// src/core/types.ts
interface ActionRequest {
  playerId: string
  view: unknown
  actionSchema: ZodSchema
}

// src/core/game.ts
interface Game {
  readonly optionsSchema: ZodSchema
  init(config: GameConfig): ActionRequest[]
  handleResponse(playerId: string, action: unknown): ActionRequest[]
  isTerminal(): boolean
  getOutcome(): GameOutcome | null
}

// src/core/player.ts
interface Player {
  readonly id: string
  readonly name: string
  act(request: ActionRequest): Promise<unknown>
}
```

### Zod Discriminated Union (v4 syntax)
```typescript
// z.discriminatedUnion in Zod v4 supports union-type discriminators
const GameEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('action-taken'), /* ... */ }),
  z.object({ type: z.literal('phase-changed'), /* ... */ }),
  z.object({ type: z.literal('game-ended'), /* ... */ }),
])
// Source: https://zod.dev/api (Zod v4, discriminatedUnion section)
```

### Pino Child Logger (auto-stamps gameId on every line)
```typescript
import pino from 'pino'
const root = pino({ level: 'info' }, pino.destination('./logs/game.jsonl'))
const gameLogger = root.child({ gameId: 'abc-123' })
gameLogger.info({ type: 'action-taken', roundId: 1, playerId: 'p1' })
// Output: {"level":30,"time":...,"gameId":"abc-123","type":"action-taken","roundId":1,"playerId":"p1"}
// Source: https://github.com/pinojs/pino — child logger API
```

### EventBus on() with Narrowed Handler Type
```typescript
// TypeScript narrows the handler parameter type based on the event type argument
eventBus.on('action-taken', (e) => {
  // e is inferred as Extract<GameEvent, { type: 'action-taken' }>
  console.log(e.reasoning)  // TypeScript knows this field exists
})
```

### GameConfig Validation at Load Time
```typescript
import { readFileSync } from 'node:fs'
import { GameConfigSchema } from '../core/types.js'

function loadConfig(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return GameConfigSchema.parse(raw)  // throws ZodError with field paths on invalid input
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `z.union` for multi-type event schemas | `z.discriminatedUnion` with union/pipe discriminators | Zod v4 (2025) | O(1) parse dispatch; supports complex discriminator types |
| `ts-node` for TypeScript execution | `tsx` (esbuild-based) | 2023–2024 | ~2x faster; no extra tsconfig needed |
| Class-based nominal types / branded types | Encapsulation + `unknown` at boundaries | Final design decision | No type-level enforcement needed; encapsulation is sufficient |
| Manual JSONL writes | Pino v10 with `pino.destination()` | Pino v9+ | Async buffered I/O; no manual newline handling |

**Deprecated/outdated:**
- `ts-node`: Slower; ESM support requires extra config; use `tsx` instead
- `z.union` for events with a shared discriminator key: `z.discriminatedUnion` is the correct Zod v4 API with better performance

---

## Open Questions

1. **Extension point for game-specific event types**
   - Resolved: Reserve a `custom` event variant with `subtype: string` and `payload: z.unknown()` in the core union. Phase 2 defines typed aliases without modifying core.

2. **Outcome record exact fields**
   - Resolved: `GameOutcome = { scores: Record<string, number>; metadata?: Record<string, unknown> }`. Game-specific data (roles, assassination) goes in metadata.

3. **Log file naming convention**
   - Claude's discretion. Recommendation: `logs/{gameId}.jsonl` for single games, `logs/{batchId}/{gameId}.jsonl` for batch.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `pnpm vitest run src/core` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FRAME-01 | `Game` interface can be implemented with internal state, no generics | unit | `pnpm vitest run src/core/game.test.ts` | ❌ Wave 0 |
| FRAME-01 | `Engine` mediates between Game and Player, validates via schema | unit | `pnpm vitest run src/core/engine.test.ts` | ❌ Wave 0 |
| FRAME-02 | `Player` interface `act()` receives ActionRequest, returns `Promise<unknown>` | unit | `pnpm vitest run src/core/player.test.ts` | ❌ Wave 0 |
| FRAME-03 | EventBus emits to subscribers without game-specific code | unit | `pnpm vitest run src/core/event-bus.test.ts` | ❌ Wave 0 |
| FRAME-03 | Recorder writes a JSONL line to disk for each event | integration | `pnpm vitest run src/logging/recorder.test.ts` | ❌ Wave 0 |
| DATA-01 | `GameEventSchema.parse()` validates all defined event variants | unit | `pnpm vitest run src/core/events.test.ts` | ❌ Wave 0 |
| DATA-01 | `GameEventSchema.parse()` rejects events with missing required fields | unit | `pnpm vitest run src/core/events.test.ts` | ❌ Wave 0 |
| DATA-01 | JSONL output includes `gameId` on every line | integration | `pnpm vitest run src/logging/recorder.test.ts` | ❌ Wave 0 |
| DATA-02 | `GameOutcome` type captures scores and optional metadata | unit | `pnpm vitest run src/core/types.test.ts` | ❌ Wave 0 |
| DATA-03 | `GameConfigSchema.parse()` validates seed, players, and optional options | unit | `pnpm vitest run src/core/types.test.ts` | ❌ Wave 0 |
| DATA-03 | `GameConfigSchema.parse()` rejects config without seed | unit | `pnpm vitest run src/core/types.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm vitest run src/core`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + `pnpm tsc --noEmit` before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — framework config, covers all tests
- [ ] `src/core/events.test.ts` — covers DATA-01 (FRAME-03 adjacently)
- [ ] `src/core/types.test.ts` — covers DATA-02, DATA-03
- [ ] `src/core/game.test.ts` — covers FRAME-01 Game interface
- [ ] `src/core/player.test.ts` — covers FRAME-02 Player interface
- [ ] `src/core/engine.test.ts` — covers FRAME-01 Engine mediator
- [ ] `src/core/event-bus.test.ts` — covers FRAME-03 EventBus
- [ ] `src/logging/recorder.test.ts` — covers FRAME-03 Recorder + DATA-01 JSONL output
- [ ] `package.json` test scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`
- [ ] Framework install: `pnpm add -D vitest @types/node`

---

## Sources

### Primary (HIGH confidence)
- Zod v4 API docs — `z.discriminatedUnion`, `z.object`, `z.infer` — https://zod.dev/api
- Zod v4 release notes — discriminated union improvements — https://zod.dev/v4
- Pino GitHub — child logger API, `pino.destination()`, NDJSON output — https://github.com/pinojs/pino
- ARCHITECTURE.md (`.planning/research/ARCHITECTURE.md`) — component structure, interfaces, build order
- STACK.md (`.planning/research/STACK.md`) — library versions, compatibility matrix
- PITFALLS.md (`.planning/research/PITFALLS.md`) — hidden information leakage, training data schema design

### Secondary (MEDIUM confidence)
- TypeScript handbook — structural typing and type compatibility — https://www.typescriptlang.org/docs/handbook/type-compatibility.html
- Branded types in TypeScript — https://dev.to/kuncheriakuruvilla/branded-types-in-typescript-beyond-primitive-type-safety-5bba
- Pino structured logging guide — https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Zod v4 and Pino v10 verified against npm and official docs; versions confirmed in STACK.md
- Architecture: HIGH — patterns confirmed against ARCHITECTURE.md which was researched 2026-03-21
- Type separation pattern: HIGH — TypeScript `unique symbol` branded types are well-documented; structural incompatibility behavior is stable
- Pitfalls: HIGH — sourced from PITFALLS.md plus cross-verified with Zod v4 type system behavior

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable domain — TypeScript generics and Zod v4 patterns change slowly)
