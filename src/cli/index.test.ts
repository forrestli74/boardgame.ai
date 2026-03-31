import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'

vi.mock('./batch.js', () => ({
  runBatch: vi.fn().mockResolvedValue({ total: 1, completed: 1, failed: 0, results: [] }),
}))

vi.mock('./config.js', () => ({
  parseConfig: vi.fn((raw: unknown) => raw),
  resolvePersonas: vi.fn((players: unknown[]) =>
    Promise.resolve(players.map((p: any) => ({ name: p.name }))),
  ),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({ game: 'avalon', players: [{ name: 'Alice' }] }),
  ),
}))

describe('CLI argument parsing', () => {
  let program: Command

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./index.js')
    program = mod.program
  })

  it('parses config path as positional argument', async () => {
    let capturedConfig = ''
    program.action(async (config: string) => {
      capturedConfig = config
    })
    await program.parseAsync(['node', 'boardgame', 'my-config.json'])
    expect(capturedConfig).toBe('my-config.json')
  })

  it('has correct default options', () => {
    const groups = program.opts()
    // Defaults are set before parsing, verify via option definitions
    const groupsOpt = program.options.find((o) => o.long === '--groups')
    const balanceOpt = program.options.find((o) => o.long === '--balance')
    const concurrencyOpt = program.options.find((o) => o.long === '--concurrency')
    const outputOpt = program.options.find((o) => o.long === '--output')

    expect(groupsOpt?.defaultValue).toBe('1')
    expect(balanceOpt?.defaultValue).toBe('none')
    expect(concurrencyOpt?.defaultValue).toBe('1')
    expect(outputOpt?.defaultValue).toBe('./output')
  })

  it('custom options override defaults', async () => {
    let capturedOpts: Record<string, string> = {}
    program.action(async (_config: string, opts: Record<string, string>) => {
      capturedOpts = opts
    })
    await program.parseAsync([
      'node', 'boardgame', 'config.json',
      '--groups', '5',
      '--balance', 'rotate',
      '--concurrency', '3',
      '--output', '/tmp/out',
    ])
    expect(capturedOpts.groups).toBe('5')
    expect(capturedOpts.balance).toBe('rotate')
    expect(capturedOpts.concurrency).toBe('3')
    expect(capturedOpts.output).toBe('/tmp/out')
  })

  it('rejects invalid balance choice via action validation', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Re-import to get fresh program with real action handler
    vi.resetModules()
    const mod = await import('./index.js')

    await expect(
      mod.program.parseAsync(['node', 'boardgame', 'config.json', '--balance', 'invalid']),
    ).rejects.toThrow('process.exit')

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid balance mode'),
    )

    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
