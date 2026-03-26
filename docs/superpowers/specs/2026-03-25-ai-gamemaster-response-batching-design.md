# AIGameMaster Response Batching

## Problem

When multiple players act simultaneously (e.g., voting in Avalon), the Engine calls `AIGameMaster.handleResponse()` once per player. Each call triggers an LLM call via `generateText()`. With 5 players voting, this means 5 serial LLM calls — each taking seconds — when logically the game master could process all votes in a single call.

## Solution

AIGameMaster internally batches `handleResponse` calls. It tracks which players it's waiting for (from the requests it issued), queues incoming responses, and fires a single LLM call when all pending responses have arrived. No changes to the Engine or Game interface.

## Design

### New State in AIGameMaster

```typescript
// Players we're waiting to hear from (set after each LLM response)
private pendingPlayerIds = new Set<string>()

// Queued responses, ordered by arrival
private responseQueue: Array<{ playerId: string; action: unknown }> = []
```

### Modified `processLLMResponse`

After building the requests array, populate `pendingPlayerIds`:

```typescript
private processLLMResponse(llmResponse: LLMGameResponse): GameResponse {
  // ... existing state/outcome/terminal updates ...

  const requests: ActionRequest[] = llmResponse.requests.map(...)

  // Track who we're waiting for
  this.pendingPlayerIds = new Set(requests.map(r => r.playerId))
  this.responseQueue = []

  // ... build events ...
  return { requests, events }
}
```

### Modified `handleResponse`

```typescript
async handleResponse(playerId: string, action: unknown): Promise<GameResponse> {
  this.responseQueue.push({ playerId, action })
  this.pendingPlayerIds.delete(playerId)

  // Still waiting for more players — return no-op
  if (this.pendingPlayerIds.size > 0) {
    return { requests: [], events: [] }
  }

  // All responses collected — batch into single LLM call
  const systemPrompt = buildSystemPrompt()
  const userMessage = this.responseQueue.length === 1
    ? buildActionMessage(this.rulesDoc, this.state, this.responseQueue[0].playerId, this.responseQueue[0].action)
    : buildBatchActionMessage(this.rulesDoc, this.state, this.responseQueue)

  const raw = await this.callLLM(systemPrompt, userMessage)
  const parsed = LLMGameResponseSchema.parse(raw)

  return this.processLLMResponse(parsed)
}
```

When only 1 response is queued, use the existing `buildActionMessage` for backward compatibility. When multiple are queued, use the new `buildBatchActionMessage`.

### New Prompt: `buildBatchActionMessage`

```typescript
export function buildBatchActionMessage(
  rulesDoc: string,
  state: Record<string, unknown>,
  actions: Array<{ playerId: string; action: unknown }>,
): string {
  const actionList = actions.map(({ playerId, action }) => {
    if (action === null) {
      return `- Player "${playerId}": Failed to submit a valid action (treat as abstain/skip per rules)`
    }
    return `- Player "${playerId}": ${JSON.stringify(action, null, 2)}`
  }).join('\n')

  return `Multiple players have submitted actions simultaneously.

## Rules Document

${rulesDoc}

## Current Game State

${JSON.stringify(state, null, 2)}

## Player Actions (in order received)

${actionList}

## Instructions

1. Validate each action against the rules and current state.
2. For any invalid action, emit an event explaining the rejection and re-request that player's turn.
3. For valid actions, apply them all to the game state in the order listed above.
4. After applying all actions, check for terminal conditions (win/loss/draw).
5. If the game is over, set isTerminal to true and provide the outcome with scores.
6. Otherwise, determine which player(s) must act next and return their action requests.`
}
```

### How It Works with the Engine (No Engine Changes)

```
Engine loop iteration 1:
  - requests = [p1, p2, p3] (from init or previous handleResponse)
  - pending = {p1: promise, p2: promise, p3: promise}
  - Promise.race → p2 resolves first
  - game.handleResponse(p2, action2) → queued, returns { requests: [], events: [] }
  - requests = []  (no-op)
  - isTerminal() → false

Engine loop iteration 2:
  - requests = [] → no new pending added
  - pending = {p1: promise, p3: promise}  (p2 was deleted)
  - Promise.race → p1 resolves
  - game.handleResponse(p1, action1) → queued, returns { requests: [], events: [] }

Engine loop iteration 3:
  - pending = {p3: promise}
  - Promise.race → p3 resolves
  - game.handleResponse(p3, action3) → all pending collected! Makes 1 LLM call
  - Returns real GameResponse with new requests
  - Engine continues with new requests
```

### Null Action Handling

When the Engine's `validateWithRetry` exhausts all retries, it passes `null` to `handleResponse`. The batch prompt explicitly handles this: "Failed to submit a valid action (treat as abstain/skip per rules)". The LLM decides how to handle it based on the game's rules.

### Order Preservation

Responses are pushed to `responseQueue` in the order they arrive (the order the Engine processes them via `Promise.race`). The batch prompt lists them in this order. The LLM is instructed to apply them in order.

## Documentation Updates

Update `docs/architecture.md` Concurrency section to document the batching behavior:
- AIGameMaster batches simultaneous player responses into a single LLM call
- When multiple players must act, intermediate `handleResponse` calls return no-ops
- The final response triggers the actual LLM call with all actions

## Files to Modify

- `src/ai-game-master/game-master.ts` — Add queue/pending state, modify handleResponse and processLLMResponse
- `src/ai-game-master/prompts.ts` — Add `buildBatchActionMessage`
- `docs/architecture.md` — Document batching behavior in Concurrency section

## Verification

1. **Unit tests** (`game-master.test.ts`):
   - Single response: behaves same as before (no batching)
   - Multiple responses: intermediate calls return no-op, final call returns real response
   - Null action in batch: included in prompt with skip message
   - Order preserved: queue order matches call order

2. **Integration test** (`integration.test.ts` or `avalon-integration.test.ts`):
   - Run a multi-player simultaneous action scenario (e.g., Avalon voting)
   - Verify only 1 LLM call is made for the batch (can count via mock/spy)
   - Verify game state is correct after batched processing
