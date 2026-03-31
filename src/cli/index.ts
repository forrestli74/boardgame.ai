#!/usr/bin/env node

import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseConfig } from './config.js'
import { resolvePersonas } from './config.js'
import { runBatch } from './batch.js'
import type { BatchOptions } from './batch.js'

export const program = new Command()

program
  .name('boardgame')
  .argument('<config>', 'path to JSON config file')
  .option('--groups <n>', 'number of groups', '1')
  .option('--balance <mode>', 'seat balancing mode', 'none')
  .option('--concurrency <n>', 'max concurrent games', '1')
  .option('--output <dir>', 'output directory', './output')
  .action(async (configPath: string, opts: Record<string, string>) => {
    // Validate balance choice
    const validBalances = ['none', 'rotate', 'permute']
    if (!validBalances.includes(opts.balance)) {
      console.error(`error: invalid balance mode '${opts.balance}' (choose from: ${validBalances.join(', ')})`)
      process.exit(1)
    }

    let raw: string
    try {
      raw = await readFile(resolve(configPath), 'utf-8')
    } catch {
      console.error(`error: cannot read config file '${configPath}'`)
      process.exit(1)
    }

    let config
    try {
      config = parseConfig(JSON.parse(raw))
    } catch (err) {
      console.error(`error: invalid config — ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }

    const configDir = dirname(resolve(configPath))
    const players = await resolvePersonas(config.players, configDir)
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    const batchOptions: BatchOptions = {
      groups: parseInt(opts.groups, 10),
      balance: opts.balance as BatchOptions['balance'],
      concurrency: parseInt(opts.concurrency, 10),
      outputDir: opts.output,
      date,
    }

    const result = await runBatch(config, players, batchOptions)

    console.log(`Completed: ${result.completed}/${result.total} games (${result.failed} failed)`)

    if (result.failed > 0) {
      process.exit(1)
    }
  })

// Only run if this is the main module (not imported by tests)
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))

if (isMain) {
  program.parseAsync().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
