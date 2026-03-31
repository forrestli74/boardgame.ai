import { describe, it, expect } from 'vitest'
import { createGame } from './game-registry.js'
import { Avalon } from '../games/avalon/avalon.js'

describe('createGame', () => {
  it('creates Avalon with no gameOptions', () => {
    const game = createGame('avalon')
    expect(game).toBeInstanceOf(Avalon)
  })

  it('creates Avalon with seed', () => {
    const game = createGame('avalon', { seed: 42 })
    expect(game).toBeInstanceOf(Avalon)
  })

  it('creates Avalon with broadcast discussion', () => {
    const game = createGame('avalon', {
      discussion: { type: 'broadcast', maxRounds: 2 },
    })
    expect(game).toBeInstanceOf(Avalon)
  })

  it('creates Avalon with seed and discussion', () => {
    const game = createGame('avalon', {
      seed: 7,
      discussion: { type: 'broadcast', maxRounds: 3 },
    })
    expect(game).toBeInstanceOf(Avalon)
  })

  it('throws on unknown game name', () => {
    expect(() => createGame('chess')).toThrow('Unknown game: chess')
  })

  it('throws on .md path (not yet supported)', () => {
    expect(() => createGame('my-game.md')).toThrow(
      'AIGame (.md rules) not yet supported in CLI',
    )
  })
})
