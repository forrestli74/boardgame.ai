---
phase: 01-data-model
plan: 01
subsystem: core
tags: [typescript, zod, pino, vitest, tdd]

requires: []
provides:
  - ActionRequest, GameResponse, GameConfigSchema, GameOutcomeSchema, PlayerConfigSchema TypeScript interfaces and Zod schemas
  - GameEvent discriminated union on source: player | game
  - Game interface as state machine (init/handleResponse/isTerminal/getOutcome)
  - Player interface with act(request): Promise<unknown>
  - Engine mediator class (pending diffing, retry logic, recorder integration)
  - Recorder class writing JSONL via Pino child logger per game
affects: [02-avalon-game, 03-llm-players, 04-cli, 05-batch]

tech-stack:
  added: [zod@4.3.6, pino@10.3.1, typescript@5.9.3, vitest@4.1.0, tsx@4.21.0, pino-pretty@13.1.3]
  patterns: [zod-discriminated-union, no-generics-unknown-boundaries, engine-mediator, pino-child-logger-per-game, tdd-red-green]

key-files:
  created:
    - src/core/types.ts
    - src/core/events.ts
    - src/core/game.ts
    - src/core/player.ts
    - src/core/engine.ts
    - src/core/recorder.ts
    - src/core/types.test.ts
    - src/core/events.test.ts
    - src/core/game.test.ts
    - src/core/player.test.ts
    - src/core/engine.test.ts
    - src/core/recorder.test.ts
    - package.json
    - tsconfig.json
    - vitest.config.ts
  modified: []

key-decisions:
  - "No generics in framework types — all boundaries use unknown with Zod runtime validation"
  - "GameEvent discriminated on source: player | game (not type field) matching type-system-options.md spec"
  - "Engine diffs game's full request list against pending map — only sends new requests"
  - "Pino destination uses sync:true for test reliability — avoids sonic-boom not-ready-yet error on immediate flushSync"
  - "Recorder called directly by Engine (no EventBus) — simpler, plan spec says called directly"

patterns-established:
  - "Pattern: Game as state machine — init() and handleResponse() return GameResponse{requests, events}; state internal"
  - "Pattern: Zod discriminated union on source field for GameEvent"
  - "Pattern: Engine.run uses Promise.race on pending Map<playerId, Promise> for parallel/sequential handling"
  - "Pattern: validateWithRetry — actionSchema.safeParse with retry up to maxRetries, returns null on exhaustion"
  - "Pattern: Pino child logger bound to gameId — every JSONL line auto-stamped"

requirements-completed: [FRAME-01, FRAME-02, FRAME-03, DATA-01, DATA-02, DATA-03]

duration: 4min
completed: 2026-03-23
---

# Phase 1 Plan 1: TypeScript Core Type System Summary

**Game-agnostic type foundation: ActionRequest/GameResponse/GameEvent Zod schemas, Game+Player interfaces, Engine mediator with retry logic, and Pino JSONL Recorder — 41 tests green**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T06:03:26Z
- **Completed:** 2026-03-23T06:07:36Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- Core type system (ActionRequest, GameResponse, GameConfig, GameOutcome, PlayerConfig) as Zod schemas with TypeScript inference
- GameEvent discriminated union on `source: 'player' | 'game'` with gameId, timestamp, and optional reasoning
- Game and Player interfaces: no generics, unknown at all boundaries, state internal to Game
- Engine mediator: pending request diffing, parallel/sequential via Promise.race, actionSchema.safeParse retry with null fallback
- Recorder: Pino child logger per gameId, sync destination, JSONL output per event

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold TypeScript project** - `e672d70` (chore)
2. **Task 2: RED — failing tests for types/events/game/player** - `acfc3da` (test)
3. **Task 2: GREEN — implement types, events, game, player** - `af26672` (feat)
4. **Task 3: RED — failing tests for Engine and Recorder** - `b8e6c17` (test)
5. **Task 3: GREEN — implement Engine and Recorder** - `304920e` (feat)

## Files Created/Modified
- `src/core/types.ts` - ActionRequest, GameResponse, GameConfigSchema, GameOutcomeSchema, PlayerConfigSchema
- `src/core/events.ts` - GameEventSchema discriminated union on source field
- `src/core/game.ts` - Game interface: init/handleResponse/isTerminal/getOutcome/optionsSchema
- `src/core/player.ts` - Player interface: act(request: ActionRequest): Promise<unknown>
- `src/core/engine.ts` - Engine mediator: pending diffing, Promise.race, retry, Recorder integration
- `src/core/recorder.ts` - Pino JSONL writer with child logger bound to gameId
- `src/core/*.test.ts` - 41 tests covering all interfaces and behaviors
- `package.json` - type:module, scripts, zod/pino deps, typescript/vitest devDeps
- `tsconfig.json` - strict mode, ES2022, Node16 module resolution
- `vitest.config.ts` - src/**/*.test.ts include pattern

## Decisions Made
- No generics anywhere in framework types — `unknown` at all boundaries, Zod validates at runtime
- GameEvent discriminates on `source` field (not `type`) per type-system-options.md specification
- Engine diffs game's complete request list against pending map — only sends new requests per player
- Pino destination uses `sync: true` for predictable test behavior (avoids async init race)
- Recorder called directly by Engine (no EventBus intermediate) — plan specifies direct call pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pino destination must use sync:true for immediate flushSync availability**
- **Found during:** Task 3 (Recorder implementation)
- **Issue:** `pino.destination(filePath)` opens an async SonicBoom stream; calling `flushSync` before the stream is ready throws "sonic boom is not ready yet"
- **Fix:** Changed to `pino.destination({ dest: filePath, sync: true })` — synchronous mode avoids the async init race condition in tests
- **Files modified:** `src/core/recorder.ts`
- **Verification:** All 6 recorder tests pass; JSONL content readable immediately after `flush()`
- **Committed in:** `304920e` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correct test behavior; production code may use async mode if preferred for performance, but sync mode is correct for the current use case.

## Issues Encountered
None beyond the auto-fixed Pino issue above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All framework interfaces locked; Phase 2 (Avalon game) can implement `Game` interface directly
- GameEvent union is `source: 'player' | 'game'` — game-specific event semantics go in `data: unknown`
- Engine and Recorder ready for integration with real Game and Player implementations
- No blockers

## Self-Check: PASSED

All created files verified present. All 5 task commits verified in git log.

---
*Phase: 01-data-model*
*Completed: 2026-03-23*
