import { describe, it, expect } from 'vitest'
import { scriptedPlayers } from './scripted-players.js'

describe('scriptedPlayers', () => {
  it('splits actions into per-player queues', async () => {
    const players = scriptedPlayers([
      ['alice', 'move-1'],
      ['bob', 'move-a'],
      ['alice', 'move-2'],
      ['bob', 'move-b'],
    ])

    expect(players.size).toBe(2)
    const alice = players.get('alice')!
    const bob = players.get('bob')!

    expect(await alice.act({ playerId: 'alice', view: {}, actionSchema: {} as any })).toBe('move-1')
    expect(await bob.act({ playerId: 'bob', view: {}, actionSchema: {} as any })).toBe('move-a')
    expect(await alice.act({ playerId: 'alice', view: {}, actionSchema: {} as any })).toBe('move-2')
    expect(await bob.act({ playerId: 'bob', view: {}, actionSchema: {} as any })).toBe('move-b')
  })
})
