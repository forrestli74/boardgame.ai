import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GameArtifacts, type ArtifactConfig } from './artifacts.js'
import type { GameEvent } from './events.js'
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
    const config: ArtifactConfig = {
      gameId: 'test-1',
      players: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }],
    }
    const outputDir = join(tmpDir, 'test-1')
    await GameArtifacts.create(outputDir, config)

    const raw = await readFile(join(outputDir, 'config.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(config)
  })

  it('records game events to events.jsonl', async () => {
    const outputDir = join(tmpDir, 'test-events')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test', players: [] })

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

  it('records player private data to players/{id}.jsonl', async () => {
    const outputDir = join(tmpDir, 'test-player')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test', players: [] })

    const aliceData = { reasoning: 'I think bob is evil', memory: 'Round 1', action: 'approve' }
    const bobData = { reasoning: 'Trust alice', memory: 'Round 1', action: 'reject' }

    artifacts.recordPlayerEvent('alice', aliceData)
    artifacts.recordPlayerEvent('bob', bobData)

    const aliceLines = (await readFile(join(outputDir, 'players', 'alice.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))
    const bobLines = (await readFile(join(outputDir, 'players', 'bob.jsonl'), 'utf-8'))
      .trim().split('\n').map(l => JSON.parse(l))

    expect(aliceLines).toEqual([aliceData])
    expect(bobLines).toEqual([bobData])
  })

  it('writes outcome.json', async () => {
    const outputDir = join(tmpDir, 'test-outcome')
    const artifacts = await GameArtifacts.create(outputDir, { gameId: 'test', players: [] })

    const outcome: GameOutcome = {
      scores: { alice: 1, bob: 0 },
      metadata: { winner: 'good' },
    }

    await artifacts.writeOutcome(outcome)

    const raw = await readFile(join(outputDir, 'outcome.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(outcome)
  })
})
