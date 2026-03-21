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

**Player View Boundary**
- Compile-time enforcement — `GameState` and `PlayerView` are structurally separate TypeScript types
- Passing `GameState` where `PlayerView` is expected must be a compile error
- Exact fields TBD during implementation — the decision here is the type separation approach, not the specific fields

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
- Outcome record exact structure
- PlayerView and GameState exact field definitions (guided by Avalon needs in Phase 2)
- Log file naming and directory conventions

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRAME-01 | Game-agnostic engine interface with generic state and action types | Generic `Game<S, A>` interface pattern; TypeScript 5.x generics; structural separation via distinct types |
| FRAME-02 | Pluggable player interface — any player type implements the same protocol | `Player<S, A>` interface pattern; `act(view, validActions): Promise<A>` signature |
| FRAME-03 | Event-based game logging decoupled from game loop | EventBus pub/sub pattern; Pino child loggers; Recorder as passive EventBus subscriber |
| DATA-01 | Structured JSONL game log with event schema (turn, phase, player, action, reasoning) | Pino v10 NDJSON output; Zod v4 discriminated union for GameEvent; schema-first design |
| DATA-02 | Post-game outcome record (faction winner, per-player role, Merlin assassination result) | Plain typed interface at `core/types.ts`; emitted as a terminal `game-ended` event |
| DATA-03 | Reproducible game configs (seed, role setup, model assignments, personas) | Zod v4 object schema with required `seed: number` field; JSON format; validated at load time |
</phase_requirements>

---

## Summary

Phase 1 is a pure TypeScript types-and-schemas phase. No runtime logic beyond the EventBus and Recorder. The deliverable is a locked type system that all subsequent phases consume without modification. The two most consequential decisions are: (1) how to enforce compile-time separation between `GameState` and `PlayerView`, and (2) how to structure the `GameEvent` discriminated union so Zod validation and TypeScript narrowing work together cleanly.

The existing architecture research (ARCHITECTURE.md) already specifies the component structure and file layout. This research confirms the technical approach, fills in Zod v4 and Pino v10 API specifics, and identifies the exact implementation patterns the planner needs to prescribe.

**Primary recommendation:** Use TypeScript branded/opaque types (a `declare const _brand` field trick) to make `GameState` and `PlayerView` structurally incompatible at compile time. Use Zod v4 `z.discriminatedUnion` for `GameEvent` — it now supports union and pipe discriminators in v4, making it the right tool for a multi-type event schema.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Language | Strict mode enforces the GameState/PlayerView boundary at compile time |
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
| Branded types for view separation | Separate nominal class hierarchy | Branded types have zero runtime overhead; class hierarchy would force instantiation semantics on plain data |
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
│   ├── types.ts        # All generic interfaces: GameState<S>, PlayerView<S>, GameConfig, GameOutcome
│   ├── events.ts       # GameEvent discriminated union + Zod schema
│   ├── game.ts         # Game<S, A> interface
│   ├── player.ts       # Player<S, A> interface
│   └── event-bus.ts    # EventBus — typed pub/sub
└── logging/
    ├── schema.ts       # GameLog Zod schema (the JSONL record shape)
    └── recorder.ts     # EventBus subscriber → writes JSONL via Pino child logger
```

Files outside this scope (engine, players, games/avalon) are created in later phases.

### Pattern 1: Branded Types for Compile-Time View Separation

**What:** Add a phantom `declare const _brand` field to `GameState` and `PlayerView` that makes them structurally incompatible. TypeScript's structural type system would otherwise allow `GameState` to satisfy a `PlayerView` parameter (they'd share fields). The brand prevents this.

**When to use:** Any time `GameState` must be passed to the engine and `PlayerView` must be passed to players — the compile error is the guard.

**Example:**
```typescript
// src/core/types.ts

// The _brand field exists only at the type level — no runtime overhead
type GameState<S> = S & { readonly _gsTag: unique symbol }
type PlayerView<S> = Partial<S> & { readonly _pvTag: unique symbol }

// Factory functions to construct them (cast is internal only)
function makeGameState<S>(state: S): GameState<S> {
  return state as GameState<S>
}
function makePlayerView<S>(view: Partial<S>): PlayerView<S> {
  return view as PlayerView<S>
}
```

With `unique symbol`, `GameState<S>` and `PlayerView<S>` are structurally incompatible — assigning one to the other is a compile error.

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

**What:** `GameConfig` is validated at load time using a Zod object schema. The schema is the single source of truth for config structure — TypeScript type is inferred from it.

**Example:**
```typescript
// src/core/types.ts (or src/core/config.ts)
import { z } from 'zod'

