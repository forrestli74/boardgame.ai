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
  private _lastSeq = -1
  private started = false

  constructor(gameId: string) {
    this.gameId = gameId
  }

  get lastSeq(): number { return this._lastSeq }

  onEvent(listener: (event: GameEvent) => void): void {
    this.listeners.push(listener)
  }

  private emitGameEvent(data: unknown): void {
    this._lastSeq++
    const event: GameEvent = {
      seq: this._lastSeq,
      source: 'game',
      gameId: this.gameId,
      data,
      timestamp: new Date().toISOString(),
    }
    for (const fn of this.listeners) fn(event)
  }

  private emitPlayerEvent(playerId: string, action: unknown, lastSeenSeq: number): void {
    this._lastSeq++
    const event: GameEvent = {
      seq: this._lastSeq,
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
    if (this.started) throw new Error('Engine can only run once')
    this.started = true
    const gen = game.play([...players.keys()])
    const pending = new Map<string, Promise<PendingResponse>>()
    this._lastSeq = -1

    let result = await gen.next()
    while (!result.done) {
      const { requests, events } = result.value
      for (const eventData of events) {
        this.emitGameEvent(eventData)
      }

      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const player = players.get(req.playerId)!
          const stamped = { ...req, lastSeenSeq: this._lastSeq }
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
