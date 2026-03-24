---
name: T-LLM-CLIENT
status: resolved
description: Thin Anthropic SDK wrapper with tool_use for structured LLM output
related_tasks:
  T-AI-GAME-MASTER: downstream, game master calls LLM through this client
---

## Description

Wrap `@anthropic-ai/sdk` (already a dependency) to provide structured output via tool_use. The client sends a system prompt + messages + a tool definition, and extracts the structured JSON from the tool_use response.

Default model: `claude-sonnet-4-20250514`. Model should be configurable.

## Acceptance Criteria

- `LLMClient` class with `call(systemPrompt, messages, toolSchema) → structured JSON`
- Uses Anthropic SDK `messages.create` with tool_use
- Extracts tool input from response
- Configurable model name
- Exported from `src/ai-game-master/llm-client.ts`

## Out of Scope

- Multi-provider support (Anthropic only for now)
- Retry logic (handled by caller)
- Streaming

## Related Files

- `src/ai-game-master/llm-client.ts` (output)

## Work History

- Created `src/ai-game-master/llm-client.ts` with `LLMClient` class, `LLMClientOptions`, and `ToolDefinition` interfaces
- Uses `messages.create` with `tool_choice: { type: 'tool', name }` to force tool use
- Extracts `input` from the `tool_use` content block; throws if none found
- Default model: `claude-sonnet-4-20250514`, configurable via constructor
- `pnpm run typecheck` passes clean
