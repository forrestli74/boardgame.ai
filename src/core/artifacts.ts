import { mkdir, writeFile } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GameEvent } from './events.js'
import type { PlayerPrivateEvent } from './player.js'
import type { GameOutcome } from './types.js'

export class GameArtifacts {
  private eventsPath: string

  private constructor(readonly outputDir: string) {
    this.eventsPath = join(outputDir, 'events.jsonl')
  }

  static async create(outputDir: string, config: Record<string, unknown>): Promise<GameArtifacts> {
    await mkdir(join(outputDir, 'players'), { recursive: true })
    await writeFile(join(outputDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')
    return new GameArtifacts(outputDir)
  }

  recordEvent(event: GameEvent): void {
    appendFileSync(this.eventsPath, JSON.stringify(event) + '\n')
  }

  recordPlayerEvent(playerId: string, event: PlayerPrivateEvent): void {
    const playerPath = join(this.outputDir, 'players', `${playerId}.jsonl`)
    appendFileSync(playerPath, JSON.stringify(event) + '\n')
  }

  async writeOutcome(outcome: GameOutcome): Promise<void> {
    await writeFile(join(this.outputDir, 'outcome.json'), JSON.stringify(outcome, null, 2) + '\n')
  }
}
