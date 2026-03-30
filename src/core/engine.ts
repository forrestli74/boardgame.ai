import type { Game, PlayerAction } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameOutcome } from './types.js'
import type { GameEvent } from './events.js'

interface PendingResponse {
  playerId: string
  action: unknown
  request: ActionRequest
}

export class Engine {
  readonly gameId: string
  private listeners: ((event: GameEvent) => void)[] = []
  private lastSeq = -1

  constructor(gameId: string) {
    this.gameId = gameId
  }

  onEvent(listener: (event: GameEvent) => void): void {
    this.listeners.push(listener)
  }

  private emit(event: Omit<GameEvent, 'seq' | 'gameId'>): void {
    this.lastSeq++
    const stamped = { seq: this.lastSeq, gameId: this.gameId, ...event } as GameEvent
    for (const fn of this.listeners) fn(stamped)
  }

  async run(game: Game, players: Map<string, Player>): Promise<GameOutcome | null> {
    const gen = game.play([...players.keys()])
    const pending = new Map<string, Promise<PendingResponse>>()
    this.lastSeq = -1

    let result = await gen.next()
    while (!result.done) {
      const { requests, events } = result.value
      for (const event of events) {
        this.emit(event)
      }

      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const player = players.get(req.playerId)!
          const stamped = { ...req, lastSeenSeq: this.lastSeq }
          const promise = player.act(stamped)
            .then(action => ({ playerId: req.playerId, action, request: stamped }))
          pending.set(req.playerId, promise)
        }
      }

      if (pending.size === 0) return null

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)

      this.emit({
        source: 'player',
        playerId: response.playerId,
        lastSeenSeq: response.request.lastSeenSeq,
        data: response.action,
        timestamp: new Date().toISOString(),
      })

      result = await gen.next({ playerId: response.playerId, action: response.action })
    }

    return result.value
  }
}
