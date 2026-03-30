import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { GameResponse } from '../../core/types.js'
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

const players2 = ['p1', 'p2']
const players3 = ['p1', 'p2', 'p3']

const rulesDoc = '# Tic-Tac-Toe\nTwo players take turns placing X and O on a 3x3 grid.'

function makeInitResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ board: [['', '', ''], ['', '', ''], ['', '', '']], currentPlayer: 'p1' }),
    requests: [
      {
        playerId: 'p1',
        prompt: 'You are X. The board is empty (3x3). Choose a cell (e.g. "row 0, col 0").',
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
      { playerId: 'p1', prompt: 'Do you approve the proposed team? Reply "approve" or "reject".' },
      { playerId: 'p2', prompt: 'Do you approve the proposed team? Reply "approve" or "reject".' },
      { playerId: 'p3', prompt: 'Do you approve the proposed team? Reply "approve" or "reject".' },
    ],
    events: [{ description: 'Voting phase started', data: JSON.stringify({ type: 'phase_start' }) }],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeVoteResultResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ phase: 'mission', votes: { p1: 'approve', p2: 'reject', p3: 'approve' } }),
    requests: [
      { playerId: 'p1', prompt: 'You are on the mission. Choose "success" or "fail".' },
    ],
    events: [{ description: 'Vote passed 2-1', data: JSON.stringify({ type: 'vote_result', passed: true }) }],
    isTerminal: false,
    outcome: undefined,
  }
}

function makeMoveResponse(): LLMGameResponse {
  return {
    state: JSON.stringify({ board: [['X', '', ''], ['', '', ''], ['', '', '']], currentPlayer: 'p2' }),
    requests: [
      {
        playerId: 'p2',
        prompt: 'You are O. The board is:\n X | _ | _\n _ | _ | _\n _ | _ | _\nChoose a cell (e.g. "row 1, col 1").',
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
    it('yields a GameResponse with text-based requests', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 })

      const response = await nextResponse(gm.play(players2))

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p1')
      expect(response.requests[0].view).toBe('You are X. The board is empty (3x3). Choose a cell (e.g. "row 0, col 0").')
    })

    it('uses z.string() as actionSchema', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 })

      const response = await nextResponse(gm.play(players2))
      const schema = response.requests[0].actionSchema

      expect(schema.safeParse('row 0, col 0').success).toBe(true)
      expect(schema.safeParse(42).success).toBe(false)
    })

    it('formats events as GameEvent with source "game"', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 })

      const response = await nextResponse(gm.play(players2))

      expect(response.events).toHaveLength(1)
      expect(response.events[0].source).toBe('game')
      expect(response.events[0]).toHaveProperty('timestamp')
      expect(response.events[0].data).toMatchObject({ description: 'Game started', type: 'game_start' })
    })

    it('calls generateText with correct arguments', async () => {
      mockLLMResponse(makeInitResponse())
      const gm = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 })

      await gm.play(players2).next()

      expect(mockGenerateText).toHaveBeenCalledTimes(1)
      const callArgs = mockGenerateText.mock.calls[0][0]
      expect(callArgs.system).toBeDefined()
      expect(callArgs.messages).toHaveLength(1)
      expect(callArgs.messages[0].role).toBe('user')
      expect(callArgs.toolChoice).toEqual({ type: 'tool', toolName: 'game_master_response' })
    })
  })

  describe('subsequent yields', () => {
    it('yields updated GameResponse after player action', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gm = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 })

      const gen = gm.play(players2)
      await nextResponse(gen)
      const response = await nextResponse(gen, { playerId: 'p1', action: 'row 0, col 0' })

      expect(response.requests).toHaveLength(1)
      expect(response.requests[0].playerId).toBe('p2')
      expect(typeof response.requests[0].view).toBe('string')
    })

    it('returns GameOutcome when terminal', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeTerminalResponse())
      const gm = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 })

      const gen = gm.play(players2)
      await nextResponse(gen)
      const result = await gen.next({ playerId: 'p1', action: 'row 0, col 2' })
      expect(result.done).toBe(true)
      expect(result.value).toEqual({
        scores: { p1: 1, p2: 0 },
        metadata: { finalEvents: expect.any(Array) },
      })
    })
  })

  describe('event formatting', () => {
    it('handles primitive event data by wrapping in value key', async () => {
      mockLLMResponse({ ...makeInitResponse(), events: [{ description: 'Score update', data: '42' }] })
      const response = await nextResponse(new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 }).play(players2))
      expect(response.events[0].data).toEqual({ description: 'Score update', value: 42 })
    })

    it('handles null event data', async () => {
      mockLLMResponse({ ...makeInitResponse(), events: [{ description: 'Null event', data: 'null' }] })
      const response = await nextResponse(new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 }).play(players2))
      expect(response.events[0].data).toEqual({ description: 'Null event', value: null })
    })
  })

  describe('response batching', () => {
    it('buffers responses and triggers LLM on last one', async () => {
      mockLLMResponse(makeMultiPlayerInitResponse())
      mockLLMResponse(makeVoteResultResponse())
      const gen = new AIGame(rulesDoc, { gameId: 'test-game-2', seed: 42 }).play(players3)

      await nextResponse(gen)
      const callsAfterInit = mockGenerateText.mock.calls.length

      const r1 = await nextResponse(gen, { playerId: 'p2', action: 'reject' })
      expect(r1.requests).toHaveLength(0)
      expect(mockGenerateText).toHaveBeenCalledTimes(callsAfterInit)

      const r2 = await nextResponse(gen, { playerId: 'p1', action: 'approve' })
      expect(r2.requests).toHaveLength(0)

      const r3 = await nextResponse(gen, { playerId: 'p3', action: 'approve' })
      expect(r3.requests).toHaveLength(1)
      expect(mockGenerateText).toHaveBeenCalledTimes(callsAfterInit + 1)
    })

    it('uses buildBatchActionMessage for multiple responses', async () => {
      mockLLMResponse(makeMultiPlayerInitResponse())
      mockLLMResponse(makeVoteResultResponse())
      const gen = new AIGame(rulesDoc, { gameId: 'test-game-2', seed: 42 }).play(players3)

      await nextResponse(gen)
      await nextResponse(gen, { playerId: 'p1', action: 'approve' })
      await nextResponse(gen, { playerId: 'p2', action: 'reject' })
      await nextResponse(gen, { playerId: 'p3', action: 'approve' })

      const batchCallArgs = mockGenerateText.mock.calls[1][0]
      expect(batchCallArgs.messages[0].content).toContain('Multiple players have submitted actions simultaneously')
    })

    it('uses buildActionMessage for single queued response', async () => {
      mockLLMResponse(makeInitResponse())
      mockLLMResponse(makeMoveResponse())
      const gen = new AIGame(rulesDoc, { gameId: 'test-game-1', seed: 42 }).play(players2)

      await nextResponse(gen)
      await nextResponse(gen, { playerId: 'p1', action: 'row 0, col 0' })

      const callArgs = mockGenerateText.mock.calls[1][0]
      expect(callArgs.messages[0].content).toContain('A player has submitted an action')
      expect(callArgs.messages[0].content).not.toContain('Multiple players')
    })
  })
})
