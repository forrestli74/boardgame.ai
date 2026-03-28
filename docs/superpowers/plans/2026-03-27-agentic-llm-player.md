# Agentic LLM Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade LLMPlayer from stateless to agentic — persistent memory, chain-of-thought reasoning, dev visibility via accessors and callback.

**Architecture:** Replace LLMPlayer internals. Wrap the game's `actionSchema` in a larger schema (`{ reasoning, memory, action }`). Extract action to return, store memory and reasoning internally. Constructor signature unchanged.

**Tech Stack:** TypeScript, Zod, Vitest, Vercel AI SDK

**Spec:** `docs/superpowers/specs/2026-03-27-agentic-llm-player-design.md`

---

### Task 1: Rewrite System Prompt and Add Memory State

**Files:**
- Modify: `src/players/llm-player.ts`
- Modify: `src/players/llm-player.test.ts`

- [ ] **Step 1: Write failing tests for new system prompt and memory accessors**

Add these tests to `src/players/llm-player.test.ts` (keep existing mock setup and helpers):

```typescript
it('system prompt includes memory instruction', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'thinking...', memory: 'alice is suspicious', action: { position: 1 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  await player.act(makeRequest())

  const callArgs = mockGenerateText.mock.calls[0][0]
  expect(callArgs.system).toContain('private memory')
  expect(callArgs.system).toContain('300 words')
})

it('system prompt includes reasoning instruction', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'thinking...', memory: '', action: { position: 1 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  await player.act(makeRequest())

  const callArgs = mockGenerateText.mock.calls[0][0]
  expect(callArgs.system).toContain('reasoning is private')
})

it('system prompt concatenates persona when provided', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'r', memory: 'm', action: { position: 1 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice', { persona: 'Play aggressively.\n\n## Merlin Strategy\nHide your identity.' })
  await player.act(makeRequest())

  const callArgs = mockGenerateText.mock.calls[0][0]
  expect(callArgs.system).toContain('Play aggressively')
  expect(callArgs.system).toContain('Merlin Strategy')
  expect(callArgs.system).toContain('private memory')
})

it('getMemory returns empty string initially', () => {
  const player = new LLMPlayer('p1', 'Alice')
  expect(player.getMemory()).toBe('')
})

it('getLastReasoning returns undefined initially', () => {
  const player = new LLMPlayer('p1', 'Alice')
  expect(player.getLastReasoning()).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: FAIL — `getMemory` and `getLastReasoning` not defined, system prompt doesn't contain expected text

- [ ] **Step 3: Update LLMPlayer with new system prompt, memory state, and accessors**

Replace the system prompt and `buildSystemPrompt` function, add memory state and accessors in `src/players/llm-player.ts`:

```typescript
import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Player } from '../core/player.js'
import type { ActionRequest } from '../core/types.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'

export interface LLMPlayerOptions {
  model?: string
  persona?: string
}

const BASE_PROMPT = `You are a board game player. You will receive a description of the current game state visible to you, and you must choose an action.

Always respond directly. Never refuse to act.`

const MEMORY_PROMPT = `You have a private memory that persists between turns. Use it to track observations, suspicions, and plans. Keep it concise — under 300 words. Focus on what matters most for your next decisions.`

const REASONING_PROMPT = `Think carefully before acting. Your reasoning is private and will not be shared with other players.`

function buildSystemPrompt(persona?: string): string {
  const parts = [BASE_PROMPT]
  if (persona) parts.push(persona)
  parts.push(MEMORY_PROMPT)
  parts.push(REASONING_PROMPT)
  return parts.join('\n\n')
}

