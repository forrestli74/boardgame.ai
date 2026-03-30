import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { runGame } from './run-game.js'
import type { Game } from './game.js'
import type { Player } from './player.js'

describe('runGame', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'run-game-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('does not write outcome.json when game returns null', async () => {
    const game: Game = {
      async *play() {
        yield { requests: [], events: [] }
        return { scores: {} }
      },
    }

    const outputDir = join(tmpDir, 'test-null')
    const result = await runGame({
      gameId: 'test-null',
      game,
      players: [],
      outputDir,
    })

    expect(result.outcome).toBeNull()
    const files = await readdir(outputDir)
    expect(files).not.toContain('outcome.json')
  })

  it('runs a game and writes all artifacts', async () => {
    const game: Game = {
      async *play(playerIds) {
        const first = yield {
          requests: playerIds.map(id => ({
            playerId: id,
            view: 'your turn',
            actionSchema: z.literal('yes'),
          })),
          events: [{ type: 'start' }],
        }
        yield { requests: [], events: [] }
        return { scores: Object.fromEntries(playerIds.map(id => [id, 1])) }
      },
    }

    const makeMockPlayer = (id: string): Player => {
      const listeners: ((data: unknown) => void)[] = []
      return {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        async act() {
          for (const fn of listeners) {
            fn({ reasoning: `${id} thinking`, memory: '', action: 'yes' })
          }
          return 'yes'
        },
        onEvent(listener) { listeners.push(listener) },
      }
    }

    const outputDir = join(tmpDir, 'test-run')
    const result = await runGame({
      gameId: 'test-run',
      game,
      players: [makeMockPlayer('alice'), makeMockPlayer('bob')],
      outputDir,
    })

    expect(result.outcome).toEqual({ scores: { alice: 1, bob: 1 } })
    expect(result.outputDir).toBe(outputDir)

    // Verify all files
    const files = await readdir(outputDir)
    expect(files.sort()).toEqual(['config.json', 'events.jsonl', 'outcome.json', 'players'])

    const playerFiles = await readdir(join(outputDir, 'players'))
    expect(playerFiles.sort()).toEqual(['alice.jsonl', 'bob.jsonl'])

    // Verify config.json
    const config = JSON.parse(await readFile(join(outputDir, 'config.json'), 'utf-8'))
    expect(config.gameId).toBe('test-run')
    expect(config.players).toEqual([
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ])

    // Verify outcome.json
    const outcome = JSON.parse(await readFile(join(outputDir, 'outcome.json'), 'utf-8'))
    expect(outcome.scores).toEqual({ alice: 1, bob: 1 })

    // Verify events.jsonl has content
    const events = (await readFile(join(outputDir, 'events.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    expect(events.length).toBeGreaterThan(0)

    // Verify player logs
    const aliceLog = (await readFile(join(outputDir, 'players', 'alice.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    expect(aliceLog.length).toBe(1)
    expect(aliceLog[0].reasoning).toBe('alice thinking')
  })
})
