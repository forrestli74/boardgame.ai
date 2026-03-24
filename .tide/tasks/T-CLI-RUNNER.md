---
name: T-CLI-RUNNER
status: open
description: Single-game CLI that configures players, runs Avalon, and writes a complete JSONL log
related_tasks:
  T-LLM-PLAYER: upstream, CLI wires up LLM players
  T-LLM-PROMPTS: upstream, CLI passes persona/model config to prompt layer
  T-DISCUSSION: upstream, discussion phase is part of the game
  T-BATCH-MODE: downstream, batch mode wraps this CLI
---

## Description

Build a CLI command (`boardgame-ai run`) that configures and runs a single Avalon game from the command line. Accepts player configs (model, persona, role seed), writes JSONL output, and appends an AI-generated post-game summary narrative. Invalid configs are rejected before any LLM calls.

Requirements: EXEC-01, DATA-04

## Acceptance Criteria

- `boardgame-ai run` with player configs starts a game and writes JSONL log to specified output directory
- Same config run twice produces same role assignments (seed is respected)
- AI-generated post-game summary narrative is appended to game output after final event
- Invalid configs rejected with clear error before any LLM calls

## Out of Scope

- Batch execution — see T-BATCH-MODE
- Web UI

## Related Files

- src/ (Engine, Game, Player, Recorder from earlier phases)
- package.json (CLI entry point)

## Work History

- Created from Phase 4 requirements (EXEC-01, DATA-04)
