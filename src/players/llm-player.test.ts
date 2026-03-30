import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { ActionRequest } from '../core/types.js'

const mockGenerateText = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return { ...actual, generateText: mockGenerateText }
})

const { LLMPlayer } = await import('./llm-player.js')

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

  it('implements Player interface with id and name', () => {
    const player = new LLMPlayer('p1', 'Alice')
    expect(player.id).toBe('p1')
    expect(player.name).toBe('Alice')
  })

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

    mockResponse({ position: 1 }, 'r1', 'note 1')
    await player.act(makeRequest())
    expect(mockGenerateText.mock.calls[0][0].messages[0].content).not.toContain('Your memory')

    mockResponse({ position: 2 }, 'r2', 'note 2')
    await player.act(makeRequest())
    expect(mockGenerateText.mock.calls[1][0].messages[0].content).toContain('Your memory')
    expect(mockGenerateText.mock.calls[1][0].messages[0].content).toContain('note 1')
  })

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

  it('emits thought event via onEvent listener', async () => {
    const listener = vi.fn()
    mockResponse({ position: 5 }, 'my reasoning', 'my memory')
    const player = new LLMPlayer('p1', 'Alice')
    player.onEvent(listener)

    await player.act(makeRequest())

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      reasoning: 'my reasoning',
      memory: 'my memory',
      action: { position: 5 },
      lastSeenSeq: undefined,
    })
  })

  it('includes lastSeenSeq in emitted event when present on request', async () => {
    const listener = vi.fn()
    mockResponse({ position: 1 }, 'r', 'm')
    const player = new LLMPlayer('p1', 'Alice')
    player.onEvent(listener)

    await player.act(makeRequest({ lastSeenSeq: 42 }))

    expect(listener.mock.calls[0][0].lastSeenSeq).toBe(42)
  })

  it('works without any listeners', async () => {
    mockResponse({ position: 3 }, 'reasoning', 'memory')
    const player = new LLMPlayer('p1', 'Alice')

    await expect(player.act(makeRequest())).resolves.toEqual({ position: 3 })
  })
})