export class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  private readonly model: string
  private readonly persona?: string
  private memory = ''
  private lastReasoning?: string

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.model = options?.model ?? DEFAULT_MODEL
    this.persona = options?.persona
  }

  getMemory(): string { return this.memory }
  getLastReasoning(): string | undefined { return this.lastReasoning }

  async act(request: ActionRequest): Promise<unknown> {
    const systemPrompt = buildSystemPrompt(this.persona)
    const view = typeof request.view === 'string' ? request.view : JSON.stringify(request.view, null, 2)

    // For now, keep existing behavior — will be updated in Task 2
    const userMessage = `Current game state (your view):\n\n${view}\n\nChoose your action.`
    const result = await generateText({
      model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      tools: {
        submit_action: tool({
          description: 'Submit your chosen action for this turn',
          inputSchema: request.actionSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'submit_action' },
    })

    const call = result.toolCalls[0]
    if (!call) throw new Error('LLM returned no tool call')
    return call.input
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: Some new tests pass (prompt tests, accessor tests), but the wrapped schema tests may still fail since `act()` doesn't yet handle `{ reasoning, memory, action }`. That's OK — Task 2 handles the schema wrapping.

- [ ] **Step 5: Commit**

```bash
git add src/players/llm-player.ts src/players/llm-player.test.ts
git commit -m "feat: add memory state, accessors, and new system prompt to LLMPlayer"
```

---

### Task 2: Wrap Action Schema with Reasoning + Memory

**Files:**
- Modify: `src/players/llm-player.ts`
- Modify: `src/players/llm-player.test.ts`

- [ ] **Step 1: Write failing tests for schema wrapping and memory persistence**

Add to `src/players/llm-player.test.ts`:

```typescript
it('wraps actionSchema with reasoning and memory fields', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'I see an opening', memory: 'opponent plays corners', action: { position: 4 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  await player.act(makeRequest())

  const callArgs = mockGenerateText.mock.calls[0][0]
  // The tool schema should wrap the original actionSchema
  const toolSchema = callArgs.tools.submit_action
  expect(toolSchema).toBeDefined()
})

it('returns only the action from the wrapped response', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'thinking about it', memory: 'game note', action: { position: 7 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  const result = await player.act(makeRequest())

  // Should return only the action, not reasoning/memory
  expect(result).toEqual({ position: 7 })
})

it('stores memory across act() calls', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'first turn', memory: 'opponent opened with corner', action: { position: 4 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  await player.act(makeRequest())

  expect(player.getMemory()).toBe('opponent opened with corner')

  // Second call — memory should be in the user message
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'second turn', memory: 'opponent opened with corner. now taking center', action: { position: 1 } } }],
  })
  await player.act(makeRequest())

  expect(player.getMemory()).toBe('opponent opened with corner. now taking center')

  // Verify the second call included memory in the user message
  const secondCallArgs = mockGenerateText.mock.calls[1][0]
  expect(secondCallArgs.messages[0].content).toContain('opponent opened with corner')
})

it('stores lastReasoning after each act()', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'I should block', memory: '', action: { position: 2 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  await player.act(makeRequest())

  expect(player.getLastReasoning()).toBe('I should block')
})

it('includes memory in user message when memory is not empty', async () => {
  const player = new LLMPlayer('p1', 'Alice')

  // First call — no memory yet
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'r1', memory: 'note 1', action: { position: 1 } } }],
  })
  await player.act(makeRequest())

  const firstCallArgs = mockGenerateText.mock.calls[0][0]
  expect(firstCallArgs.messages[0].content).not.toContain('Your memory')

  // Second call — memory included
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'r2', memory: 'note 2', action: { position: 2 } } }],
  })
  await player.act(makeRequest())

  const secondCallArgs = mockGenerateText.mock.calls[1][0]
  expect(secondCallArgs.messages[0].content).toContain('Your memory')
  expect(secondCallArgs.messages[0].content).toContain('note 1')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: FAIL — act() doesn't wrap schema or extract action yet

- [ ] **Step 3: Update act() to wrap schema and handle response**

Replace the `act()` method in `src/players/llm-player.ts`:

```typescript
async act(request: ActionRequest): Promise<unknown> {
  const systemPrompt = buildSystemPrompt(this.persona)
  const view = typeof request.view === 'string' ? request.view : JSON.stringify(request.view, null, 2)

  const parts = ['Current game state (your view):\n\n' + view]
  if (this.memory) {
    parts.push('Your memory from previous turns:\n\n' + this.memory)
  }
  parts.push('Choose your action.')
  const userMessage = parts.join('\n\n')

  const wrappedSchema = z.object({
    reasoning: z.string().describe('Your private reasoning about the current situation'),
    memory: z.string().describe('Updated memory — keep concise, under 300 words'),
    action: request.actionSchema as z.ZodTypeAny,
  })

  const result = await generateText({
    model: registry.languageModel(this.model as Parameters<typeof registry.languageModel>[0]),
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxOutputTokens: 4096,
    tools: {
      submit_action: tool({
        description: 'Submit your reasoning, updated memory, and chosen action',
        inputSchema: wrappedSchema,
      }),
    },
    toolChoice: { type: 'tool', toolName: 'submit_action' },
  })

  const call = result.toolCalls[0]
  if (!call) throw new Error('LLM returned no tool call')

  const response = call.input as { reasoning: string; memory: string; action: unknown }
  this.memory = response.memory
  this.lastReasoning = response.reasoning

  return response.action
}
```

Remove the `isTextMode`, `actText`, and `actStructured` methods — all requests now go through the wrapped schema path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/players/llm-player.ts src/players/llm-player.test.ts
git commit -m "feat: wrap action schema with reasoning + memory, persist across turns"
```

---

### Task 3: onThought Callback

**Files:**
- Modify: `src/players/llm-player.ts`
- Modify: `src/players/llm-player.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('calls onThought callback after each act() with reasoning, memory, and action', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'my reasoning', memory: 'my memory', action: { position: 5 } } }],
  })
  const thoughts: unknown[] = []
  const player = new LLMPlayer('p1', 'Alice')
  player.onThought = (data) => thoughts.push(data)

  await player.act(makeRequest())

  expect(thoughts).toHaveLength(1)
  expect(thoughts[0]).toEqual({
    reasoning: 'my reasoning',
    memory: 'my memory',
    action: { position: 5 },
  })
})

it('does not throw when onThought is not set', async () => {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning: 'r', memory: 'm', action: { position: 1 } } }],
  })
  const player = new LLMPlayer('p1', 'Alice')
  // No onThought set — should not throw
  await expect(player.act(makeRequest())).resolves.toEqual({ position: 1 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: FAIL — `onThought` not defined on LLMPlayer

- [ ] **Step 3: Add onThought to LLMPlayer**

Add to the class in `src/players/llm-player.ts`:

```typescript
export class LLMPlayer implements Player {
  // ... existing fields ...
  onThought?: (data: { reasoning: string; memory: string; action: unknown }) => void

  // In act(), after extracting the response:
  // this.onThought?.({ reasoning: response.reasoning, memory: response.memory, action: response.action })
}
```

Add the callback invocation right after storing memory and reasoning in `act()`:

```typescript
this.memory = response.memory
this.lastReasoning = response.reasoning
this.onThought?.({ reasoning: response.reasoning, memory: response.memory, action: response.action })

return response.action
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/players/llm-player.ts src/players/llm-player.test.ts
git commit -m "feat: add onThought callback for dev visibility into reasoning and memory"
```

---

### Task 4: Update Existing Tests

**Files:**
- Modify: `src/players/llm-player.test.ts`

Some existing tests mock `generateText` to return `{ toolCalls: [{ input: { position: N } }] }` — the old format without `reasoning` and `memory`. These need updating to return the wrapped format.

- [ ] **Step 1: Update all mockToolCallResponse calls**

Replace the helper:

```typescript
function mockToolCallResponse(action: unknown, reasoning = 'auto-reasoning', memory = '') {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning, memory, action } }],
  })
}
```

Update every test that uses `mockToolCallResponse` or directly mocks `mockGenerateText.mockResolvedValueOnce` to use the wrapped format `{ reasoning, memory, action }`.

Tests to update:
- `calls generateText with system prompt...` — `mockToolCallResponse({ position: 1 })`
- `passes string views through as-is` — `mockToolCallResponse({ choice: 'approve' })`
- `JSON-stringifies object views` — `mockToolCallResponse({ move: 'rock' })`
- `includes persona in system prompt` — `mockToolCallResponse({ position: 4 })`
- `does not include persona section` — `mockToolCallResponse({ position: 4 })`
- `uses the action schema as tool parameters` — `mockToolCallResponse({ team: ['p1', 'p2'] })`

Also update the persona test to not check for `'Player persona:'` label (since prompt is now concatenated without labels):

```typescript
it('includes persona in system prompt when provided', async () => {
  mockToolCallResponse({ position: 4 })
  const player = new LLMPlayer('p1', 'Alice', { persona: 'Play aggressively and take risks.' })

  await player.act(makeRequest())

  const callArgs = mockGenerateText.mock.calls[0][0]
  expect(callArgs.system).toContain('Play aggressively and take risks.')
})

