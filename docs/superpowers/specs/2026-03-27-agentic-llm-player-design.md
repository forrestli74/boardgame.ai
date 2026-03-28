# Agentic LLM Player

## Goal

Upgrade `LLMPlayer` from stateless to agentic: persistent memory across turns, chain-of-thought reasoning, persona with role strategy document. Replaces the current implementation.

## Design

### Memory

Each player maintains a string memory that persists across `act()` calls within a game. On each turn, the LLM receives the current memory and outputs an updated memory alongside its action.

- Memory is a free-form string — the LLM decides what to remember
- Soft size cap via prompt instruction (e.g., "keep memory under 300 words")
- Cap is configurable via constructor (`memoryCap`, default 300 words)
- Memory starts empty at game start
- No hard truncation — soft cap is a prompt instruction the LLM naturally follows

### Chain of Thought

Each turn produces private reasoning before the action. The reasoning is:
- Logged (returned alongside the action for the Engine to record)
- NOT shared with other players
- Captured via a `reasoning` field in the tool response

### Role Strategy Document

A single markdown document covering strategy for all roles. Included as part of the `persona` string — no new option needed. The caller concatenates persona + strategy into one string.

### LLM Call Structure

One LLM call per turn. The tool schema requires three fields:

```typescript
z.object({
  reasoning: z.string().describe('Your private reasoning about the current situation'),
  memory: z.string().describe('Updated memory — keep concise, under N words'),
  action: <actionSchema>,  // from the ActionRequest
})
```

The LLM outputs reasoning + updated memory + action in a single structured response.

### System Prompt

Concatenated from parts, not formatted with templates:

1. Base instruction (always): "You are a board game player. ..."
2. `persona` (if provided) — may include strategy doc, personality, etc.
3. Memory instruction (always): "You have a private memory that persists between turns. Keep it concise, under 300 words."
4. Reasoning instruction (always): "Think carefully before acting. Your reasoning is private."

Memory cap (300 words) is hardcoded in the prompt. Role info comes from the `view` (set by the game), not the player prompt.

### Reasoning — Internal to LLMPlayer

`LLMPlayer.act()` returns only the action. Reasoning and memory are internal — the `Player` interface and Engine don't change.

The LLM returns `{ reasoning, memory, action }` via tool use. `LLMPlayer.act()` extracts `action` to return, stores `memory` and `reasoning` internally.

**Dev visibility options for reasoning/memory (pick later):**

1. **Event callback** — `LLMPlayerOptions.onThought?: (data: { reasoning, memory, action }) => void`. Called after each `act()`. Devs wire it to logging, console, etc. No interface change.
2. **Accessor methods** — `player.getMemory()`, `player.getLastReasoning()`. Devs inspect after the game. No interface change.
3. **Both** — callback for real-time, accessors for post-game analysis.

For now, implement **option 3**. The callback is optional (noop if not provided). Accessors are always available.

## Constructor

Constructor signature and options unchanged:

```typescript
interface LLMPlayerOptions {
  model?: string
  persona?: string  // includes strategy doc if desired
}
```

Caller puts strategy + personality in `persona`. No new options.

## Files

```
src/players/llm-player.ts        # Replace current implementation
src/players/llm-player.test.ts   # Update tests
```

## What Changes

- `LLMPlayer`: adds memory (instance state), chain-of-thought, wraps action schema, `onThought` callback, `getMemory()`/`getLastReasoning()` accessors
- `LLMPlayerOptions`: unchanged (persona carries strategy doc)
- System prompt: rewritten with memory + reasoning instructions (concatenated parts)

## What Doesn't Change

- `Player` interface — still `act(request) → Promise<unknown>`
- `Engine` — no changes
- `ActionRequest` — still `{ playerId, view, actionSchema }`
- Constructor signature — still `(id, name, options?)`
- How games work — games still yield requests, get actions back
- Discussion module — unaffected

## Out of Scope

- Belief tracking (structured suspicion tables)
- Multi-call reasoning (one call per turn)
- Memory sharing between players
- Role-specific strategy doc splitting (full doc sent to all)
