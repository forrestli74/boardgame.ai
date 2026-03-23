# Requirements: BoardGame.AI

**Defined:** 2026-03-21
**Core Value:** AI agents can play complete games of Avalon with full reasoning visibility, producing structured logs suitable for training and analysis.

## v1 Requirements

### Game Framework

- [x] **FRAME-01**: Game-agnostic engine interface — Game as state machine, Engine as mediator, no generics
- [x] **FRAME-02**: Pluggable player interface — `act(request: ActionRequest): Promise<unknown>`, not generic
- [x] **FRAME-03**: Event-based game logging decoupled from game loop

### Avalon Rules

- [ ] **AVLN-01**: Complete role assignment (Merlin, Percival, Morgana, Assassin, Mordred, Oberon, loyal servants, minions) for 5-10 players
- [ ] **AVLN-02**: Team proposal phase — leader proposes a team of required size
- [ ] **AVLN-03**: Team voting phase — all players approve/reject the proposed team
- [ ] **AVLN-04**: Quest phase — approved team members secretly choose success/fail
- [ ] **AVLN-05**: Game end conditions — 3 quest successes (good wins) or 3 quest failures (evil wins)
- [ ] **AVLN-06**: Merlin assassination phase — if good wins quests, assassin guesses Merlin
- [ ] **AVLN-07**: Role-specific visibility rules (Merlin sees evil, Percival sees Merlin+Morgana, etc.)
- [ ] **AVLN-08**: Player view isolation — agents only see information their role permits

### AI Agents

- [ ] **AGENT-01**: LLM player with configurable model (OpenAI, Anthropic, Google)
- [ ] **AGENT-02**: Configurable persona/strategy injected into agent system prompt
- [ ] **AGENT-03**: Role-specific prompt components (different prompts for Merlin vs Assassin vs loyal servant)
- [ ] **AGENT-04**: Structured output validation (Zod schemas) with retry on invalid actions
- [ ] **AGENT-05**: Per-decision reasoning trace captured alongside every action

### Data & Logging

- [x] **DATA-01**: Structured JSONL game log with event schema (turn, phase, player, action, reasoning)
- [x] **DATA-02**: Post-game outcome record — `scores: Record<string, number>` with optional metadata
- [x] **DATA-03**: Reproducible game configs — `GameConfig` with seed, players, `options: unknown` validated by game's `optionsSchema`
- [ ] **DATA-04**: AI-generated post-game summary narrative

### Execution

- [ ] **EXEC-01**: Single game runner via CLI (configure players, models, personas, roles)
- [ ] **EXEC-02**: Batch mode — run N games in parallel with configurable concurrency
- [ ] **EXEC-03**: Batch output organized by run (directory per batch, file per game)

### Discussion

- [ ] **DISC-01**: Simplified discussion phase — each player makes one statement per round before voting
- [ ] **DISC-02**: Discussion statements visible to all players and captured in game log

## v2 Requirements

### Analysis

- **ANLYS-01**: Per-agent belief state tracking and logging (who do they think is evil?)
- **ANLYS-02**: Cross-game analytics (win rates by model, strategy effectiveness)
- **ANLYS-03**: Batch statistics and LLM token/cost tracking

### Execution

- **EXEC-04**: Rate-limit-aware concurrency per LLM provider

### Communication

- **COMM-01**: Full discussion phase — multi-round back-and-forth conversation before voting
- **COMM-02**: Configurable discussion depth (0, 1, or N rounds per game phase)

### Extensibility

- **EXT-01**: Human player implementation wired into player interface
- **EXT-02**: Private scratchpad reasoning (think before acting publicly)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web UI / visual game board | CLI-first; replay from structured logs later if needed |
| Built-in RL training loop | Training is a separate concern; export logs for external frameworks |
| Automatic prompt optimization | Breaks reproducibility required for valid training data |
| Persistent agent memory across games | Creates non-stationarity; breaks statistical independence of batch data |
| Non-Avalon game implementations | Architecture supports it via FRAME-01, but only Avalon implemented in v1 |
| Tournament brackets | Win-rate stats from batch runs achieve the same goal |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FRAME-01 | Phase 1 | Complete |
| FRAME-02 | Phase 1 | Complete |
| FRAME-03 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| AVLN-01 | Phase 2 | Pending |
| AVLN-02 | Phase 2 | Pending |
| AVLN-03 | Phase 2 | Pending |
| AVLN-04 | Phase 2 | Pending |
| AVLN-05 | Phase 2 | Pending |
| AVLN-06 | Phase 2 | Pending |
| AVLN-07 | Phase 2 | Pending |
| AVLN-08 | Phase 2 | Pending |
| AGENT-01 | Phase 3 | Pending |
| AGENT-02 | Phase 3 | Pending |
| AGENT-03 | Phase 3 | Pending |
| AGENT-04 | Phase 3 | Pending |
| AGENT-05 | Phase 3 | Pending |
| DISC-01 | Phase 3 | Pending |
| DISC-02 | Phase 3 | Pending |
| EXEC-01 | Phase 4 | Pending |
| DATA-04 | Phase 4 | Pending |
| EXEC-02 | Phase 5 | Pending |
| EXEC-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
