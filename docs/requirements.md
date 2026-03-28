# Requirements

Defined 2026-03-21. See TIDE tasks (`.tide/tasks/`) for full acceptance criteria.

## v1

### Game Framework (Phase 1 — Complete)

- [x] **FRAME-01**: Game-agnostic engine interface — Game as state machine, Engine as mediator, no generics
- [x] **FRAME-02**: Pluggable player interface — `act(request): Promise<unknown>`, not generic
- [x] **FRAME-03**: Event-based game logging decoupled from game loop

### Data & Logging (Phase 1 — Complete)

- [x] **DATA-01**: Structured JSONL game log with event schema
- [x] **DATA-02**: Post-game outcome record — `scores: Record<string, number>` with metadata
- [x] **DATA-03**: Reproducible game configs — seed, players, options validated by game
- [ ] **DATA-04**: AI-generated post-game summary narrative

### Avalon Rules (Phase 2 — Complete)

- [x] **AVLN-01**: Role assignment for 5–10 players → T-AVALON-ROLES
- [x] **AVLN-02**: Team proposal phase → T-AVALON-GAME-FLOW
- [x] **AVLN-03**: Team voting phase → T-AVALON-GAME-FLOW
- [x] **AVLN-04**: Quest phase → T-AVALON-GAME-FLOW
- [x] **AVLN-05**: Game end conditions (3 successes/failures) → T-AVALON-GAME-FLOW
- [x] **AVLN-06**: Merlin assassination → T-AVALON-GAME-FLOW
- [x] **AVLN-07**: Role-specific visibility → T-AVALON-ROLES
- [x] **AVLN-08**: Player view isolation → T-AVALON-ROLES

### Randomness (Phase 2 — Complete)

- [x] **RAND-01**: Pre-compute random decisions in TypeScript (seeded PRNG), pass as facts to LLM — LLM must not generate its own randomness

### AI Agents (Phase 3 — Complete)

- [x] **AGENT-01**: LLM player with configurable model → T-LLM-PLAYER
- [x] **AGENT-02**: Configurable persona/strategy → T-LLM-PROMPTS
- [x] **AGENT-03**: Role-specific prompt components → T-LLM-PROMPTS
- [x] **AGENT-04**: Structured output validation with retry → T-LLM-PLAYER
- [x] **AGENT-05**: Per-decision reasoning trace → T-LLM-PLAYER

### Discussion (Phase 3 — Complete)

- [x] **DISC-01**: One statement per player per round → T-DISCUSSION
- [x] **DISC-02**: Statements visible to all, captured in log → T-DISCUSSION

### Execution (Phase 4–5)

- [ ] **EXEC-01**: Single game runner via CLI → T-CLI-RUNNER
- [ ] **EXEC-02**: Batch mode with concurrency → T-BATCH-MODE
- [ ] **EXEC-03**: Batch output organized by run → T-BATCH-MODE

## v2 (Future)

- **ANLYS-01**: Per-agent belief state tracking
- **ANLYS-02**: Cross-game analytics (win rates by model)
- **ANLYS-03**: Batch statistics and token/cost tracking
- **EXEC-04**: Rate-limit-aware concurrency per provider
- **COMM-01**: Multi-round discussion
- **COMM-02**: Configurable discussion depth
- **EXT-01**: Human player implementation
- **EXT-02**: Private scratchpad reasoning

## Traceability

| Phase | Requirements | Status |
|-------|-------------|--------|
| 1. Data Model | FRAME-01–03, DATA-01–03 | Complete |
| 2. Avalon Rules | AVLN-01–08, RAND-01 | Complete |
| 3. LLM Agents | AGENT-01–05, DISC-01–02 | Pending |
| 4. CLI Runner | EXEC-01, DATA-04 | Pending |
| 5. Batch Mode | EXEC-02–03 | Pending |
