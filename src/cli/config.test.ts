import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseConfig, resolvePersonas } from './config.js'

describe('parseConfig', () => {
  it('parses a valid config with all fields', () => {
    const raw = {
      game: 'avalon',
      gameOptions: { seed: 42, discussion: { type: 'broadcast', maxRounds: 2 } },
      players: [
        { name: 'Alice', model: 'google:gemini-2.5-flash', persona: 'cautious' },
        { name: 'Bob', personaFile: './personas/deceptive.md' },
        { name: 'Charlie' },
      ],
    }
    const config = parseConfig(raw)
    expect(config.game).toBe('avalon')
    expect(config.players).toHaveLength(3)
    expect(config.gameOptions).toEqual({ seed: 42, discussion: { type: 'broadcast', maxRounds: 2 } })
  })

  it('parses a minimal config (just game + players with names)', () => {
    const config = parseConfig({
      game: 'tic-tac-toe',
      players: [{ name: 'Alice' }, { name: 'Bob' }],
    })
    expect(config.game).toBe('tic-tac-toe')
    expect(config.players).toHaveLength(2)
    expect(config.gameOptions).toBeUndefined()
  })

  it('rejects config where both persona and personaFile are set', () => {
    expect(() =>
      parseConfig({
        game: 'avalon',
        players: [{ name: 'Alice', persona: 'cautious', personaFile: './p.md' }],
      }),
    ).toThrow('persona and personaFile are mutually exclusive')
  })

  it('rejects an empty players array', () => {
    expect(() =>
      parseConfig({ game: 'avalon', players: [] }),
    ).toThrow()
  })

  it('preserves arbitrary nested gameOptions', () => {
    const options = {
      deep: { nested: { value: [1, 2, { three: true }] } },
      flag: false,
      count: 99,
    }
    const config = parseConfig({
      game: 'test',
      gameOptions: options,
      players: [{ name: 'A' }],
    })
    expect(config.gameOptions).toEqual(options)
  })
})

describe('resolvePersonas', () => {
  let tmpDir: string

  it('resolves personaFile to file content', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'config-test-'))
    const personaContent = 'You are a deceptive player who lies often.'
    await writeFile(join(tmpDir, 'deceptive.md'), personaContent)

    const players = [
      { name: 'Alice', persona: 'cautious' },
      { name: 'Bob', personaFile: './deceptive.md' },
      { name: 'Charlie' },
    ]
    const resolved = await resolvePersonas(players, tmpDir)

    expect(resolved).toEqual([
      { name: 'Alice', persona: 'cautious' },
      { name: 'Bob', persona: personaContent },
      { name: 'Charlie' },
    ])

    await rm(tmpDir, { recursive: true })
  })

  it('passes through model when present', async () => {
    const players = [{ name: 'Alice', model: 'google:gemini-2.5-flash', persona: 'bold' }]
    const resolved = await resolvePersonas(players, '/tmp')

    expect(resolved).toEqual([
      { name: 'Alice', model: 'google:gemini-2.5-flash', persona: 'bold' },
    ])
  })
})
