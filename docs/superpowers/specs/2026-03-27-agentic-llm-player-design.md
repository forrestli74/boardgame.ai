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

A single markdown document covering strategy for all roles. Sent in full to every player — the prompt says "you are [role], focus on your section." The document is optional and provided via constructor.

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

Concatenated from parts, not formatted with templates. Each part is optional and appended if present:

1. Base instruction (always): "You are a board game player. ..."
2. `persona` (if provided)
3. `strategyDoc` (if provided)
4. Memory instruction (always): "You have a private memory that persists between turns. Keep it concise — under {memoryCap} words."
5. Reasoning instruction (always): "Think carefully before acting. Your reasoning is private."

Role info comes from the `view` (set by the game), not the player prompt.

### Reasoning — Internal to LLMPlayer

`LLMPlayer.act()` returns only the action. Reasoning and memory are internal — the `Player` interface and Engine don't change.

The LLM returns `{ reasoning, memory, action }` via tool use. `LLMPlayer.act()` extracts `action` to return, stores `memory` and `reasoning` internally.

**Dev visibility options for reasoning/memory (pick later):**

1. **Event callback** — `LLMPlayerOptions.onThought?: (data: { reasoning, memory, action }) => void`. Called after each `act()`. Devs wire it to logging, console, etc. No interface change.
2. **Accessor methods** — `player.getMemory()`, `player.getLastReasoning()`. Devs inspect after the game. No interface change.
3. **Both** — callback for real-time, accessors for post-game analysis.

For now, implement **option 3**. The callback is optional (noop if not provided). Accessors are always available.

## Constructor

Constructor signature unchanged: `constructor(id: string, name: string, options?: LLMPlayerOptions)`

```typescript
interface LLMPlayerOptions {
  model?: string
  persona?: string
  strategyDoc?: string    // new — role strategy doc, sent in full
  memoryCap?: number      // new — soft cap in words, default 300
}
```

No new public fields on the class. `Player` interface unchanged.

## Files

```
src/players/llm-player.ts        # Replace current implementation
src/players/llm-player.test.ts   # Update tests
```

## What Changes

- `LLMPlayer`: adds memory (instance state), chain-of-thought, strategy doc, wraps action schema, `onThought` callback, `getMemory()`/`getLastReasoning()` accessors
- `LLMPlayerOptions`: adds `strategyDoc`, `memoryCap`, `onThought`
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