export const GameConfigSchema = z.object({
  gameId: z.string().uuid(),
  seed: z.number().int(),
  players: z.array(z.object({
    id: z.string(),
    name: z.string(),
    model: z.string().optional(),   // e.g. "anthropic:claude-3-5-sonnet"
    persona: z.string().optional(),
  })),
  roles: z.array(z.string()).optional(),  // game-specific; validated by game layer
})

export type GameConfig = z.infer<typeof GameConfigSchema>
```

### Pattern 6: GameLog Entry Schema (JSONL record)

Per ROADMAP success criterion 4, each JSONL line must include `gameId`, `roundId`, `playerId`, `role`, `publicStatement`, `privateReasoning`, and `timestamp`. This maps to the `action-taken` event enriched with role and statement fields.

```typescript
// src/logging/schema.ts
import { z } from 'zod'

export const GameLogEntrySchema = z.object({
  gameId: z.string(),
  roundId: z.number().int(),
  playerId: z.string(),
  role: z.string(),              // game-defined role string
  publicStatement: z.string().optional(),
  privateReasoning: z.string().optional(),
  action: z.unknown(),
  phase: z.string(),
  timestamp: z.string().datetime(),
})

export type GameLogEntry = z.infer<typeof GameLogEntrySchema>
```

### Anti-Patterns to Avoid

- **GameState passed to Player.act():** The `act` signature must accept `PlayerView<S>`, not `GameState<S>`. If both types are the same, the brand enforcement is broken.
- **Event `action` field typed as `any`:** Use `z.unknown()` in the core schema; game layers validate it with their own Zod schemas. `any` silently bypasses Zod.
- **Pino logger as a module singleton:** Each game instance needs its own child logger with `gameId` bound. A module-level singleton makes batch games share a logger and lose per-game context.
- **Emitting unvalidated events:** Always `GameEventSchema.parse(event)` before emitting, or emit only via typed factory functions that construct valid events. Skip validation and a malformed event silently corrupts the log.
- **GameLog schema as a union of GameEvent:** The log entry is a denormalized record for ML consumption — it flattens role, statement, and reasoning into a single row. Don't make it identical to GameEvent.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime event validation | Custom event type guards | Zod discriminated union `.parse()` | Type guards miss nested field violations; Zod gives a descriptive error path |
| JSONL serialization | `JSON.stringify` + manual newlines | Pino (outputs NDJSON natively) | Pino handles escaping, async buffering, and file rotation; hand-rolled serializers corrupt logs on newlines in field values |
| Compile-time type incompatibility | Separate class hierarchies | TypeScript branded types with `unique symbol` | Classes require instantiation; branded types are zero-cost and work on plain objects |
| Config file loading + validation | Custom JSON parser | Zod `.parse()` on `JSON.parse()` output | Zod generates a typed parse result with descriptive error messages; custom parsers silently coerce bad values |

**Key insight:** Zod and Pino together cover all runtime correctness concerns for this phase. Any custom solution for validation or serialization will be less correct and harder to extend.

---

## Common Pitfalls

### Pitfall 1: GameState Structurally Assignable to PlayerView

**What goes wrong:** Without explicit structural incompatibility, TypeScript's structural typing allows `GameState<S>` to satisfy a `PlayerView<S>` parameter if `PlayerView<S>` is just `Partial<S>`. The engine can accidentally pass full state to a player.

**Why it happens:** TypeScript is structurally typed — it doesn't care about the "name" of a type, only its shape. A `GameState<S>` that has all fields of `PlayerView<S>` plus extras will satisfy the `PlayerView<S>` parameter without error.

**How to avoid:** Use `unique symbol` brands on both types. The brands create phantom structural incompatibility at the type level.

**Warning signs:** `const view: PlayerView<S> = state` compiles without error.

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

### Branded Type Incompatibility (Compile-Time PlayerView Guard)
```typescript
// src/core/types.ts
declare const _gsTag: unique symbol
declare const _pvTag: unique symbol

export type GameState<S> = S & { readonly [_gsTag]: never }
export type PlayerView<S> = Partial<S> & { readonly [_pvTag]: never }

