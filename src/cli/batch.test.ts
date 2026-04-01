import { describe, it, expect } from 'vitest'
import {
  generateRotations,
  generatePermutations,
  generateGamePlans,
} from './batch.js'
import type { ResolvedPlayer, GameConfig } from './config.js'

describe('generateRotations', () => {
  it('produces N rotations in correct order', () => {
    expect(generateRotations(['A', 'B', 'C'])).toEqual([
      ['A', 'B', 'C'],
      ['B', 'C', 'A'],
      ['C', 'A', 'B'],
    ])
  })

  it('single element produces one rotation', () => {
    expect(generateRotations(['A'])).toEqual([['A']])
  })
})

describe('generatePermutations', () => {
  it('two elements produce 2 permutations', () => {
    expect(generatePermutations(['A', 'B'])).toEqual([
      ['A', 'B'],
      ['B', 'A'],
    ])
  })

  it('three elements produce 6 unique permutations', () => {
    const perms = generatePermutations(['A', 'B', 'C'])
    expect(perms).toHaveLength(6)
    const unique = new Set(perms.map((p) => p.join(',')))
    expect(unique.size).toBe(6)
  })
})

const players: ResolvedPlayer[] = [
  { name: 'Alice' },
  { name: 'Bob' },
  { name: 'Carol' },
]

const baseConfig: GameConfig = {
  game: 'avalon',
  players: players.map((p) => ({ name: p.name })),
}

const baseOptions = {
  concurrency: 1,
  outputDir: './output',
  date: '20260330',
}

describe('generateGamePlans', () => {
  it('balance=none, groups=3 produces 3 plans without iteration', () => {
    const { batchDir, plans } = generateGamePlans(baseConfig, players, {
      ...baseOptions,
      groups: 3,
      balance: 'none',
    })

    expect(batchDir).toBe('output/avalon-20260330')
    expect(plans).toHaveLength(3)
    expect(plans[0].gameId).toBe('0001')
    expect(plans[1].gameId).toBe('0002')
    expect(plans[2].gameId).toBe('0003')
    for (const plan of plans) {
      expect(plan.iteration).toBeUndefined()
    }
  })

  it('balance=rotate, groups=2, 3 players produces 6 plans', () => {
    const { plans } = generateGamePlans(baseConfig, players, {
      ...baseOptions,
      groups: 2,
      balance: 'rotate',
    })

    expect(plans).toHaveLength(6) // 2 groups × 3 rotations
    expect(plans[0].gameId).toBe('0001-001')
    expect(plans[2].gameId).toBe('0001-003')
    expect(plans[3].gameId).toBe('0002-001')

    // Verify rotations within group 1
    expect(plans[0].playerOrder.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Carol'])
    expect(plans[1].playerOrder.map((p) => p.name)).toEqual(['Bob', 'Carol', 'Alice'])
    expect(plans[2].playerOrder.map((p) => p.name)).toEqual(['Carol', 'Alice', 'Bob'])

    for (const plan of plans) {
      expect(plan.iteration).toBeDefined()
    }
  })

  it('balance=permute, groups=1, 2 players produces 2 plans', () => {
    const twoPlayers: ResolvedPlayer[] = [{ name: 'Alice' }, { name: 'Bob' }]
    const twoPlayerConfig: GameConfig = {
      game: 'avalon',
      players: twoPlayers.map((p) => ({ name: p.name })),
    }

    const { plans } = generateGamePlans(twoPlayerConfig, twoPlayers, {
      ...baseOptions,
      groups: 1,
      balance: 'permute',
    })

    expect(plans).toHaveLength(2) // 1 group × 2!
    expect(plans[0].playerOrder.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(plans[1].playerOrder.map((p) => p.name)).toEqual(['Bob', 'Alice'])
    expect(plans[0].gameId).toBe('0001-001')
    expect(plans[1].gameId).toBe('0001-002')
  })
})
