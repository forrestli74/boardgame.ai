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

```
You are {name}, playing a board game.

{strategyDoc}

Your role: {role info from view, if available}

You have a private memory that persists between turns. Use it to track observations,
suspicions, and plans. Keep it concise — under {memoryCap} words. Focus on what matters
most for your next decisions.

Think carefully before acting. Your reasoning is private and will not be shared with
other players.

{persona}
```

### Player Interface

The `Player` interface has `act(request) → Promise<unknown>`. The Engine validates the action via `actionSchema`. But now the LLM returns `{ reasoning, memory, action }` — the Engine only sees `action` after extraction.

The extraction happens inside `LLMPlayer.act()`:
1. Call LLM with wrapped schema (`{ reasoning, memory, action: <original schema> }`)
2. Extract `action` to return to Engine
3. Store `memory` internally
4. Store `reasoning` for the Engine's player event (via a getter or the return value)

Problem: the `Player` interface returns `Promise<unknown>` — there's no way to pass reasoning back. Options:

**Option A**: Return the full `{ reasoning, memory, action }` object. The Engine's `actionSchema.safeParse()` will fail since it expects just the action. The Engine retries, which breaks things.

**Option B**: Return just `action`. Store reasoning internally. Add a `lastReasoning` getter. The Engine checks for it after `act()` and includes it in the player event.

**Option C**: Wrap the action schema at the Engine level to include reasoning. This couples Engine to LLM players.

**Chosen: Option B** — minimal interface change. The Engine already constructs player events (line 53-59 in engine.ts). It can check for `lastReasoning` on the player:

```typescript
// In Engine, after getting the action:
const reasoning = 'lastReasoning' in player ? (player as any).lastReasoning : undefined
this.emit({
  source: 'player',
  gameId: config.gameId,
  playerId: response.playerId,
  data: parsed,
  reasoning,
  timestamp: new Date().toISOString(),
})
```

The `PlayerEventSchema` already has `reasoning: z.string().optional()` — it's already in the event schema.

## Constructor

```typescript
interface LLMPlayerOptions {
  model?: string
  persona?: string
  strategyDoc?: string
  memoryCap?: number  // soft cap in words, default 300
}

class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  lastReasoning?: string  // public getter for Engine

  constructor(id: string, name: string, options?: LLMPlayerOptions)
}
```

## Files

```
src/players/llm-player.ts        # Replace current implementation
src/players/llm-player.test.ts   # Update tests
src/core/engine.ts                # Check for lastReasoning on player
```

## What Changes

- `LLMPlayer`: adds memory (instance state), chain-of-thought, strategy doc, wraps action schema
- `Engine`: reads `lastReasoning` from player after `act()`, includes in player event
- `LLMPlayerOptions`: adds `strategyDoc`, `memoryCap`
- System prompt: completely rewritten with memory + reasoning instructions

## What Doesn't Change

- `Player` interface — still `act(request) → Promise<unknown>`
- `ActionRequest` — still `{ playerId, view, actionSchema }`
- `GameEvent` / `PlayerEventSchema` — already supports `reasoning` field
- How games work — games still yield requests, get actions back
- Discussion module — unaffected

## Out of Scope

- Belief tracking (structured suspicion tables)
- Multi-call reasoning (one call per turn)
- Memory sharing between players
- Role-specific strategy doc splitting (full doc sent to all)
