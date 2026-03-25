---
name: T-LLM-PLAYER-IMPL
status: resolved
description: Create src/players/llm-player.ts implementing the Player interface with LLM-backed action selection
related_tasks:
  T-LLM-PLAYER: parent task
  T-LLM-CLIENT: upstream, provides LLMClient
---

## Description

Create `src/players/llm-player.ts` that implements the `Player` interface. The player uses `LLMClient` to choose actions by converting the `ActionRequest`'s Zod action schema to JSON Schema (via `z.toJSONSchema()`), sending it as a tool definition to the LLM along with the game view, and returning the LLM's tool call output.

Key design decisions (from parent task):
- Use Zod v4 `z.toJSONSchema()` to convert action schema to JSON Schema for the LLM tool definition
- System prompt instructs step-by-step reasoning before choosing an action
- `persona` option allows injecting strategy hints per-player
- String views passed through as-is; object views JSON-stringified
- Errors from LLM client propagate naturally (engine handles retries)

## Acceptance Criteria

- Implements `Player` interface (`id`, `name`, `act(request) => Promise<unknown>`)
- Constructor accepts `id`, `name`, and options (`model`, `apiKey`, `persona`)
- Converts `actionSchema` to JSON Schema via `z.toJSONSchema()`
- Builds a system prompt with reasoning instructions and optional persona
- Formats the game view as a user message
- Calls `LLMClient.call()` with system prompt, messages, and tool definition
- Returns the LLM response directly
- Typechecks clean with `pnpm run typecheck`

## Out of Scope

- Tests (handled by T-LLM-PLAYER-TEST)
- Game-specific prompts or strategy

## Related Files

- `src/players/llm-player.ts` (new, output)
- `src/core/player.ts` (interface to implement)
- `src/core/types.ts` (ActionRequest type)
- `src/ai-game-master/llm-client.ts` (LLMClient dependency)

## Work History

- 2026-03-24: Created `src/players/llm-player.ts`. Typecheck passes clean. Key details:
  - `LLMPlayer` class implements `Player` with `id`, `name`, `act()`
  - Constructor accepts `(id, name, options?)` where options has `model`, `apiKey`, `persona`
  - Uses `z.toJSONSchema()` to convert Zod action schema to JSON Schema for tool definition
  - System prompt with step-by-step reasoning instructions, optional persona appended
  - String views passed as-is, object views JSON-stringified
