import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { Player } from './player.js'
import type { ActionRequest } from './types.js'

describe('Player interface', () => {
  it('can be implemented as a plain object', () => {
    const player: Player = {
      id: 'p1',
      name: 'Alice',
      act: async (_request: ActionRequest) => ({ vote: 'yes' }),
    }
    expect(player.id).toBe('p1')
  })

  it('act receives ActionRequest and returns Promise<unknown>', async () => {
    const player: Player = {
      id: 'p1',
      name: 'Alice',
      act: async (request: ActionRequest) => {
        expect(request.playerId).toBe('p1')
        return { vote: 'yes' }
      },
    }
    const req: ActionRequest = {
      playerId: 'p1',
      view: { cards: [] },
      actionSchema: z.object({ vote: z.string() }),
    }
    const result = await player.act(req)
    expect(result).toEqual({ vote: 'yes' })
  })

  it('Player is not generic — same interface for any action type', () => {
    const player1: Player = { id: 'p1', name: 'A', act: async () => 'string-action' }
    const player2: Player = { id: 'p2', name: 'B', act: async () => ({ complex: true }) }
    expect(player1).toBeDefined()
    expect(player2).toBeDefined()
  })
})
