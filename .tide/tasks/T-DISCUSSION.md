---
name: T-DISCUSSION
status: open
description: Per-round discussion phase where each player makes one public statement before voting
related_tasks:
  T-AVALON-GAME-FLOW: upstream, discussion slots into the game loop before voting
  T-LLM-PLAYER: upstream, LLM player generates the statements
---

## Description

Add a simplified discussion phase to the Avalon game loop. Before each team vote, every player makes one public statement visible to all players. Statements are captured in the game log alongside other events.

Requirements: DISC-01, DISC-02

## Acceptance Criteria

- Each player makes one statement per round before voting
- Discussion statements are visible to all players during the game
- All statements are captured in the JSONL game log
- Discussion integrates with the existing game flow without breaking deterministic test scenarios

## Out of Scope

- Multi-round back-and-forth discussion (v2 COMM-01, COMM-02)
- Discussion strategy optimization

## Related Files

- src/ (Game flow, Recorder, event schema)

## Work History

- Created from Phase 3 requirements (DISC-01, DISC-02)
