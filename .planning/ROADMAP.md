# Roadmap: BoardGame.AI

## Overview

Build a TypeScript CLI framework where LLM agents play complete Avalon games, producing structured JSONL logs for training data. The build order is deliberate: data model first (to prevent information leakage bugs that invalidate all downstream data), then Avalon rules, then LLM integration, then CLI wiring, then batch scale. Each phase delivers a verifiable capability before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Model** - Lock types and log schema before any game logic is written
- [ ] **Phase 2: Avalon Rules** - Complete rules engine testable with deterministic inputs
- [ ] **Phase 3: LLM Agents** - LLM players with role-differentiated prompts and discussion
- [ ] **Phase 4: CLI Runner** - Usable single-game CLI that writes a complete JSONL log
- [ ] **Phase 5: Batch Mode** - Parallel game execution for training data at scale

## Phase Details

### Phase 1: Data Model
**Goal**: The type system enforces information hiding and the log schema is locked before any game engine code is written
**Depends on**: Nothing (first phase)
**Requirements**: FRAME-01, FRAME-02, FRAME-03, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. A `Game` interface (no generics) exists as a state machine — `init` and `handleResponse` return `GameResponse { requests: ActionRequest[], events: GameEvent[] }`, has `optionsSchema` for game-specific config validation
  2. An `ActionRequest` type exists with readonly `playerId`, `view: unknown`, and `actionSchema: ZodSchema`
  3. A `Player` interface exists with `act(request: ActionRequest): Promise<unknown>` — not generic
  4. An `Engine` class mediates between Game and Player — tracks pending requests (diffs against game's full request list), validates responses via schema with retry, records events via Recorder, handles parallel player actions via `Promise.race`
  5. A `GameEvent` Zod schema with two source types: `source: 'player'` (with playerId, data, reasoning) and `source: 'game'` (with data)
  6. A `Recorder` class writes JSONL via Pino, called directly by Engine (no EventBus)
  7. A typed `GameConfig` with Zod validation captures seed, players (model, persona), and `options: unknown` for game-specific config
  8. A `GameOutcome` type uses `scores: Record<string, number>` with optional metadata
**Plans**: 1 plan

Plans:
- [ ] 01-01-PLAN.md — Core types, event schema, engine, and recorder

### Phase 2: Avalon Rules
**Goal**: A complete Avalon game runs to a valid end state when given deterministic player inputs — no LLMs required
**Depends on**: Phase 1
**Requirements**: AVLN-01, AVLN-02, AVLN-03, AVLN-04, AVLN-05, AVLN-06, AVLN-07, AVLN-08
**Success Criteria** (what must be TRUE):
  1. Role assignment covers all valid configurations for 5–10 players (correct counts of Merlin, Percival, Morgana, Assassin, Mordred, Oberon, loyal servants, minions)
  2. A complete game plays through all phases — nominate team, vote, quest, repeat — and terminates on 3 quest successes or 3 quest failures
  3. The Merlin assassination phase fires when good wins quests and correctly resolves the final outcome
  4. Each player's view of game state contains only the information their role permits — a Merlin sees evil players; a loyal servant sees nothing beyond public state
  5. All phase transitions and outcomes are verifiable via deterministic test scenarios (scripted inputs produce expected outputs)
**Plans**: TBD

### Phase 3: LLM Agents
**Goal**: LLM players can play a complete Avalon game with role-appropriate reasoning, public discussion, and validated structured outputs
**Depends on**: Phase 2
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, DISC-01, DISC-02
**Success Criteria** (what must be TRUE):
  1. An LLM player configured with any supported provider (OpenAI, Anthropic) and model string makes valid game decisions — proposal, vote, quest choice, assassination — without manual JSON parsing
  2. Each decision includes a captured private reasoning trace separate from any public statement
  3. Each player makes one public discussion statement per round before voting, visible to all players and recorded in the game log
  4. Invalid LLM responses trigger a retry with clarification (up to 3 attempts) before the game errors
  5. Role-specific prompt components produce distinct behavior — a Merlin prompt differs from a loyal servant prompt at the system level
**Plans**: TBD

### Phase 4: CLI Runner
**Goal**: A single game of Avalon can be configured and run from the command line, producing a complete JSONL log file
**Depends on**: Phase 3
**Requirements**: EXEC-01, DATA-04
**Success Criteria** (what must be TRUE):
  1. Running `boardgame-ai run` with player configs (model, persona, role seed) starts a game and writes a JSONL log to the specified output directory
  2. The same config file run twice produces the same role assignments (seed is respected)
  3. An AI-generated post-game summary narrative is appended to the game output after the final event
  4. The CLI rejects invalid configs with a clear error before any LLM calls are made
**Plans**: TBD

### Phase 5: Batch Mode
**Goal**: Many games can be run in parallel with bounded concurrency, producing organized per-game logs and a batch manifest
**Depends on**: Phase 4
**Requirements**: EXEC-02, EXEC-03
**Success Criteria** (what must be TRUE):
  1. Running `boardgame-ai batch --count N --concurrency C` runs N games with at most C in flight simultaneously
  2. Each game produces its own JSONL log file in a per-batch output directory; a partial batch does not lose completed game logs
  3. A batch manifest file lists all games in the run with outcome metadata (faction winner, model assignments, Merlin assassination result)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Model | 0/1 | Planning complete | - |
| 2. Avalon Rules | 0/TBD | Not started | - |
| 3. LLM Agents | 0/TBD | Not started | - |
| 4. CLI Runner | 0/TBD | Not started | - |
| 5. Batch Mode | 0/TBD | Not started | - |
