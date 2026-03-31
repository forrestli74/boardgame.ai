import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import type { GameEvent } from './events.js'
import type { GameOutcome } from './types.js'

export class GameArtifacts {
  private eventsPath: string
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(readonly outputDir: string) {
    this.eventsPath = join(outputDir, 'events.jsonl')
  }

  static async create(outputDir: string, config: unknown): Promise<GameArtifacts> {
    await mkdir(join(outputDir, 'players'), { recursive: true })
    await writeFile(join(outputDir, 'events.jsonl'), '')
    await writeFile(join(outputDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')
    return new GameArtifacts(outputDir)
  }

  private enqueue(fn: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(fn)
  }

  recordEvent(event: GameEvent): void {
    this.enqueue(() => appendFile(this.eventsPath, JSON.stringify(event) + '\n'))
  }

  recordPlayerEvent(playerId: string, data: unknown): void {
    const safe = basename(playerId)
    const playerPath = join(this.outputDir, 'players', `${safe}.jsonl`)
    this.enqueue(() => appendFile(playerPath, JSON.stringify(data) + '\n'))
  }

  async writeOutcome(outcome: GameOutcome): Promise<void> {
    await this.writeQueue
    await writeFile(join(this.outputDir, 'outcome.json'), JSON.stringify(outcome, null, 2) + '\n')
  }
}
