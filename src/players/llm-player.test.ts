import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { LLMPlayer } from './llm-player.js'
import type { LLMClient } from '../ai-game-master/llm-client.js'
import type { ActionRequest } from '../core/types.js'

// ---------------------------------------------------------------------------
// Mock LLMClient — intercept constructor to inject a mock
// ---------------------------------------------------------------------------

const mockCall = vi.fn()

vi.mock('../ai-game-master/llm-client.js', () => {
  return {
    LLMClient: class MockLLMClient {
      call = mockCall
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    mockCall.mockReset()
  })

  it('implements the Player interface with id and name', () => {
    const player = new LLMPlayer('p1', 'Alice')
    expect(player.id).toBe('p1')
    expect(player.name).toBe('Alice')
  })

  it('calls LLMClient with system prompt, view message, and tool definition', async () => {
    mockCall.mockResolvedValueOnce({ position: 1 })
    const player = new LLMPlayer('p1', 'Alice')
    const request = makeRequest()

    const result = await player.act(request)

    expect(result).toEqual({ position: 1 })
    expect(mockCall).toHaveBeenCalledOnce()

    const [systemPrompt, messages, tool] = mockCall.mock.calls[0]

    // System prompt includes reasoning instructions
    expect(systemPrompt).toContain('Think step-by-step')
    expect(systemPrompt).toContain('board game player')

    // User message contains the game view
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('board')
    expect(messages[0].content).toContain('Current game state')

    // Tool definition has the action schema as JSON Schema
    expect(tool.name).toBe('submit_action')
    expect(tool.input_schema).toHaveProperty('type', 'object')
    expect(tool.input_schema.properties).toHaveProperty('position')
  })

  it('passes string views through as-is', async () => {
    mockCall.mockResolvedValueOnce({ choice: 'approve' })
    const player = new LLMPlayer('p1', 'Alice')
    const request = makeRequest({
      view: 'You are on a quest. The team is: Alice, Bob.',
      actionSchema: z.object({ choice: z.enum(['approve', 'reject']) }),
    })

    await player.act(request)

    const [, messages] = mockCall.mock.calls[0]
    expect(messages[0].content).toContain('You are on a quest. The team is: Alice, Bob.')
  })

  it('JSON-stringifies object views', async () => {
    mockCall.mockResolvedValueOnce({ move: 'rock' })
    const player = new LLMPlayer('p1', 'Alice')
    const view = { hand: ['rock', 'paper'], score: 5 }
    const request = makeRequest({
      view,
      actionSchema: z.object({ move: z.enum(['rock', 'paper', 'scissors']) }),
    })

    await player.act(request)

    const [, messages] = mockCall.mock.calls[0]
    // Object views should be JSON-stringified
    expect(messages[0].content).toContain('"hand"')
    expect(messages[0].content).toContain('"score"')
  })

  it('includes persona in system prompt when provided', async () => {
    mockCall.mockResolvedValueOnce({ position: 4 })
    const player = new LLMPlayer('p1', 'Alice', { persona: 'Play aggressively and take risks.' })

    await player.act(makeRequest())

    const [systemPrompt] = mockCall.mock.calls[0]
    expect(systemPrompt).toContain('Play aggressively and take risks.')
    expect(systemPrompt).toContain('Player persona:')
  })

  it('does not include persona section when no persona given', async () => {
    mockCall.mockResolvedValueOnce({ position: 4 })
    const player = new LLMPlayer('p1', 'Alice')

    await player.act(makeRequest())

    const [systemPrompt] = mockCall.mock.calls[0]
    expect(systemPrompt).not.toContain('Player persona:')
  })

  it('propagates errors from LLMClient', async () => {
    mockCall.mockRejectedValueOnce(new Error('API rate limit exceeded'))
    const player = new LLMPlayer('p1', 'Alice')

    await expect(player.act(makeRequest())).rejects.toThrow('API rate limit exceeded')
  })

  it('converts action schema to JSON Schema for the tool definition', async () => {
    mockCall.mockResolvedValueOnce({ team: ['p1', 'p2'] })
    const player = new LLMPlayer('p1', 'Alice')

    const request = makeRequest({
      actionSchema: z.object({
        team: z.array(z.string()).min(2).max(3).describe('Players to include on the team'),
      }),
    })

    await player.act(request)

    const [, , tool] = mockCall.mock.calls[0]
    expect(tool.input_schema.properties.team).toBeDefined()
    expect(tool.input_schema.properties.team.type).toBe('array')
  })
})
