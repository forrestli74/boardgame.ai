---
name: T-GENERIC-LLM
status: open
description: Replace Anthropic-specific SDK with a provider-agnostic LLM client interface
related_tasks:
  T-LLM-PLAYER: sibling, LLM player depends on LLM client
---

## Description

The current `LLMClient` in `src/ai-game-master/llm-client.ts` is tightly coupled to the Anthropic SDK (`@anthropic-ai/sdk`). Refactor it to use a generic interface so the project can work with LLMs from any provider (OpenAI, Google, Mistral, local models, etc.) without requiring a separate SDK for each.

## Acceptance Criteria

- `LLMClient` exposes a provider-agnostic interface — no vendor SDK imported directly
- Swapping providers requires only configuration changes (base URL, model name, API key)
- Tool calling (structured output) continues to work across providers
- Existing tests and integration tests pass with minimal changes
- No vendor-specific SDK in `package.json`

## Related Files

- `src/ai-game-master/llm-client.ts`
- `src/ai-game-master/game-master.ts`
- `src/ai-game-master/integration.test.ts`
- `src/ai-game-master/avalon-integration.test.ts`

## Work History
