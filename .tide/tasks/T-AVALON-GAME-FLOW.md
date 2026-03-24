---
name: T-AVALON-GAME-FLOW
status: open
description: Complete Avalon game loop — propose, vote, quest, assassination — runnable with deterministic inputs
related_tasks:
  T-AVALON-ROLES: upstream, depends on role assignment and views
  T-LLM-PLAYER: downstream, LLM agents play through this game flow
  T-DISCUSSION: downstream, adds discussion before voting
---

## Description

Implement the full Avalon game state machine: team proposal, team voting, quest execution, game end conditions, and Merlin assassination. A complete game must run to a valid end state when given deterministic (scripted) player inputs — no LLMs required. All phase transitions and outcomes must be verifiable via deterministic test scenarios.

Requirements: AVLN-02, AVLN-03, AVLN-04, AVLN-05, AVLN-06

## Acceptance Criteria

- Leader proposes a team of the required size for the current quest
- All players vote approve/reject on the proposed team
- Approved team members secretly choose success/fail (evil players may fail; good players must succeed)
- Game terminates on 3 quest successes (good wins) or 3 quest failures (evil wins)
- On good quest victory, Merlin assassination phase fires — assassin guesses Merlin and outcome resolves correctly
- 5th consecutive rejected proposal forces the current team (hammer rule)
- All transitions verifiable with scripted inputs producing expected outputs

## Out of Scope

- Role assignment and visibility — see T-AVALON-ROLES
- LLM players — see T-LLM-PLAYER
- Discussion between players — see T-DISCUSSION

## Related Files

- src/ (Game interface, Engine, Recorder from Phase 1)

## Work History

- Created from Phase 2 requirements (AVLN-02, AVLN-03, AVLN-04, AVLN-05, AVLN-06)
