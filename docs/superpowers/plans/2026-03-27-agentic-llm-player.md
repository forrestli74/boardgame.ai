# Agentic LLM Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade LLMPlayer from stateless to agentic — persistent memory, chain-of-thought reasoning, dev visibility via accessors and callback.

**Architecture:** Replace LLMPlayer internals. Wrap the game's `actionSchema` in a larger schema (`{ reasoning, memory, action }`). Extract action to return, store memory and reasoning internally. Constructor signature unchanged. All requests use structured tool call (text mode removed).

**Tech Stack:** TypeScript, Zod, Vitest, Vercel AI SDK

**Spec:** `docs/superpowers/specs/2026-03-27-agentic-llm-player-design.md`

**Impact:** Removing text mode changes LLM request format for AIGame. Cassettes in `src/games/ai_game/__fixtures__/` must be re-recorded after this change.

---

### Task 1: Rewrite LLMPlayer — Memory, Reasoning, Wrapped Schema

**Files:**
- Modify: `src/players/llm-player.ts` (full rewrite of internals)
- Modify: `src/players/llm-player.test.ts` (update all tests + add new ones)

This is one atomic change: new system prompt, wrapped schema, memory persistence, accessors, and updated test mocks — all at once to avoid broken intermediate states.

- [ ] **Step 1: Rewrite `src/players/llm-player.ts`**

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
  private lastReasoning_?: string

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.model = options?.model ?? DEFAULT_MODEL
    this.persona = options?.persona
  }

  getMemory(): string { return this.memory }
  getLastReasoning(): string | undefined { return this.lastReasoning_ }

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
    this.lastReasoning_ = response.reasoning

    return response.action
  }
}
```

- [ ] **Step 2: Rewrite `src/players/llm-player.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { ActionRequest } from '../core/types.js'

const mockGenerateText = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return { ...actual, generateText: mockGenerateText }
})

const { LLMPlayer } = await import('./llm-player.js')

// Helper: mock a wrapped response { reasoning, memory, action }
function mockResponse(action: unknown, reasoning = 'auto', memory = '') {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ input: { reasoning, memory, action } }],
  })
}

function makeRequest(overrides?: Partial<ActionRequest>): ActionRequest {
  return {
    playerId: 'p1',
    view: { board: ['X', '', 'O', '', '', '', '', '', ''], turn: 3 },
    actionSchema: z.object({
      position: z.number().int().min(0).max(8).describe('Board position'),
    }),
    ...overrides,
  }
}

