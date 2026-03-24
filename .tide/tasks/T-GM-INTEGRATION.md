---
name: T-GM-INTEGRATION
status: resolved
description: End-to-end integration test running Tic-Tac-Toe with AI Game Master and real LLM
related_tasks:
  T-AI-GAME-MASTER: upstream, the game master class
  T-RULES-DOC: upstream, the rules document
---

## Description

Integration test that runs a complete Tic-Tac-Toe game using:
- `AIGameMaster` with `rules/tic-tac-toe.md`
- Real LLM API calls (requires `ANTHROPIC_API_KEY`)
- Simple fixed-move players (like the existing GuessingGame integration test)
- `Engine` + `Recorder` from core

Validates the full pipeline: rules doc → LLM interpretation → Game interface → Engine orchestration → JSONL output.

## Acceptance Criteria

- Test runs a complete Tic-Tac-Toe game end-to-end with real LLM
- Players make predetermined moves via fixed player implementations
- Game reaches terminal state with correct outcome
- JSONL log file is produced with valid events
- Test skips gracefully if `ANTHROPIC_API_KEY` is not set

## Out of Scope

- Performance benchmarks
- Multiple game types in one test

## Related Files

- `src/ai-game-master/integration.test.ts` (output)
- `src/integration.test.ts` (read — existing pattern to follow)

## Work History

- Created `src/ai-game-master/integration.test.ts` with full end-to-end test
- Test uses `AIGameMaster` + `LLMClient` + `AsyncEngine` + `Recorder` with `rules/tic-tac-toe.md`
- `FixedTTTPlayer` provides predetermined moves: X plays diagonal win, O plays top row
- Skips gracefully when `ANTHROPIC_API_KEY` is absent, 120s timeout for LLM calls
- Assertions: outcome exists, both players scored, scores sum to 1, terminal state, JSONL log valid
- Typecheck passes, all 71 tests pass (integration test correctly skipped without API key)
