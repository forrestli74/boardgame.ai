---
name: T-AVALON-ROLES
status: open
description: Role assignment and information visibility for 5-10 player Avalon games
related_tasks:
  T-AVALON-GAME-FLOW: downstream, uses role assignments and views
---

## Description

Implement Avalon role assignment and role-specific visibility rules. Each player must be assigned a valid role for their game size, and each player's view of game state must contain only information their role permits. This is foundational for Phase 2 — all game flow depends on correct role setup and view isolation.

Requirements: AVLN-01, AVLN-07, AVLN-08

## Acceptance Criteria

- Role assignment covers all valid configurations for 5–10 players (correct counts of Merlin, Percival, Morgana, Assassin, Mordred, Oberon, loyal servants, minions)
- Merlin sees evil players (except Mordred)
- Percival sees Merlin and Morgana (indistinguishable)
- Evil players see each other (except Oberon)
- Loyal servants see only public state
- Each player's view object contains only permitted information — no leakage of hidden roles or evil knowledge to good players

## Out of Scope

- Game flow (team proposals, voting, quests) — see T-AVALON-GAME-FLOW
- LLM integration — see T-LLM-PLAYER
- Custom role configurations beyond standard Avalon rules

## Related Files

- src/ (Game interface implementation from Phase 1)
- .planning/phases/01-data-model/ (Phase 1 artifacts)

## Work History

- Created from Phase 2 requirements (AVLN-01, AVLN-07, AVLN-08)
