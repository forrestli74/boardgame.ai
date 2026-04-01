import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseConfig } from './config.js'
import { resolvePersonas } from './config.js'
import { runBatch } from './batch.js'
import { logger } from '../core/logger.js'
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

    const groups = parseInt(opts.groups, 10)
    if (!Number.isFinite(groups) || groups < 1) {
      console.error('error: --groups must be a positive integer')
      process.exit(1)
    }
    const concurrency = parseInt(opts.concurrency, 10)
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      console.error('error: --concurrency must be a positive integer')
      process.exit(1)
    }

    const batchOptions: BatchOptions = {
      groups,
      balance: opts.balance as BatchOptions['balance'],
      concurrency,
      outputDir: opts.output,
      date,
    }

    const result = await runBatch(config, players, batchOptions)

    logger.info({ type: 'batch-complete', completed: result.completed, total: result.total, failed: result.failed })

    if (result.failed > 0) {
      process.exit(1)
    }
  })

