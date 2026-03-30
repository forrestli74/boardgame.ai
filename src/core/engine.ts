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

  private emitGameEvent(data: unknown): void {
    this.lastSeq++
    const event: GameEvent = {
      seq: this.lastSeq,
      source: 'game',
      gameId: this.gameId,
      data,
      timestamp: new Date().toISOString(),
    }
    for (const fn of this.listeners) fn(event)
  }

  private emitPlayerEvent(playerId: string, action: unknown, lastSeenSeq: number): void {
    this.lastSeq++
    const event: GameEvent = {
      seq: this.lastSeq,
      source: 'player',
      gameId: this.gameId,
      playerId,
      lastSeenSeq,
      data: action,
      timestamp: new Date().toISOString(),
    }
    for (const fn of this.listeners) fn(event)
  }

  async run(game: Game, players: Map<string, Player>): Promise<GameOutcome | null> {
    const gen = game.play([...players.keys()])
    const pending = new Map<string, Promise<PendingResponse>>()
    this.lastSeq = -1

    let result = await gen.next()
    while (!result.done) {
      const { requests, events } = result.value
      for (const eventData of events) {
        this.emitGameEvent(eventData)
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

      this.emitPlayerEvent(response.playerId, response.action, response.request.lastSeenSeq ?? -1)

      result = await gen.next({ playerId: response.playerId, action: response.action })
    }

    return result.value
  }
}
