# Roadmap

## Phase Order

```
Phase 1: Data Model ──► Phase 2: Avalon Rules ──► Phase 3: LLM Agents ──► Phase 4: CLI ──► Phase 5: Batch
```

## Why This Order

- **Data model before engine**: Hidden information leakage and flat log schema are HIGH recovery cost pitfalls — types must be locked first
- **Avalon before LLM**: Prompt design requires knowing exactly which information each role receives
- **Single game before batch**: Parallelism amplifies data quality problems
- **CLI before batch**: Batch config must be expressible as a file, not interactive input

## Phases

### Phase 1: Data Model (Complete — 2026-03-23)

Lock types and log schema before game logic. Delivered: Game/Player interfaces, Engine mediator, Recorder, GameEvent schema. 41 tests green.

### Phase 2: Avalon Rules

Complete Avalon game runs to valid end state with deterministic inputs — no LLMs required.

**TIDE tasks**: T-AVALON-ROLES, T-AVALON-GAME-FLOW

### Phase 3: LLM Agents

LLM players with role-appropriate reasoning, public discussion, and validated structured outputs.

**TIDE tasks**: T-LLM-PLAYER, T-LLM-PROMPTS, T-DISCUSSION

**Research needed**: Role-differentiated prompt engineering, cross-provider structured output behavior, scratchpad pattern.

### Phase 4: CLI Runner

Single game configurable from command line, producing complete JSONL log.

**TIDE tasks**: T-CLI-RUNNER

### Phase 5: Batch Mode

Parallel game execution with bounded concurrency, per-game logs, batch manifest.

**TIDE tasks**: T-BATCH-MODE

**Research needed**: Per-provider rate limit tiers, concurrency calibration, cost estimation.
