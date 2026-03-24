---
name: T-RULES-DOC
status: resolved
description: Example Tic-Tac-Toe rules document for AI Game Master
related_tasks:
  T-GM-INTEGRATION: downstream, integration test uses this rules doc
---

## Description

Write a Tic-Tac-Toe rules document in markdown. This serves as the first example of the rules format and is used in the integration test. Free-form markdown — the LLM interprets it.

Should cover: players, setup, turn structure, valid actions, winning conditions, scoring, and what each player can see.

## Acceptance Criteria

- `rules/tic-tac-toe.md` is a complete, unambiguous rules document
- Covers: player count, setup, turns, actions, win/draw conditions, scoring, player views
- Written for LLM consumption (clear, explicit, no ambiguity)

## Out of Scope

- Structured/machine-readable format (free-form markdown is intentional)

## Related Files

- `rules/tic-tac-toe.md` (output)

## Work History

- Created `rules/tic-tac-toe.md` covering all required sections: game overview, players (X/O mapped from config positions), setup with initial state JSON, game state structure (board/currentPlayer/moveCount), turn flow, action JSON Schema with validation rules, player views (full information), winning conditions (all 8 lines enumerated), draw condition, scoring table, and event definitions (game_start, player_move, game_end). Verified file exists. Marked resolved.
