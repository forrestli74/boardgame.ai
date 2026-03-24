---
name: T-BATCH-MODE
status: open
description: Parallel game execution with bounded concurrency, per-game logs, and batch manifest
related_tasks:
  T-CLI-RUNNER: upstream, batch wraps single-game runner
---

## Description

Add batch execution mode that runs N games in parallel with configurable concurrency. Each game produces its own JSONL log in a per-batch output directory. A batch manifest summarizes all games with outcome metadata. Partial batches must not lose completed game logs.

Requirements: EXEC-02, EXEC-03

## Acceptance Criteria

- `boardgame-ai batch --count N --concurrency C` runs N games with at most C in flight simultaneously
- Each game produces its own JSONL log file in a per-batch output directory
- Partial batch (e.g., crash mid-run) does not lose completed game logs
- Batch manifest file lists all games with outcome metadata (faction winner, model assignments, Merlin assassination result)

## Out of Scope

- Rate-limit-aware concurrency per provider (v2 EXEC-04)
- Cross-game analytics (v2 ANLYS-02)
- Cost tracking (v2 ANLYS-03)

## Related Files

- src/ (Engine, Recorder, CLI from earlier phases)

## Work History

- Created from Phase 5 requirements (EXEC-02, EXEC-03)
