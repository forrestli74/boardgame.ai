import { mkdir, writeFile } from 'node:fs/promises'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { GameEvent } from './events.js'
import type { PlayerPrivateEvent } from './player.js'
import type { GameOutcome } from './types.js'

export interface ArtifactConfig {
  gameId: string
  players: { id: string; name: string }[]
}

export class GameArtifacts {
  private eventsPath: string

  private constructor(readonly outputDir: string) {
    this.eventsPath = join(outputDir, 'events.jsonl')
  }

  static async create(outputDir: string, config: ArtifactConfig): Promise<GameArtifacts> {
    // Wipe events.jsonl if dir already exists to prevent appending to stale data
    await mkdir(join(outputDir, 'players'), { recursive: true })
    writeFileSync(join(outputDir, 'events.jsonl'), '')
    await writeFile(join(outputDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')
    return new GameArtifacts(outputDir)
  }

  // Sync writes guarantee event ordering — same rationale as Recorder using Pino sync mode
  recordEvent(event: GameEvent): void {
    appendFileSync(this.eventsPath, JSON.stringify(event) + '\n')
  }

  recordPlayerEvent(playerId: string, event: PlayerPrivateEvent): void {
    const safe = basename(playerId)
    const playerPath = join(this.outputDir, 'players', `${safe}.jsonl`)
    appendFileSync(playerPath, JSON.stringify(event) + '\n')
  }

  async writeOutcome(outcome: GameOutcome): Promise<void> {
    await writeFile(join(this.outputDir, 'outcome.json'), JSON.stringify(outcome, null, 2) + '\n')
  }
}
