---
name: T-RANDOM-SEED
status: open
description: Deterministic game generation from a random seed for reproducible games and training data
related_tasks:
  T-AI-GAME-MASTER: sibling, game master should accept seed for deterministic behavior
  T-BATCH-MODE: downstream, batch runs can assign per-game seeds
---

## Description

Add support for seeded random number generation so that game setup and any randomized decisions (e.g., role assignment, turn order, shuffling) are deterministic given the same seed. This enables reproducible games for debugging, testing, and consistent training data generation.

## Acceptance Criteria

- A seed (number or string) can be passed when creating a game
- All random decisions within a game use a seeded PRNG derived from that seed
- Running the same game with the same seed and same player decisions produces identical outcomes
- When no seed is provided, a random one is generated and recorded in the game log
- The seed is included in the JSONL output for traceability

## Out of Scope

- LLM response determinism (temperature/seed on the API side)
- Replay/playback system beyond seed-based reproducibility

## Related Files

- `src/core/engine.ts`
- `src/core/game.ts`
- `src/core/types.ts`

## Work History
