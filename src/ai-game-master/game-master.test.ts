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
    toolCalls: [{ input: response }],
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
