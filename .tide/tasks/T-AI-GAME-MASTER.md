---
name: T-AI-GAME-MASTER
status: resolved
description: AIGameMaster class implementing Game interface using LLM to interpret rule documents
related_tasks:
  T-JSON-ZOD: upstream, provides JSON Schema → Zod converter and response schemas
  T-LLM-CLIENT: upstream, provides LLM communication
  T-GM-PROMPTS: upstream, provides prompt builders
  T-GM-INTEGRATION: downstream, integration test validates end-to-end
---

## Description

The core class: `AIGameMaster` implements the existing `Game` interface. It takes a markdown rules document and an LLM client, then uses the LLM on every `init()` and `handleResponse()` call to manage game state, generate action requests, and determine outcomes.

Flow:
- `init(config)` → LLM call with rules + players → initial state, first action requests
- `handleResponse(playerId, action)` → LLM call with rules + state + action → updated state, new requests
- `isTerminal()` / `getOutcome()` → return cached values from last LLM response

The LLM returns JSON Schema for valid actions; we convert to Zod via T-JSON-ZOD's converter.

## Acceptance Criteria

- `AIGameMaster` implements `Game` interface from `src/core/game.ts`
- Constructor takes `rulesDoc: string` and `llmClient: LLMClient`
- `init()` calls LLM, returns `GameResponse` with proper `ActionRequest[]` (Zod schemas from JSON Schema)
- `handleResponse()` calls LLM, returns updated `GameResponse`
- `isTerminal()` and `getOutcome()` reflect last LLM response
- Events are properly formatted as `GameEvent`
- Exported from `src/ai-game-master/game-master.ts`

## Out of Scope

- Caching or optimization of LLM calls
- Conversation history (each call is independent with full context)

## Related Files

- `src/ai-game-master/game-master.ts` (output)
- `src/core/game.ts` (read — Game interface)
- `src/core/types.ts` (read — ActionRequest, GameResponse, GameConfig, GameOutcome)

## Work History

- Read all upstream files (schemas.ts, llm-client.ts, prompts.ts) and core interfaces (Game, types, events, engine, player)
- Identified sync/async mismatch: Game.init() and handleResponse() are sync but LLM calls are async
- Created AsyncGame interface in `src/ai-game-master/async-game.ts` — identical to Game but init/handleResponse return Promise
- Created AsyncEngine in `src/ai-game-master/async-engine.ts` — adapted from Engine with await on init/handleResponse
- Created AIGameMaster in `src/ai-game-master/game-master.ts` implementing AsyncGame
  - Constructor takes rulesDoc + llmClient
  - init() calls LLM via buildInitMessage, parses with LLMGameResponseSchema
  - handleResponse() calls LLM via buildActionMessage with current state
  - processLLMResponse() converts JSON Schema to Zod, formats GameEvents
  - isTerminal()/getOutcome() return cached values
- Created 13 unit tests in game-master.test.ts covering init, handleResponse, terminal detection, event formatting
- All 71 tests pass (58 existing + 13 new), typecheck clean
