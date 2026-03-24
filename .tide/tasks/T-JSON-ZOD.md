---
name: T-JSON-ZOD
status: resolved
description: JSON Schema to Zod converter and LLM response type definitions for AI Game Master
related_tasks:
  T-AI-GAME-MASTER: downstream, game master uses these schemas and converter
---

## Description

Build the schema layer for the AI Game Master. Two responsibilities:

1. **LLM response types** — TypeScript interfaces and Zod schemas defining what the LLM returns on each game turn (updated state, action requests with JSON Schema, events, terminal/outcome).

2. **JSON Schema → Zod converter** — Runtime function that takes a JSON Schema object (as returned by the LLM) and produces a Zod schema. The LLM describes valid player actions as JSON Schema; we convert to Zod so the existing Engine can validate player responses.

Supported JSON Schema subset: string, number, integer, boolean, enum, object (with properties/required), array (with items). This covers virtually all board game actions.

## Acceptance Criteria

- `LLMGameResponse` Zod schema validates structured LLM output (state, requests, events, isTerminal, outcome)
- `jsonSchemaToZod(schema)` converts JSON Schema → Zod for: string, number, integer, boolean, enum, object, array
- Converter handles nested objects and arrays
- Unit tests cover all supported types + edge cases (unknown type throws)
- Exports from `src/ai-game-master/schemas.ts`

## Out of Scope

- Full JSON Schema spec compliance (no $ref, allOf, anyOf, etc.)
- Zod-to-JSON-Schema (reverse direction)

## Related Files

- `src/ai-game-master/schemas.ts` (output)
- `src/ai-game-master/schemas.test.ts` (output)
- `src/core/types.ts` (read — ActionRequest, GameResponse types)

## Work History

- Created `src/ai-game-master/schemas.ts` with `JsonSchema` interface, `jsonSchemaToZod()` converter (string, number, integer, boolean, object, array, enum), `LLMGameResponseSchema`, and `LLMGameResponse` type
- Created `src/ai-game-master/schemas.test.ts` with 14 tests covering all types, nesting, constraints, required/optional, error cases, and full LLM response validation
- All 58 project tests pass, typecheck clean
