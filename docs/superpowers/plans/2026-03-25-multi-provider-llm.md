# Multi-Provider LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic-specific `LLMClient` with direct Vercel AI SDK usage, enabling any provider via `'provider:model'` strings.

**Architecture:** Delete the `LLMClient` wrapper. Add a shared provider registry (`src/core/llm-registry.ts`). Each consumer (`AIGameMaster`, `LLMPlayer`) calls `generateText()` directly with forced tool use. Model is configured per-instance via `'provider:model'` strings (default: `'anthropic:claude-sonnet-4-20250514'`).

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`), Zod v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-multi-provider-llm-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/core/llm-registry.ts` | Provider registry setup, default model constant |
| Delete | `src/ai-game-master/llm-client.ts` | Removed — no more shared wrapper |
| Modify | `src/ai-game-master/prompts.ts` | Remove `buildToolDefinition()` and `ToolDefinition` import |
| Modify | `src/ai-game-master/game-master.ts` | Use `generateText()` + registry instead of `LLMClient` |
| Modify | `src/ai-game-master/game-master.test.ts` | Mock `generateText()` instead of `LLMClient` |
| Modify | `src/ai-game-master/integration.test.ts` | Use registry instead of `LLMClient` |
| Modify | `src/ai-game-master/avalon-integration.test.ts` | Use registry instead of `LLMClient` |
| Modify | `src/players/llm-player.ts` | Use `generateText()` + registry instead of `LLMClient` |
| Modify | `src/players/llm-player.test.ts` | Mock `generateText()` instead of `LLMClient` |
| Modify | `package.json` | Swap dependencies |

---

### Task 1: Swap Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove `@anthropic-ai/sdk` and add AI SDK packages**

Run:
```bash
pnpm remove @anthropic-ai/sdk && pnpm add ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

- [ ] **Step 2: Verify install succeeded**

Run: `pnpm run typecheck`
Expected: Passes (existing code still compiles since we haven't deleted anything yet — `@anthropic-ai/sdk` is gone but the import will fail, so expect type errors from `llm-client.ts`). That's OK — we'll fix it in the next tasks.

Actually, since `llm-client.ts` imports `@anthropic-ai/sdk`, typecheck will fail here. That's expected. Just verify the packages installed:
```bash
ls node_modules/ai node_modules/@ai-sdk/anthropic node_modules/@ai-sdk/openai node_modules/@ai-sdk/google
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: swap @anthropic-ai/sdk for vercel ai sdk packages"
```

---

### Task 2: Create Provider Registry

**Files:**
- Create: `src/core/llm-registry.ts`
- Test: `src/core/llm-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/llm-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { registry, DEFAULT_MODEL } from './llm-registry.js'

