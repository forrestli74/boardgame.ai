import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { GameConfig, GameResponse } from '../../core/types.js'
import type { GameFlow } from '../../core/game.js'
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
const { AIGame } = await import('./ai-game.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function nextResponse(gen: GameFlow, action?: { playerId: string; action: unknown }): Promise<GameResponse> {
  const result = action ? await gen.next(action) : await gen.next()
  if (result.done) throw new Error('Generator completed unexpectedly')
  return result.value
}

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

const config3Players: GameConfig = {
  gameId: 'test-game-2',
  seed: 42,
  players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
  ],
}

const emptyBoard = [['', '', ''], ['', '', ''], ['', '', '']]
const actionSchemaStr = JSON.stringify({
  type: 'object',
  properties: {
    row: { type: 'integer', minimum: 0, maximum: 2 },
    col: { type: 'integer', minimum: 0, maximum: 2 },
  },
  required: ['row', 'col'],
})

function makeInitResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ board: emptyBoard, currentPlayer: 'p1' }),
    requests: [
      {
        playerId: 'p1',
        view: JSON.stringify({ board: emptyBoard }),
        actionSchema: actionSchemaStr,
      },
    ],
    events: [
      { description: 'Game started', data: JSON.stringify({ type: 'game_start' }) },
    ],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeMultiPlayerInitResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ phase: 'voting', votes: {} }),
    requests: [
      { playerId: 'p1', view: JSON.stringify({ phase: 'voting' }), actionSchema: voteSchemaStr },
      { playerId: 'p2', view: JSON.stringify({ phase: 'voting' }), actionSchema: voteSchemaStr },
      { playerId: 'p3', view: JSON.stringify({ phase: 'voting' }), actionSchema: voteSchemaStr },
    ],
    events: [{ description: 'Voting phase started', data: JSON.stringify({ type: 'phase_start' }) }],
    isTerminal: false,
    outcome: undefined,
  }
}

const voteSchemaStr = JSON.stringify({
  type: 'object',
  properties: { vote: { type: 'string', enum: ['approve', 'reject'] } },
  required: ['vote'],
})

function makeVoteResultResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ phase: 'mission', votes: { p1: 'approve', p2: 'reject', p3: 'approve' } }),
    requests: [
      { playerId: 'p1', view: JSON.stringify({ phase: 'mission' }), actionSchema: actionSchemaStr },
    ],
    events: [{ description: 'Vote passed 2-1', data: JSON.stringify({ type: 'vote_result', passed: true }) }],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeMoveResponse(): LLMGameResponse {
  const board = [['X', '', ''], ['', '', ''], ['', '', '']]
  return {
    state: JSON.stringify({ board, currentPlayer: 'p2' }),
    requests: [
      {
        playerId: 'p2',
        view: JSON.stringify({ board }),
        actionSchema: actionSchemaStr,
      },
    ],
    events: [
      { description: 'Player p1 placed X at (0,0)', data: JSON.stringify({ type: 'move', row: 0, col: 0, mark: 'X' }) },
    ],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeTerminalResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ board: [['X', 'X', 'X'], ['O', 'O', ''], ['', '', '']], currentPlayer: null }),
    requests: [],
    events: [
      { description: 'Player p1 wins', data: JSON.stringify({ type: 'game_end', winner: 'p1' }) },
    ],
    isTerminal: true,
    outcome: { scores: [{ playerId: 'p1', score: 1 }, { playerId: 'p2', score: 0 }] },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIGame', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
  })

  describe('play() first yield', () => {
    it('calls generateText and yields a GameResponse with action requests', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      const response = await nextResponse(gen)

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p1')
      expect(response.requests[0].view).toEqual({ board: emptyBoard })
    })

    it('converts JSON Schema actionSchema to Zod', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      const response = await nextResponse(gen)
      const schema = response.requests[0].actionSchema

      const validResult = schema.safeParse({ row: 1, col: 2 })
      expect(validResult.success).toBe(true)

      const invalidResult = schema.safeParse({ row: 5, col: 0 })
      expect(invalidResult.success).toBe(false)
    })

    it('formats events as GameEvent with source "game"', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      const response = await nextResponse(gen)

      expect(response.events).toHaveLength(1)
      expect(response.events[0].source).toBe('game')
      expect(response.events[0].gameId).toBe('test-game-1')
      expect(response.events[0]).toHaveProperty('timestamp')
      expect(response.events[0].data).toMatchObject({ description: 'Game started', type: 'game_start' })
    })

    it('calls generateText with correct arguments', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      await gen.next()

      expect(mockGenerateText).toHaveBeenCalledTimes(1)
      const callArgs = mockGenerateText.mock.calls[0][0]
      expect(callArgs.system).toBeDefined()
      expect(callArgs.messages).toHaveLength(1)
      expect(callArgs.messages[0].role).toBe('user')
      expect(callArgs.toolChoice).toEqual({ type: 'tool', toolName: 'game_master_response' })
      expect(callArgs.tools.game_master_response).toBeDefined()
    })
  })

  describe('subsequent yields', () => {
    it('calls generateText with current state and yields updated GameResponse', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      await nextResponse(gen) // init yield
      const response = await nextResponse(gen, { playerId: 'p1', action: { row: 0, col: 0 } })

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p2')
    })

    it('updates internal state across calls', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      await nextResponse(gen)
      await nextResponse(gen, { playerId: 'p1', action: { row: 0, col: 0 } })

      const secondCallArgs = mockGenerateText.mock.calls[1][0]
      expect(secondCallArgs.messages[0].content).toContain('currentPlayer')
    })

    it('returns GameOutcome when terminal', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeTerminalResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      await nextResponse(gen) // init yield
      // Send action — LLM returns terminal, generator returns GameOutcome directly
      const result = await gen.next({ playerId: 'p1', action: { row: 0, col: 2 } })
      expect(result.done).toBe(true)
      expect(result.value).toEqual({
        scores: { p1: 1, p2: 0 },
        metadata: { finalEvents: expect.any(Array) },
      })
    })
  })

  describe('optionsSchema', () => {
    it('is an empty object schema', () => {
      const gm = new AIGame(rulesDoc)

      const result = gm.optionsSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('event formatting', () => {
    it('handles primitive event data by wrapping in value key', async () => {
      const response: LLMGameResponse = {
        ...makeInitResponse(),
        events: [{ description: 'Score update', data: '42' }],
      }
      mockLLMResponse(response)
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      const gameResponse = await nextResponse(gen)

      expect(gameResponse.events[0].data).toEqual({ description: 'Score update', value: 42 })
    })

    it('handles null event data', async () => {
      const response: LLMGameResponse = {
        ...makeInitResponse(),
        events: [{ description: 'Null event', data: 'null' }],
      }
      mockLLMResponse(response)
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      const gameResponse = await nextResponse(gen)

      expect(gameResponse.events[0].data).toEqual({ description: 'Null event', value: null })
    })
  })

  describe('custom model', () => {
    it('passes the model string to generateText', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc, 'google:gemini-2.0-flash')

      const gen = gm.play(config)
      await gen.next()

      const callArgs = mockGenerateText.mock.calls[0][0]
      expect(callArgs.model).toBeDefined()
    })
  })

  describe('response batching', () => {
    it('single response triggers LLM call immediately', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      await nextResponse(gen) // init
      const response = await nextResponse(gen, { playerId: 'p1', action: { row: 0, col: 0 } })

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p2')
      expect(mockGenerateText).toHaveBeenCalledTimes(2)
    })

    it('buffers responses and triggers LLM on last one', async () => {
      mockLLMResponse(makeMultiPlayerInitResponse())
      mockLLMResponse(makeVoteResultResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config3Players)
      await nextResponse(gen) // init — 3 requests for p1, p2, p3
      const callsAfterInit = mockGenerateText.mock.calls.length

      // First two responses — buffered (no-op yields)
      const r1 = await nextResponse(gen, { playerId: 'p2', action: { vote: 'reject' } })
      expect(r1.requests).toHaveLength(0)
      expect(r1.events).toHaveLength(0)
      expect(mockGenerateText).toHaveBeenCalledTimes(callsAfterInit)

      const r2 = await nextResponse(gen, { playerId: 'p1', action: { vote: 'approve' } })
      expect(r2.requests).toHaveLength(0)
      expect(r2.events).toHaveLength(0)
      expect(mockGenerateText).toHaveBeenCalledTimes(callsAfterInit)

      // Third response — all collected, triggers LLM
      const r3 = await nextResponse(gen, { playerId: 'p3', action: { vote: 'approve' } })
      expect(r3.requests).toHaveLength(1)
      expect(r3.events).toHaveLength(1)
      expect(mockGenerateText).toHaveBeenCalledTimes(callsAfterInit + 1)
    })

    it('uses buildBatchActionMessage for multiple responses', async () => {
      mockLLMResponse(makeMultiPlayerInitResponse())
      mockLLMResponse(makeVoteResultResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config3Players)
      await nextResponse(gen)
      await nextResponse(gen, { playerId: 'p1', action: { vote: 'approve' } })
      await nextResponse(gen, { playerId: 'p2', action: { vote: 'reject' } })
      await nextResponse(gen, { playerId: 'p3', action: { vote: 'approve' } })

      const batchCallArgs = mockGenerateText.mock.calls[1][0]
      expect(batchCallArgs.messages[0].content).toContain('Multiple players have submitted actions simultaneously')
    })

    it('uses buildActionMessage for single queued response', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGame(rulesDoc)

      const gen = gm.play(config)
      await nextResponse(gen)
      await nextResponse(gen, { playerId: 'p1', action: { row: 0, col: 0 } })

      const callArgs = mockGenerateText.mock.calls[1][0]
      expect(callArgs.messages[0].content).toContain('A player has submitted an action')
      expect(callArgs.messages[0].content).not.toContain('Multiple players')
    })
  })
})
