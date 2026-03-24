---
name: T-LLM-PLAYER
status: open
description: LLM player with multi-provider support, structured output validation, and reasoning capture
related_tasks:
  T-AVALON-GAME-FLOW: upstream, game must be playable first
  T-LLM-PROMPTS: sibling, prompt components injected into this player
  T-DISCUSSION: sibling, discussion capability added to this player
  T-CLI-RUNNER: downstream, CLI uses this player
---

## Description

Implement an LLM-backed Player that can play Avalon through the existing Player interface. Must support configurable providers (OpenAI, Anthropic), validate structured outputs via Zod schemas with retry on failure, and capture per-decision reasoning traces alongside every action.

Requirements: AGENT-01, AGENT-04, AGENT-05

## Acceptance Criteria

- LLM player configured with any supported provider (OpenAI, Anthropic) and model string makes valid game decisions — proposal, vote, quest choice, assassination
- Invalid LLM responses trigger retry with clarification (up to 3 attempts) before the game errors
- Each decision includes a captured private reasoning trace separate from any public statement
- No manual JSON parsing — structured output via provider SDKs or Zod validation

## Out of Scope

- Role-specific prompt engineering — see T-LLM-PROMPTS
- Discussion statements — see T-DISCUSSION
- CLI wiring — see T-CLI-RUNNER

## Related Files

- src/ (Player interface from Phase 1)

## Work History

- Created from Phase 3 requirements (AGENT-01, AGENT-04, AGENT-05)