describe('llm-registry', () => {
  it('exports a DEFAULT_MODEL string', () => {
    expect(DEFAULT_MODEL).toBe('anthropic:claude-sonnet-4-20250514')
  })

  it('resolves an anthropic model from the registry', () => {
    const model = registry.languageModel('anthropic:claude-sonnet-4-20250514')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('claude-sonnet-4-20250514')
  })

  it('resolves an openai model from the registry', () => {
    const model = registry.languageModel('openai:gpt-4o')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('gpt-4o')
  })

  it('resolves a google model from the registry', () => {
    const model = registry.languageModel('google:gemini-2.0-flash')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('gemini-2.0-flash')
  })

  it('throws on unknown provider prefix', () => {
    expect(() => registry.languageModel('unknown:model')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/llm-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/core/llm-registry.ts`:

```ts
import { createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'

export const registry = createProviderRegistry({
  anthropic,
  openai,
  google,
})

export const DEFAULT_MODEL = 'anthropic:claude-sonnet-4-20250514'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/llm-registry.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/llm-registry.ts src/core/llm-registry.test.ts
git commit -m "feat: add provider registry with anthropic, openai, google"
```

---

### Task 3: Update `prompts.ts` — Remove `buildToolDefinition()`

**Files:**
- Modify: `src/ai-game-master/prompts.ts:1-2,88-140`

- [ ] **Step 1: Remove the `ToolDefinition` import and `buildToolDefinition()` function**

In `src/ai-game-master/prompts.ts`:
- Remove line 2: `import type { ToolDefinition } from './llm-client.js'`
- Remove lines 88-140: the entire `buildToolDefinition()` function

The file should retain only `buildSystemPrompt()`, `buildInitMessage()`, and `buildActionMessage()`. The only import remaining is `import type { GameConfig } from '../core/types.js'`.

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: Errors in `game-master.ts` (still imports `buildToolDefinition` and `LLMClient`) — that's expected; we fix it next.

- [ ] **Step 3: Commit**

```bash
git add src/ai-game-master/prompts.ts
git commit -m "refactor: remove buildToolDefinition from prompts.ts"
```

---

### Task 4: Rewrite `AIGameMaster` to Use AI SDK

**Files:**
- Modify: `src/ai-game-master/game-master.ts`

- [ ] **Step 1: Rewrite `game-master.ts`**

Replace the full file content with:

```ts
import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Game } from '../core/game.js'
import type { GameResponse, GameConfig, GameOutcome, ActionRequest } from '../core/types.js'
import type { GameEvent } from '../core/events.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'
import { jsonSchemaToZod, LLMGameResponseSchema } from './schemas.js'
import type { JsonSchema, LLMGameResponse } from './schemas.js'
import { buildSystemPrompt, buildInitMessage, buildActionMessage } from './prompts.js'

export class AIGameMaster implements Game {
  readonly optionsSchema = z.object({})

  private state: Record<string, unknown> = {}
  private terminal = false
  private outcome: GameOutcome | null = null
  private gameId = ''

  constructor(
    private readonly rulesDoc: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async init(config: GameConfig): Promise<GameResponse> {
    this.gameId = config.gameId

    const systemPrompt = buildSystemPrompt()
    const userMessage = buildInitMessage(this.rulesDoc, config)

    const raw = await this.callLLM(systemPrompt, userMessage)
    const parsed = LLMGameResponseSchema.parse(raw)

    return this.processLLMResponse(parsed)
  }

  async handleResponse(playerId: string, action: unknown): Promise<GameResponse> {
    const systemPrompt = buildSystemPrompt()
    const userMessage = buildActionMessage(this.rulesDoc, this.state, playerId, action)

    const raw = await this.callLLM(systemPrompt, userMessage)
    const parsed = LLMGameResponseSchema.parse(raw)

    return this.processLLMResponse(parsed)
  }

  isTerminal(): boolean {
    return this.terminal
  }

  getOutcome(): GameOutcome | null {
    return this.outcome
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<unknown> {
    const result = await generateText({
      model: registry.languageModel(this.model),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      tools: {
        game_master_response: tool({
          description: 'Return the updated game state and next actions',
          parameters: LLMGameResponseSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'game_master_response' },
    })

    return result.toolCalls[0].args
  }

  private processLLMResponse(llmResponse: LLMGameResponse): GameResponse {
    this.state = llmResponse.state
    this.terminal = llmResponse.isTerminal
    this.outcome = llmResponse.outcome
      ? { scores: llmResponse.outcome.scores, metadata: llmResponse.outcome.metadata }
      : null

    const requests: ActionRequest[] = llmResponse.requests.map((req) => ({
      playerId: req.playerId,
      view: req.view,
      actionSchema: jsonSchemaToZod(req.actionSchema as unknown as JsonSchema),
    }))

    const timestamp = new Date().toISOString()
    const events: GameEvent[] = llmResponse.events.map((evt) => ({
      source: 'game' as const,
      gameId: this.gameId,
      data: { description: evt.description, ...((evt.data && typeof evt.data === 'object') ? evt.data as Record<string, unknown> : { value: evt.data }) },
      timestamp,
    }))

    return { requests, events }
  }
}
```

Key changes:
- Constructor takes `model: string` instead of `llmClient: LLMClient`
- New private `callLLM()` method calls `generateText()` with forced tool use
- Uses `LLMGameResponseSchema` directly as the tool's `parameters` (Zod schema — AI SDK supports this natively)
- No more `buildToolDefinition()` import

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: Errors in test files (still reference `LLMClient`) — that's expected. `game-master.ts` itself should compile clean.

- [ ] **Step 3: Commit**

```bash
git add src/ai-game-master/game-master.ts
git commit -m "refactor: rewrite AIGameMaster to use AI SDK generateText"
```

---

### Task 5: Update `AIGameMaster` Tests

**Files:**
- Modify: `src/ai-game-master/game-master.test.ts`

- [ ] **Step 1: Rewrite the test file**

Replace `src/ai-game-master/game-master.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { GameConfig } from '../core/types.js'
import type { LLMGameResponse } from './schemas.js'

// ---------------------------------------------------------------------------
// Mock generateText from 'ai' module
// ---------------------------------------------------------------------------

const mockGenerateText = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: mockGenerateText,
  }
})

// Import after mock setup
const { AIGameMaster } = await import('./game-master.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLMResponse(response: LLMGameResponse) {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ args: response }],
  })
}

const config: GameConfig = {
  gameId: 'test-game-1',
  seed: 42,
  players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
}

const rulesDoc = '# Tic-Tac-Toe\nTwo players take turns placing X and O on a 3x3 grid.'

function makeInitResponse(): LLMGameResponse {
  return {
    state: { board: [['', '', ''], ['', '', ''], ['', '', '']], currentPlayer: 'p1' },
    requests: [
      {
        playerId: 'p1',
        view: { board: [['', '', ''], ['', '', ''], ['', '', '']] },
        actionSchema: {
          type: 'object',
          properties: {
            row: { type: 'integer', minimum: 0, maximum: 2 },
            col: { type: 'integer', minimum: 0, maximum: 2 },
          },
          required: ['row', 'col'],
        },
      },
    ],
    events: [
      { description: 'Game started', data: { type: 'game_start' } },
    ],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeMoveResponse(): LLMGameResponse {
  return {
    state: { board: [['X', '', ''], ['', '', ''], ['', '', '']], currentPlayer: 'p2' },
    requests: [
      {
        playerId: 'p2',
        view: { board: [['X', '', ''], ['', '', ''], ['', '', '']] },
        actionSchema: {
          type: 'object',
          properties: {
            row: { type: 'integer', minimum: 0, maximum: 2 },
            col: { type: 'integer', minimum: 0, maximum: 2 },
          },
          required: ['row', 'col'],
        },
      },
    ],
    events: [
      { description: 'Player p1 placed X at (0,0)', data: { type: 'move', row: 0, col: 0, mark: 'X' } },
    ],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeTerminalResponse(): LLMGameResponse {
  return {
    state: { board: [['X', 'X', 'X'], ['O', 'O', ''], ['', '', '']], currentPlayer: null },
    requests: [],
    events: [
      { description: 'Player p1 wins', data: { type: 'game_end', winner: 'p1' } },
    ],
    isTerminal: true,
    outcome: { scores: { p1: 1, p2: 0 } },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIGameMaster', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
  })

  describe('init()', () => {
    it('calls generateText and returns a GameResponse with action requests', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc)

      const response = await gm.init(config)

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p1')
      expect(response.requests[0].view).toEqual({ board: [['', '', ''], ['', '', ''], ['', '', '']] })
    })

    it('converts JSON Schema actionSchema to Zod', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc)

      const response = await gm.init(config)
      const schema = response.requests[0].actionSchema

      const validResult = schema.safeParse({ row: 1, col: 2 })
      expect(validResult.success).toBe(true)

      const invalidResult = schema.safeParse({ row: 5, col: 0 })
      expect(invalidResult.success).toBe(false)
    })

    it('formats events as GameEvent with source "game"', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc)

      const response = await gm.init(config)

      expect(response.events).toHaveLength(1)
      expect(response.events[0].source).toBe('game')
      expect(response.events[0].gameId).toBe('test-game-1')
      expect(response.events[0]).toHaveProperty('timestamp')
      expect(response.events[0].data).toMatchObject({ description: 'Game started', type: 'game_start' })
    })

    it('sets isTerminal to false after init', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)

      expect(gm.isTerminal()).toBe(false)
      expect(gm.getOutcome()).toBeNull()
    })

    it('calls generateText with correct arguments', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)

      expect(mockGenerateText).toHaveBeenCalledTimes(1)
      const callArgs = mockGenerateText.mock.calls[0][0]
      expect(callArgs.system).toBeDefined()
      expect(callArgs.messages).toHaveLength(1)
      expect(callArgs.messages[0].role).toBe('user')
      expect(callArgs.toolChoice).toEqual({ type: 'tool', toolName: 'game_master_response' })
      expect(callArgs.tools.game_master_response).toBeDefined()
    })
  })

  describe('handleResponse()', () => {
    it('calls generateText with current state and returns updated GameResponse', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)
      const response = await gm.handleResponse('p1', { row: 0, col: 0 })

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p2')
    })

    it('updates internal state across calls', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)
      await gm.handleResponse('p1', { row: 0, col: 0 })

      const secondCallArgs = mockGenerateText.mock.calls[1][0]
      expect(secondCallArgs.messages[0].content).toContain('currentPlayer')
    })

    it('detects terminal state', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeTerminalResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)
      await gm.handleResponse('p1', { row: 0, col: 2 })

      expect(gm.isTerminal()).toBe(true)
    })
  })

  describe('getOutcome()', () => {
    it('returns null before terminal', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)

      expect(gm.getOutcome()).toBeNull()
    })

    it('returns outcome after terminal', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeTerminalResponse())
      const gm = new AIGameMaster(rulesDoc)

      await gm.init(config)
      await gm.handleResponse('p1', { row: 0, col: 2 })

      const outcome = gm.getOutcome()
      expect(outcome).not.toBeNull()
      expect(outcome!.scores).toEqual({ p1: 1, p2: 0 })
    })
  })

  describe('optionsSchema', () => {
    it('is an empty object schema', () => {
      const gm = new AIGameMaster(rulesDoc)

      const result = gm.optionsSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('event formatting', () => {
    it('handles primitive event data by wrapping in value key', async () => {
      const response: LLMGameResponse = {
        ...makeInitResponse(),
        events: [{ description: 'Score update', data: 42 }],
      }
      mockLLMResponse(response)
      const gm = new AIGameMaster(rulesDoc)

      const result = await gm.init(config)

      expect(result.events[0].data).toEqual({ description: 'Score update', value: 42 })
    })

    it('handles null event data', async () => {
      const response: LLMGameResponse = {
        ...makeInitResponse(),
        events: [{ description: 'Null event', data: null }],
      }
      mockLLMResponse(response)
      const gm = new AIGameMaster(rulesDoc)

      const result = await gm.init(config)

      expect(result.events[0].data).toEqual({ description: 'Null event', value: null })
    })
  })

  describe('custom model', () => {
    it('passes the model string to generateText', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGameMaster(rulesDoc, 'openai:gpt-4o')

      await gm.init(config)

      const callArgs = mockGenerateText.mock.calls[0][0]
      expect(callArgs.model).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run src/ai-game-master/game-master.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/ai-game-master/game-master.test.ts
git commit -m "test: update AIGameMaster tests to mock generateText"
```

---

### Task 6: Rewrite `LLMPlayer` to Use AI SDK

**Files:**
- Modify: `src/players/llm-player.ts`

- [ ] **Step 1: Rewrite `llm-player.ts`**

Replace the full file content with:

```ts
import { generateText, tool } from 'ai'
import type { Player } from '../core/player.js'
import type { ActionRequest } from '../core/types.js'
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js'

export interface LLMPlayerOptions {
  model?: string
  persona?: string
}

const SYSTEM_PROMPT = `You are a board game player. You will receive a description of the current game state visible to you, and you must choose an action.

Think step-by-step:
1. Analyze the current game state
2. Consider what actions are available to you
3. Reason about which action gives you the best outcome
4. Choose your action by calling the provided tool

Always use the tool to submit your chosen action. Never refuse to act.`

function buildSystemPrompt(persona?: string): string {
  if (!persona) return SYSTEM_PROMPT
  return `${SYSTEM_PROMPT}\n\nPlayer persona: ${persona}`
}

function formatView(view: unknown): string {
  if (typeof view === 'string') return view
  return JSON.stringify(view, null, 2)
}

export class LLMPlayer implements Player {
  readonly id: string
  readonly name: string
  private readonly model: string
  private readonly persona?: string

  constructor(id: string, name: string, options?: LLMPlayerOptions) {
    this.id = id
    this.name = name
    this.model = options?.model ?? DEFAULT_MODEL
    this.persona = options?.persona
  }

  async act(request: ActionRequest): Promise<unknown> {
    const systemPrompt = buildSystemPrompt(this.persona)

    const viewText = formatView(request.view)
    const userMessage = `Current game state (your view):\n\n${viewText}\n\nChoose your action.`

    const result = await generateText({
      model: registry.languageModel(this.model),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      tools: {
        submit_action: tool({
          description: 'Submit your chosen action for this turn',
          parameters: request.actionSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'submit_action' },
    })

    return result.toolCalls[0].args
  }
}
```

Key changes:
- No more `LLMClient` import
- Uses `generateText()` with forced tool use
- Passes `request.actionSchema` (Zod) directly as tool `parameters` — no manual `z.toJSONSchema()` needed
- `model` field replaces `apiKey`

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: Errors only in test files and integration tests (still reference `LLMClient`)

- [ ] **Step 3: Commit**

```bash
git add src/players/llm-player.ts
git commit -m "refactor: rewrite LLMPlayer to use AI SDK generateText"
```

---

### Task 7: Update `LLMPlayer` Tests

**Files:**
- Modify: `src/players/llm-player.test.ts`

- [ ] **Step 1: Rewrite the test file**

Replace `src/players/llm-player.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { ActionRequest } from '../core/types.js'

// ---------------------------------------------------------------------------
// Mock generateText from 'ai' module
// ---------------------------------------------------------------------------

const mockGenerateText = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    generateText: mockGenerateText,
  }
})

// Import after mock setup
const { LLMPlayer } = await import('./llm-player.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockToolCallResponse(args: unknown) {
  mockGenerateText.mockResolvedValueOnce({
    toolCalls: [{ args }],
  })
}

function makeRequest(overrides?: Partial<ActionRequest>): ActionRequest {
  return {
    playerId: 'p1',
    view: { board: ['X', '', 'O', '', '', '', '', '', ''], turn: 3 },
    actionSchema: z.object({
      position: z.number().int().min(0).max(8).describe('Board position to place your mark'),
    }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LLMPlayer', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
  })

  it('implements the Player interface with id and name', () => {
    const player = new LLMPlayer('p1', 'Alice')
    expect(player.id).toBe('p1')
    expect(player.name).toBe('Alice')
  })

  it('calls generateText with system prompt, view message, and tool definition', async () => {
    mockToolCallResponse({ position: 1 })
    const player = new LLMPlayer('p1', 'Alice')
    const request = makeRequest()

    const result = await player.act(request)

    expect(result).toEqual({ position: 1 })
    expect(mockGenerateText).toHaveBeenCalledOnce()

    const callArgs = mockGenerateText.mock.calls[0][0]

    // System prompt includes reasoning instructions
    expect(callArgs.system).toContain('Think step-by-step')
    expect(callArgs.system).toContain('board game player')

    // User message contains the game view
    expect(callArgs.messages).toHaveLength(1)
    expect(callArgs.messages[0].role).toBe('user')
    expect(callArgs.messages[0].content).toContain('board')
    expect(callArgs.messages[0].content).toContain('Current game state')

    // Tool definition uses forced tool choice
    expect(callArgs.toolChoice).toEqual({ type: 'tool', toolName: 'submit_action' })
    expect(callArgs.tools.submit_action).toBeDefined()
  })

  it('passes string views through as-is', async () => {
    mockToolCallResponse({ choice: 'approve' })
    const player = new LLMPlayer('p1', 'Alice')
    const request = makeRequest({
      view: 'You are on a quest. The team is: Alice, Bob.',
      actionSchema: z.object({ choice: z.enum(['approve', 'reject']) }),
    })

    await player.act(request)

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('You are on a quest. The team is: Alice, Bob.')
  })

  it('JSON-stringifies object views', async () => {
    mockToolCallResponse({ move: 'rock' })
    const player = new LLMPlayer('p1', 'Alice')
    const view = { hand: ['rock', 'paper'], score: 5 }
    const request = makeRequest({
      view,
      actionSchema: z.object({ move: z.enum(['rock', 'paper', 'scissors']) }),
    })

    await player.act(request)

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('"hand"')
    expect(callArgs.messages[0].content).toContain('"score"')
  })

  it('includes persona in system prompt when provided', async () => {
    mockToolCallResponse({ position: 4 })
    const player = new LLMPlayer('p1', 'Alice', { persona: 'Play aggressively and take risks.' })

    await player.act(makeRequest())

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).toContain('Play aggressively and take risks.')
    expect(callArgs.system).toContain('Player persona:')
  })

  it('does not include persona section when no persona given', async () => {
    mockToolCallResponse({ position: 4 })
    const player = new LLMPlayer('p1', 'Alice')

    await player.act(makeRequest())

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).not.toContain('Player persona:')
  })

  it('propagates errors from generateText', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('API rate limit exceeded'))
    const player = new LLMPlayer('p1', 'Alice')

    await expect(player.act(makeRequest())).rejects.toThrow('API rate limit exceeded')
  })

  it('uses the action schema as tool parameters', async () => {
    mockToolCallResponse({ team: ['p1', 'p2'] })
    const player = new LLMPlayer('p1', 'Alice')

    const request = makeRequest({
      actionSchema: z.object({
        team: z.array(z.string()).min(2).max(3).describe('Players to include on the team'),
      }),
    })

    await player.act(request)

    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.tools.submit_action).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run src/players/llm-player.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/players/llm-player.test.ts
git commit -m "test: update LLMPlayer tests to mock generateText"
```

---

### Task 8: Update Integration Tests and Delete `llm-client.ts`

**Files:**
- Modify: `src/ai-game-master/integration.test.ts:10`
- Modify: `src/ai-game-master/avalon-integration.test.ts:10`
- Delete: `src/ai-game-master/llm-client.ts`

- [ ] **Step 1: Update `integration.test.ts`**

In `src/ai-game-master/integration.test.ts`:
- Remove line 10: `import { LLMClient } from './llm-client.js'`
- Replace line 43-44:
  ```ts
  // Old:
  const llmClient = new LLMClient()
  const game = new AIGameMaster(rulesDoc, llmClient)
  // New:
  const game = new AIGameMaster(rulesDoc)
  ```

- [ ] **Step 2: Update `avalon-integration.test.ts`**

In `src/ai-game-master/avalon-integration.test.ts`:
- Remove line 10: `import { LLMClient } from './llm-client.js'`
- Replace lines 120-121:
  ```ts
  // Old:
  const llmClient = new LLMClient()
  const game = new AIGameMaster(rulesDoc, llmClient)
  // New:
  const game = new AIGameMaster(rulesDoc)
  ```

- [ ] **Step 3: Delete `llm-client.ts`**

Delete `src/ai-game-master/llm-client.ts`.

- [ ] **Step 4: Run typecheck and all tests**

Run: `pnpm run typecheck && pnpm test`
Expected: Typecheck passes. All unit tests pass. Integration tests skip (no API key in CI) or pass (if `ANTHROPIC_API_KEY` is set).

- [ ] **Step 5: Commit**

```bash
git add -A src/ai-game-master/llm-client.ts src/ai-game-master/integration.test.ts src/ai-game-master/avalon-integration.test.ts
git commit -m "refactor: delete LLMClient, update integration tests"
```

---

### Task 9: Update Architecture Docs

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update architecture doc**

In `docs/architecture.md`:

1. Replace the **LLM Player** section (lines 69-71) with:
   ```markdown
   ## LLM Player (`src/players/llm-player.ts`)

   LLM-powered Player implementation. Receives an `ActionRequest` and uses the Vercel AI SDK's `generateText()` with forced tool use to get a structured action from the LLM. Supports optional `persona` string and configurable model via `'provider:model'` string (default: `'anthropic:claude-sonnet-4-20250514'`). Stateless per request.
   ```

2. Update the **AI Game Master** section (lines 60-67) — replace mention of `llm-client.ts`:
   ```markdown
   ## AI Game Master (`src/ai-game-master/`)

   LLM-powered Game implementation. Instead of hard-coding game rules in TypeScript, it feeds a markdown rules document to an LLM and asks it to manage game state.

   - **`game-master.ts`** — `AIGameMaster` implements `Game`. Constructor takes `rulesDoc` + optional `model` string (default: `'anthropic:claude-sonnet-4-20250514'`). Uses Vercel AI SDK `generateText()` with forced tool use for structured output.
   - **`prompts.ts`** — System prompt and message builders for game master LLM calls.
   - **`schemas.ts`** — `LLMGameResponseSchema` (Zod) + `jsonSchemaToZod` converter (LLM produces JSON Schema for action validation; this converts it back to Zod at runtime).
   ```

3. Add a new section after the AI Game Master section:
   ```markdown
   ## Provider Registry (`src/core/llm-registry.ts`)

   Shared provider registry built with Vercel AI SDK's `createProviderRegistry()`. Registers Anthropic, OpenAI, and Google providers. Resolves `'provider:model'` strings (e.g., `'anthropic:claude-sonnet-4-20250514'`, `'openai:gpt-4o'`) to model instances. API keys are read from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`).
   ```

4. Update the **Project Structure** tree — remove `llm-client.ts`, add `llm-registry.ts`:
   ```
   src/
   ├── core/
   │   ├── types.ts
   │   ├── engine.ts
   │   ├── game.ts
   │   ├── player.ts
   │   ├── events.ts
   │   ├── recorder.ts
   │   ├── llm-registry.ts          # Provider registry (AI SDK)
   │   └── *.test.ts
   │
   ├── ai-game-master/
   │   ├── game-master.ts
   │   ├── prompts.ts
   │   ├── schemas.ts
   │   └── *.test.ts
   │
   ├── players/
   │   └── llm-player.ts
   ```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture for AI SDK multi-provider support"
```
