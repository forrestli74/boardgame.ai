import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GameArtifacts } from './artifacts.js'
import type { GameEvent } from './events.js'
import type { PlayerPrivateEvent } from './player.js'
import type { GameOutcome } from './types.js'

describe('GameArtifacts', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'artifacts-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('creates output directory and writes config.json', async () => {
    const config = {
      gameId: 'test-1',
      seed: 42,
      players: ['alice', 'bob'],
    }
    const outputDir = join(tmpDir, 'test-1')
    await GameArtifacts.create(outputDir, config)

    const raw = await readFile(join(outputDir, 'config.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(config)
  })

  it('records game events to events.jsonl', async () => {
    const outputDir = join(tmpDir, 'test-events')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test' })

    const event1: GameEvent = {
      seq: 0, source: 'game', gameId: 'test',
      data: { description: 'Game started' }, timestamp: '2026-01-01T00:00:00.000Z',
    }
    const event2: GameEvent = {
      seq: 1, source: 'player', gameId: 'test', playerId: 'alice',
      data: 'approve', timestamp: '2026-01-01T00:00:01.000Z',
    }

    artifacts.recordEvent(event1)
    artifacts.recordEvent(event2)

    const lines = (await readFile(join(outputDir, 'events.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    expect(lines).toEqual([event1, event2])
  })
})
