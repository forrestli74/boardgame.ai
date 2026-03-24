# Project

## What This Is

A framework for AI agents to play social deduction board games against each other. Users configure game sessions with different LLM models and personas, run games (individually or in batch), and analyze agent reasoning and behavior. Starting with Avalon as the first game.

## Core Value

AI agents can play complete games of Avalon with full reasoning visibility, producing structured logs suitable for training and analysis.

## Context

- Avalon is a social deduction game with hidden roles, deception, and team-based quests
- Key challenge: LLM agents need to handle incomplete information, deception, and social reasoning
- Game logs and reasoning traces will be used downstream for model training/fine-tuning
- Batch mode is critical — need to generate large volumes of game data efficiently

## Constraints

- **Extensibility**: Game engine must be game-agnostic — Avalon is the first implementation, not a special case
- **Player interface**: Must support swapping in different player types (LLM, algorithmic, human) without changing game logic
- **Data output**: Structured logs must be machine-readable for downstream training pipelines
- **CLI-first**: No web UI for MVP

## Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Web UI / visual game board | CLI-first; replay from structured logs later |
| Built-in RL training loop | Training is a separate concern; export logs for external frameworks |
| Automatic prompt optimization | Breaks reproducibility required for valid training data |
| Persistent agent memory across games | Creates non-stationarity; breaks statistical independence of batch data |
| Non-Avalon game implementations | Architecture supports it, but only Avalon in v1 |
| Tournament brackets | Win-rate stats from batch runs achieve the same goal |

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| CLI-first, no web UI | Focus on core game logic and data generation for MVP |
| Avalon as first game | Social deduction tests deception/reasoning — the hard problem for LLMs |
| Data model before game engine | Hidden information leakage and flat log schema are HIGH recovery cost pitfalls; types must be locked first |
| No generics in framework types | Runtime game switching; `unknown` at boundaries, Zod validates |