describe('LLMPlayer', () => {
  beforeEach(() => { mockGenerateText.mockReset() })

  // --- Interface ---

  it('implements Player interface with id and name', () => {
    const player = new LLMPlayer('p1', 'Alice')
    expect(player.id).toBe('p1')
    expect(player.name).toBe('Alice')
  })

  // --- System Prompt ---

  it('system prompt includes base, memory, and reasoning instructions', async () => {
    mockResponse({ position: 1 })
    const player = new LLMPlayer('p1', 'Alice')
    await player.act(makeRequest())

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).toContain('board game player')
    expect(callArgs.system).toContain('private memory')
    expect(callArgs.system).toContain('300 words')
    expect(callArgs.system).toContain('reasoning is private')
  })

  it('concatenates persona into system prompt when provided', async () => {
    mockResponse({ position: 4 })
    const player = new LLMPlayer('p1', 'Alice', { persona: 'Play aggressively.\n\n## Merlin Strategy\nHide your identity.' })
    await player.act(makeRequest())

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).toContain('Play aggressively')
    expect(callArgs.system).toContain('Merlin Strategy')
    expect(callArgs.system).toContain('private memory')
  })

  it('omits persona from prompt when not provided', async () => {
    mockResponse({ position: 4 })
    const player = new LLMPlayer('p1', 'Alice')
    await player.act(makeRequest())

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).not.toContain('aggressively')
  })

  // --- View Handling ---

  it('passes string views through as-is', async () => {
    mockResponse({ choice: 'approve' })
    const player = new LLMPlayer('p1', 'Alice')
    await player.act(makeRequest({
      view: 'You are on a quest.',
      actionSchema: z.object({ choice: z.enum(['approve', 'reject']) }),
    }))

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('You are on a quest.')
  })

  it('JSON-stringifies object views', async () => {
    mockResponse({ move: 'rock' })
    const player = new LLMPlayer('p1', 'Alice')
    await player.act(makeRequest({
      view: { hand: ['rock', 'paper'], score: 5 },
      actionSchema: z.object({ move: z.enum(['rock', 'paper', 'scissors']) }),
    }))

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('"hand"')
    expect(callArgs.messages[0].content).toContain('"score"')
  })

  // --- Wrapped Schema ---

  it('returns only the action from wrapped response', async () => {
    mockResponse({ position: 7 }, 'my reasoning', 'my memory')
    const player = new LLMPlayer('p1', 'Alice')
    const result = await player.act(makeRequest())
    expect(result).toEqual({ position: 7 })
  })

  it('uses forced tool choice with wrapped schema', async () => {
    mockResponse({ team: ['p1', 'p2'] })
    const player = new LLMPlayer('p1', 'Alice')
    await player.act(makeRequest({
      actionSchema: z.object({ team: z.array(z.string()) }),
    }))

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.toolChoice).toEqual({ type: 'tool', toolName: 'submit_action' })
    expect(callArgs.tools.submit_action).toBeDefined()
  })

  // --- Memory ---

  it('getMemory returns empty string initially', () => {
    const player = new LLMPlayer('p1', 'Alice')
    expect(player.getMemory()).toBe('')
  })

  it('stores memory across act() calls', async () => {
    const player = new LLMPlayer('p1', 'Alice')

    mockResponse({ position: 4 }, 'r1', 'opponent plays corners')
    await player.act(makeRequest())
    expect(player.getMemory()).toBe('opponent plays corners')

    mockResponse({ position: 1 }, 'r2', 'opponent plays corners, now center')
    await player.act(makeRequest())
    expect(player.getMemory()).toBe('opponent plays corners, now center')
  })

  it('includes memory in user message on subsequent turns', async () => {
    const player = new LLMPlayer('p1', 'Alice')

    // First call — no memory
    mockResponse({ position: 1 }, 'r1', 'note 1')
    await player.act(makeRequest())
    expect(mockGenerateText.mock.calls[0][0].messages[0].content).not.toContain('Your memory')

    // Second call — memory included
    mockResponse({ position: 2 }, 'r2', 'note 2')
    await player.act(makeRequest())
    expect(mockGenerateText.mock.calls[1][0].messages[0].content).toContain('Your memory')
    expect(mockGenerateText.mock.calls[1][0].messages[0].content).toContain('note 1')
  })

  // --- Reasoning ---

  it('getLastReasoning returns undefined initially', () => {
    const player = new LLMPlayer('p1', 'Alice')
    expect(player.getLastReasoning()).toBeUndefined()
  })

  it('stores lastReasoning after each act()', async () => {
    mockResponse({ position: 2 }, 'I should block')
    const player = new LLMPlayer('p1', 'Alice')
    await player.act(makeRequest())
    expect(player.getLastReasoning()).toBe('I should block')
  })

  // --- Errors ---

  it('propagates errors from generateText', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('API rate limit exceeded'))
    const player = new LLMPlayer('p1', 'Alice')
    await expect(player.act(makeRequest())).rejects.toThrow('API rate limit exceeded')
  })

  it('throws when LLM returns no tool call', async () => {
    mockGenerateText.mockResolvedValueOnce({ toolCalls: [] })
    const player = new LLMPlayer('p1', 'Alice')
    await expect(player.act(makeRequest())).rejects.toThrow('LLM returned no tool call')
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/players/llm-player.ts src/players/llm-player.test.ts
git commit -m "feat: upgrade LLMPlayer to agentic — memory, reasoning, wrapped schema"
```

---

### Task 2: onThought Callback

**Files:**
- Modify: `src/players/llm-player.ts`
- Modify: `src/players/llm-player.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `src/players/llm-player.test.ts`:

```typescript
// --- onThought Callback ---

it('calls onThought after each act() with reasoning, memory, and action', async () => {
  mockResponse({ position: 5 }, 'my reasoning', 'my memory')
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
  mockResponse({ position: 1 })
  const player = new LLMPlayer('p1', 'Alice')
  await expect(player.act(makeRequest())).resolves.toEqual({ position: 1 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: FAIL — `onThought` not defined

- [ ] **Step 3: Add onThought to LLMPlayer**

Add the property to the class:

```typescript
onThought?: (data: { reasoning: string; memory: string; action: unknown }) => void
```

Add the invocation in `act()`, after storing memory and reasoning, before returning:

```typescript
this.memory = response.memory
this.lastReasoning_ = response.reasoning
this.onThought?.({ reasoning: response.reasoning, memory: response.memory, action: response.action })

return response.action
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/players/llm-player.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: ALL PASS (cassette tests may fail — see Task 3)

- [ ] **Step 6: Commit**

```bash
git add src/players/llm-player.ts src/players/llm-player.test.ts
git commit -m "feat: add onThought callback for dev visibility into reasoning and memory"
```

---

### Task 3: Re-record AI Game Cassettes

Removing text mode changes the LLM request format for AIGame (now uses wrapped tool schema instead of plain text). Cassettes must be re-recorded.

**Files:**
- Modify: `src/games/ai_game/__fixtures__/integration-AI-Game-plays-tic-tac-toe-to-completion.json`
- Modify: `src/games/ai_game/__fixtures__/integration-AI-Game-Avalon-plays-a-5-player-game-to-completion.json`

- [ ] **Step 1: Delete old cassettes**

```bash
rm -f src/games/ai_game/__fixtures__/integration-AI-Game-plays-tic-tac-toe-to-completion.json
rm -f src/games/ai_game/__fixtures__/integration-AI-Game-Avalon-plays-a-5-player-game-to-completion.json
```

- [ ] **Step 2: Re-record tic-tac-toe cassette**

```bash
VCR_MODE=record npx vitest run src/games/ai_game/integration.test.ts
```

- [ ] **Step 3: Verify tic-tac-toe cassette replays**

```bash
npx vitest run src/games/ai_game/integration.test.ts
```

- [ ] **Step 4: Re-record Avalon cassette**

```bash
VCR_MODE=record npx vitest run src/games/ai_game/avalon-integration.test.ts
```

This takes ~5-10 minutes (LLM API calls).

- [ ] **Step 5: Verify Avalon cassette replays**

```bash
npx vitest run src/games/ai_game/avalon-integration.test.ts
```

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/games/ai_game/__fixtures__/
git commit -m "fix: re-record AI game cassettes for wrapped LLM schema"
```

---

### Task 4: Update Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/requirements.md`

- [ ] **Step 1: Update architecture.md LLM Player section**

Replace the existing `## LLM Player` section with:

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

Change from `- [ ]` to `- [x]`:
- `AGENT-02`: Configurable persona/strategy
- `AGENT-03`: Role-specific prompt components
- `AGENT-05`: Per-decision reasoning trace

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/requirements.md
git commit -m "docs: update architecture and requirements for agentic LLM player"
```
