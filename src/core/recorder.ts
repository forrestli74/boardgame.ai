import pino from 'pino'
import type { GameEvent } from './events.js'

export class Recorder {
  private logger: pino.Logger
  private destination: pino.DestinationStream

  constructor(gameId: string, filePath: string) {
    this.destination = pino.destination({ dest: filePath, sync: true })
    const root = pino({ level: 'info' }, this.destination)
    this.logger = root.child({ gameId })
  }

  record(event: GameEvent): void {
    this.logger.info(event)
  }

  flush(): void {
    if ('flushSync' in this.destination) {
      (this.destination as pino.DestinationStream & { flushSync: () => void }).flushSync()
    }
  }
}
