---
name: T-LLM-PROMPTS
status: open
description: Role-specific prompt components and configurable persona/strategy for LLM agents
related_tasks:
  T-LLM-PLAYER: upstream, prompts are injected into this player
  T-AVALON-ROLES: upstream, role definitions inform prompt content
---

## Description

Build the prompt engineering layer for LLM players. Each Avalon role needs distinct system-level prompt components (Merlin prompt differs from loyal servant prompt). Players also accept a configurable persona/strategy string injected into the system prompt.

Requirements: AGENT-02, AGENT-03

## Acceptance Criteria

- Each role (Merlin, Percival, Morgana, Assassin, Mordred, Oberon, loyal servant, minion) has a distinct prompt component
- Role-specific prompts produce observable behavioral differences (e.g., Merlin prompt includes knowledge of evil players)
- Configurable persona/strategy string is injected into the agent system prompt
- Prompt components compose cleanly with the base LLM player

## Out of Scope

- LLM provider integration and retry logic — see T-LLM-PLAYER
- Automatic prompt optimization

## Related Files

- src/ (Player interface, role types from Phase 1-2)

## Work History

- Created from Phase 3 requirements (AGENT-02, AGENT-03)
