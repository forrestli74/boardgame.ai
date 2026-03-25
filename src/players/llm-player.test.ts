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
