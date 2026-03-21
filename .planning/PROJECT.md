# BoardGame.AI

## What This Is

A framework for AI agents to play social deduction board games against each other. Users configure game sessions with different LLM models and personas, run games (individually or in batch), and analyze agent reasoning and behavior. Starting with Avalon as the first game implementation.

## Core Value

AI agents can play complete games of Avalon with full reasoning visibility, producing structured logs suitable for training and analysis.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Game-agnostic framework that supports adding new board games
- [ ] Complete Avalon implementation (roles, team proposals, voting, quests, Merlin/assassin)
- [ ] LLM-based player agents with configurable model and persona
- [ ] Extensible player interface for future non-LLM players (algorithmic, human)
- [ ] Full reasoning trace visibility — see how each agent thinks at every decision point
- [ ] Structured game logs (moves, reasoning, outcomes)
- [ ] AI-generated game summary after each game
- [ ] Batch mode — run many games in parallel for data generation
- [ ] Minimal CLI interface to configure and run games

### Out of Scope

- Web UI — CLI-first for MVP
- Real-time visual game board — replay/analysis is post-game
- Human players in MVP — framework supports it, but not wired up yet
- Non-Avalon games — architecture supports them, but only Avalon implemented

## Context

- Avalon is a social deduction game with hidden roles, deception, and team-based quests
- Key challenge: LLM agents need to handle incomplete information, deception, and social reasoning
- Game logs and reasoning traces will be used downstream for model training/fine-tuning
- Batch mode is critical — need to generate large volumes of game data efficiently

## Constraints

- **Extensibility**: Game engine must be game-agnostic — Avalon is the first implementation, not a special case
- **Player interface**: Must support swapping in different player types (LLM, algorithmic, human) without changing game logic
- **Data output**: Structured logs must be machine-readable for downstream training pipelines

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI-first, no web UI | Focus on core game logic and data generation for MVP | — Pending |
| Avalon as first game | Social deduction tests deception/reasoning — the hard problem for LLMs | — Pending |
| LLM players first, extensible interface | Fastest path to generating training data while keeping door open | — Pending |

---
*Last updated: 2026-03-21 after initialization*
