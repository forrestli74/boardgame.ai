import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Recorder } from './recorder.js'
import type { GameEvent } from './events.js'

const ts = '2026-01-01T00:00:00.000Z'

function tmpFile() {
  return join(tmpdir(), `recorder-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`)
}

describe('Recorder', () => {
  let filePath: string

  beforeEach(() => {
    filePath = tmpFile()
  })

  afterEach(() => {
    try { unlinkSync(filePath) } catch {}
  })

  it('record writes a JSONL line to the output file', () => {
    const recorder = new Recorder('g1', filePath)
    const event: GameEvent = { seq: 0, source: 'game', gameId: 'g1', data: { type: 'start' }, timestamp: ts }
    recorder.record(event)
    recorder.flush()
    const contents = readFileSync(filePath, 'utf8').trim()
    expect(contents.length).toBeGreaterThan(0)
  })

  it('each JSONL line is valid JSON when parsed', () => {
    const recorder = new Recorder('g1', filePath)
    const event: GameEvent = { seq: 0, source: 'game', gameId: 'g1', data: {}, timestamp: ts }
    recorder.record(event)
    recorder.flush()
    const line = readFileSync(filePath, 'utf8').trim().split('\n')[0]
    expect(() => JSON.parse(line)).not.toThrow()
  })

  it('each JSONL line contains gameId field', () => {
    const recorder = new Recorder('g1', filePath)
    const event: GameEvent = { seq: 0, source: 'game', gameId: 'g1', data: {}, timestamp: ts }
    recorder.record(event)
    recorder.flush()
    const line = readFileSync(filePath, 'utf8').trim().split('\n')[0]
    const parsed = JSON.parse(line)
    expect(parsed.gameId).toBe('g1')
  })

  it('multiple events produce multiple JSONL lines', () => {
    const recorder = new Recorder('g1', filePath)
    const event1: GameEvent = { seq: 0, source: 'game', gameId: 'g1', data: { n: 1 }, timestamp: ts }
    const event2: GameEvent = { seq: 1, source: 'player', gameId: 'g1', playerId: 'p1', data: { n: 2 }, timestamp: ts }
    recorder.record(event1)
    recorder.record(event2)
    recorder.flush()
    const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(l => l.length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })

  it('flush ensures buffered writes are flushed to disk', () => {
    const recorder = new Recorder('g1', filePath)
    recorder.record({ seq: 0, source: 'game', gameId: 'g1', data: {}, timestamp: ts })
    recorder.flush()
    const contents = readFileSync(filePath, 'utf8')
    expect(contents.length).toBeGreaterThan(0)
  })

  it('handles both player and game events', () => {
    const recorder = new Recorder('g1', filePath)
    const playerEvent: GameEvent = {
      seq: 0, source: 'player', gameId: 'g1', playerId: 'p1', data: { vote: 'yes' }, timestamp: ts,
    }
    const gameEvent: GameEvent = {
      seq: 1, source: 'game', gameId: 'g1', data: { type: 'result' }, timestamp: ts,
    }
    recorder.record(playerEvent)
    recorder.record(gameEvent)
    recorder.flush()
    const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(l => l.length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })
})