// These lines will NOT compile — that's the point
// const view: PlayerView<S> = state   // Error: Type 'GameState<S>' is not assignable to 'PlayerView<S>'
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
| Class-based nominal types | Branded types with `unique symbol` | TypeScript 2.7+ | Zero runtime overhead; works on plain data objects |
| Manual JSONL writes | Pino v10 with `pino.destination()` | Pino v9+ | Async buffered I/O; no manual newline handling |

**Deprecated/outdated:**
- `ts-node`: Slower; ESM support requires extra config; use `tsx` instead
- `z.union` for events with a shared discriminator key: `z.discriminatedUnion` is the correct Zod v4 API with better performance

---

## Open Questions

1. **Extension point for game-specific event types**
   - What we know: Phase 1 locks `core/events.ts`. Phase 2 will need Avalon-specific events (quest-result, assassination-attempt).
   - What's unclear: Whether to include an extensible `GameSpecificEvent` escape hatch in Phase 1 or defer to Phase 2 to extend the union.
   - Recommendation: Reserve a `custom` event variant with `subtype: string` and `payload: z.unknown()` in the core union. Phase 2 can define typed aliases over it without modifying core.

2. **Outcome record exact fields**
   - What we know: ROADMAP says "faction winner, per-player role, Merlin assassination result" for DATA-02.
   - What's unclear: Whether `GameOutcome` belongs in `core/types.ts` (game-agnostic) or needs to be a generic `GameOutcome<R>` where `R` is game-specific role data.
   - Recommendation: Define `GameOutcome` as `{ winner: string; playerRoles: Record<string, string>; metadata: Record<string, unknown> }`. Game layer populates `metadata` with Merlin-assassination result. Avoids generics here where a flexible `Record` suffices.

3. **Log file naming convention**
   - What we know: Per CONTEXT.md, this is Claude's discretion. ROADMAP mentions "batch manifest file" and "directory per batch, file per game" in Phase 5.
   - What's unclear: Phase 1 sets naming conventions used by all future phases.
   - Recommendation: `logs/{gameId}.jsonl` for single games. Phase 5 introduces `logs/{batchId}/{gameId}.jsonl`. Define the `gameId` as a UUID generated at config load time — don't use sequential integers (breaks parallel batch runs).

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
| FRAME-01 | `GameState<S>` is not assignable to `PlayerView<S>` (compile error) | unit (type-level) | `pnpm tsc --noEmit` | ❌ Wave 0 |
| FRAME-01 | `Game<S, A>` interface can be implemented for any S/A | unit | `pnpm vitest run src/core/game.test.ts` | ❌ Wave 0 |
| FRAME-02 | `Player<S, A>` interface `act()` signature returns `Promise<A>` | unit | `pnpm vitest run src/core/player.test.ts` | ❌ Wave 0 |
| FRAME-03 | EventBus emits to subscribers without game-specific code | unit | `pnpm vitest run src/core/event-bus.test.ts` | ❌ Wave 0 |
| FRAME-03 | Recorder writes a JSONL line to disk for each event | integration | `pnpm vitest run src/logging/recorder.test.ts` | ❌ Wave 0 |
| DATA-01 | `GameEventSchema.parse()` validates all defined event variants | unit | `pnpm vitest run src/core/events.test.ts` | ❌ Wave 0 |
| DATA-01 | `GameEventSchema.parse()` rejects events with missing required fields | unit | `pnpm vitest run src/core/events.test.ts` | ❌ Wave 0 |
| DATA-01 | JSONL output includes `gameId` on every line | integration | `pnpm vitest run src/logging/recorder.test.ts` | ❌ Wave 0 |
| DATA-02 | `GameOutcome` type captures winner, player roles, and metadata | unit | `pnpm vitest run src/core/types.test.ts` | ❌ Wave 0 |
| DATA-03 | `GameConfigSchema.parse()` validates seed, players, and optional roles | unit | `pnpm vitest run src/core/types.test.ts` | ❌ Wave 0 |
| DATA-03 | `GameConfigSchema.parse()` rejects config without seed | unit | `pnpm vitest run src/core/types.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm vitest run src/core`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + `pnpm tsc --noEmit` before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — framework config, covers all tests
- [ ] `src/core/events.test.ts` — covers DATA-01 (FRAME-03 adjacently)
- [ ] `src/core/types.test.ts` — covers DATA-02, DATA-03
- [ ] `src/core/game.test.ts` — covers FRAME-01 interface contract
- [ ] `src/core/player.test.ts` — covers FRAME-02 interface contract
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
