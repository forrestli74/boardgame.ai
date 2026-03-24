---
name: T-GM-PROMPTS
status: resolved
description: System prompt and message builders for AI Game Master LLM calls
related_tasks:
  T-AI-GAME-MASTER: downstream, game master uses these prompt builders
  T-LLM-CLIENT: sibling, prompts are passed to the LLM client
---

## Description

Build the prompt layer that converts game state + rules into LLM messages. Key design: full rules doc and full state are included in every call to prevent drift (LLM is stateless between calls).

Components:
- System prompt: instructs the LLM to act as a game master, interpret rules faithfully, manage state, handle hidden information
- Init message builder: rules doc + player config → first turn prompt
- HandleResponse message builder: rules doc + current state + player action → next turn prompt
- Tool definition: describes the structured JSON output format the LLM must return

## Acceptance Criteria

- `buildSystemPrompt()` returns game master system prompt
- `buildInitMessage(rulesDoc, config)` returns user message for game initialization
- `buildActionMessage(rulesDoc, state, playerId, action)` returns user message for handling a player action
- `buildToolDefinition()` returns Anthropic tool schema matching LLMGameResponse
- All exported from `src/ai-game-master/prompts.ts`

## Out of Scope

- Prompt optimization / few-shot examples
- Token counting / context window management

## Related Files

- `src/ai-game-master/prompts.ts` (output)

## Work History

- Created `src/ai-game-master/prompts.ts` with all four exports: `buildSystemPrompt`, `buildInitMessage`, `buildActionMessage`, `buildToolDefinition`
- `llm-client.ts` was populated externally with full `LLMClient` class and `ToolDefinition` interface
- Typecheck passes cleanly
