---
name: T-LLM-PLAYER
status: resolved
description: LLM-backed Player implementation that uses the game view and action schema to decide moves
related_tasks:
  T-LLM-CLIENT: upstream, provides the LLM calling mechanism
  T-AI-GAME-MASTER: sibling, game master is the other LLM-powered component
---

## Description

Implement a Player that uses an LLM to choose actions. The player receives an `ActionRequest` containing a game view (opaque to the player) and an action schema, then prompts the LLM to pick a valid action. The player must be game-agnostic — it works with any game's view and schema without game-specific logic.

## Acceptance Criteria

- Implements the `Player` interface (`act(request) → Promise<unknown>`)
- Sends the game view and a description of valid actions (derived from the action schema) to the LLM
- Returns a response that conforms to the action schema
- Works with any game, not just a specific one
- Has a system prompt that instructs the LLM to reason about the game state before choosing
- Configurable model and API key via constructor options
- Unit tests with mocked LLM responses

## Out of Scope

- Game-specific strategy or prompts (player is generic)
- Conversation memory across turns (stateless per request)
- Retry logic for invalid LLM responses (engine already retries)

## Related Files

- `src/players/llm-player.ts` (new)
- `src/core/player.ts`
- `src/core/types.ts`
- `src/ai-game-master/llm-client.ts`

## Work History

- 2026-03-24: Implemented `LLMPlayer` in `src/players/llm-player.ts` and tests in `src/players/llm-player.test.ts`. 8 tests passing, typecheck clean. Key decisions:
  - Uses Zod v4 `toJSONSchema()` to convert the action schema into JSON Schema for the LLM tool call
  - System prompt instructs step-by-step reasoning before choosing an action
  - `persona` option allows injecting strategy hints per-player
  - String views passed through as-is; object views JSON-stringified
  - Errors from LLM client propagate naturally (engine handles retries)
- 2026-03-24: Decomposed into T-LLM-PLAYER-IMPL and T-LLM-PLAYER-TEST sub-tasks, both resolved. All acceptance criteria met.
