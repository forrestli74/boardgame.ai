# Phase 1: Data Model - Context

**Gathered:** 2026-03-21
**Updated:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the core type system and event/log schema for the board game AI framework. This phase locks the data model before any game logic or LLM integration is written. Covers: game-agnostic engine interface, pluggable player interface, event schema, JSONL logging, outcome record, and reproducible game config.

</domain>

<decisions>
## Implementation Decisions

### Type System
- No generics anywhere in framework types — all runtime-resolved, Zod validates
- `Game` — state machine, holds state internally. `init()` and `handleResponse()` return `GameResponse { requests: ActionRequest[], events: GameEvent[] }`. Has `optionsSchema` for game-specific config validation
- `Player` — not generic. `act(request: ActionRequest): Promise<unknown>`
- `ActionRequest` — `{ playerId, view: unknown, actionSchema: ZodSchema }`, immutable (`readonly` fields). The only message type between game and player
- `GameResponse` — `{ requests: ActionRequest[], events: GameEvent[] }`. Returned by `init()` and `handleResponse()`
- `Engine` — custom mediator pattern. Tracks pending requests per player, validates responses via schema with retry, records events via Recorder. Uses `Promise.race` for parallel player responses
- PlayerView is a per-game concept, passed as `unknown` through ActionRequest
- No `GameState<S>` wrapper or brand tags — encapsulation enforces information boundary
- `getValidActions` replaced by `actionSchema` on ActionRequest — handles finite and open-ended action spaces
- `GameOutcome` uses `scores: Record<string, number>` instead of `winner: string`
- `GameConfig.options` is `unknown` — game provides `optionsSchema` for validation
- Deferred to v2: `clone()` for replay/history, state serialization, full state logging

### Event Schema
- Two event sources, discriminated by `source: 'player' | 'game'`
- Player event: `{ source: 'player', gameId, playerId, data, reasoning?, timestamp }`
- Game event: `{ source: 'game', gameId, data, timestamp }`
- Discussion is a player action (same event type as vote, propose, quest)
- Events are the log — JSONL is just serialized events. No separate GameLogEntry schema
- Game returns events alongside requests in `GameResponse`

### Engine Behavior
- Game returns ALL current requests from `init()` and `handleResponse()`; engine diffs against pending map, sends only new ones
- Existing pending requests stay until resolved — requests only get added, never removed
- ActionRequest is immutable; game can cache to avoid redundant context building
- Two-layer validation: engine does structural (schema safeParse + retry), game does semantic (game rules + default action)
- Engine records player events and game events via Recorder (direct call, no EventBus)
- Engine stops when pending map is empty or `game.isTerminal()`

### Logging Separation
- Game events → JSONL file (training data). Player actions and game state transitions
- Operational logs → stderr/Pino (debugging). Network errors, retries, latency
- These are strictly separate — no operational data in game logs

### Game Config Format
- JSON format (can migrate to YAML later if needed)
- Single seed controls all game setup randomness (role assignment, starting leader, team sizes)
- Seed does NOT control LLM outputs — reproducibility means same game setup, not same game outcome
- Game-specific options in `options?: unknown`, validated by game's `optionsSchema`

### Action History
- Action history is a game-level concern — each game decides how players access past actions
- Games may reuse events to build action history, or implement custom rules
- Visibility/anonymization (e.g., Avalon quest vote anonymity) is handled by game-defined rules, not the framework

### Claude's Discretion
- Recorder implementation details (Pino configuration)
- Log file naming and directory conventions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — FRAME-01, FRAME-02, FRAME-03, DATA-01, DATA-02, DATA-03 requirements
- `.planning/ROADMAP.md` — Phase 1 success criteria

### Design
- `docs/type-system-options.md` — Complete type system design with rationale

### Research
- `.planning/research/ARCHITECTURE.md` — Component boundaries
- `.planning/research/PITFALLS.md` — Hidden information leakage prevention, log schema design pitfalls
- `.planning/research/STACK.md` — Zod for schema validation, Pino for logging

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — this phase establishes the foundational patterns

### Integration Points
- Types defined here will be consumed by all subsequent phases (Avalon rules, LLM agents, CLI, batch mode)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-model*
*Context gathered: 2026-03-21*
*Updated: 2026-03-22*