it('does not include persona when no persona given', async () => {
  mockToolCallResponse({ position: 4 })
  const player = new LLMPlayer('p1', 'Alice')

  await player.act(makeRequest())

  const callArgs = mockGenerateText.mock.calls[0][0]
  expect(callArgs.system).not.toContain('Play aggressively')
})
```

Update the `returns only the action` assertion test:

```typescript
it('returns extracted action from wrapped response', async () => {
  mockToolCallResponse({ position: 1 })
  const player = new LLMPlayer('p1', 'Alice')
  const result = await player.act(makeRequest())
  expect(result).toEqual({ position: 1 })
})
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/players/llm-player.test.ts
git commit -m "test: update LLMPlayer tests for wrapped schema format"
```

---

### Task 5: Update Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/requirements.md`

- [ ] **Step 1: Update architecture.md LLM Player section**

Find the existing `## LLM Player` section and replace:

```markdown
## LLM Player (`src/players/llm-player.ts`)

LLM-powered Player implementation with persistent memory and chain-of-thought reasoning. Each turn, the LLM receives the game view + its memory, and returns reasoning + updated memory + action via forced tool use.

- **Memory**: Free-form string persisting across `act()` calls. Soft-capped at 300 words via prompt instruction.
- **Chain of thought**: Private reasoning logged each turn, not shared with other players.
- **Persona**: Optional personality + strategy text concatenated into system prompt.
- **Dev visibility**: `getMemory()`, `getLastReasoning()` accessors + `onThought` callback.
- **Schema wrapping**: The game's `actionSchema` is wrapped in `{ reasoning, memory, action }`. Only `action` is returned to the Engine.
```

- [ ] **Step 2: Update requirements.md — mark AGENT items complete**

Mark as complete:
- `AGENT-02`: Configurable persona/strategy
- `AGENT-03`: Role-specific prompt components (via persona)
- `AGENT-05`: Per-decision reasoning trace

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/requirements.md
git commit -m "docs: update architecture and requirements for agentic LLM player"
```
