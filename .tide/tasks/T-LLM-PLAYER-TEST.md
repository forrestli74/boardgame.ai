---
name: T-LLM-PLAYER-TEST
status: resolved
description: Unit tests for LLMPlayer with mocked LLM responses
related_tasks:
  T-LLM-PLAYER: parent task
  T-LLM-PLAYER-IMPL: upstream, implementation to test
---

## Description

Create `src/players/llm-player.test.ts` with unit tests for `LLMPlayer`. Mock `LLMClient` using `vi.fn()` (matching the pattern in `game-master.test.ts`). Cover the key behaviors: schema conversion, view formatting, persona inclusion, and error propagation.

## Acceptance Criteria

- Tests pass with `pnpm test`
- Covers: basic action selection, string vs object views, persona in system prompt, schema passed as tool definition, error propagation from LLM client
- Uses mocked LLMClient (no real API calls)

## Out of Scope

- Integration tests with real LLM
- Game-specific test scenarios

## Related Files

- `src/players/llm-player.test.ts` (new, output)
- `src/players/llm-player.ts` (module under test)

## Work History

- 2026-03-24: Created `src/players/llm-player.test.ts` with 8 tests, all passing. Coverage:
  - Player interface (id, name properties)
  - LLM call with system prompt, user message, tool definition
  - String view pass-through
  - Object view JSON-stringification
  - Persona inclusion/exclusion in system prompt
  - Error propagation from LLM client
  - Action schema conversion to JSON Schema
  - Mock uses class-based `vi.mock()` pattern (arrow function mock fails as constructor)
