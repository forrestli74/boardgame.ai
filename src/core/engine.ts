import type { Game, PlayerAction } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameConfig, GameOutcome } from './types.js'
import type { GameEvent } from './events.js'

interface PendingResponse {
  playerId: string
  action: unknown
  request: ActionRequest
}

export class Engine {
  private maxRetries = 3
  private listeners: ((event: GameEvent) => void)[] = []

  onEvent(listener: (event: GameEvent) => void): void {
    this.listeners.push(listener)
  }

  private emit(event: GameEvent): void {
    for (const fn of this.listeners) fn(event)
  }

  async run(game: Game, players: Map<string, Player>, config: GameConfig): Promise<GameOutcome | null> {
    const gen = game.play(config)
    const pending = new Map<string, Promise<PendingResponse>>()

    let result = await gen.next()
    while (!result.done) {
      const { requests, events } = result.value
      for (const event of events) {
        this.emit(event)
      }

      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const player = players.get(req.playerId)!
          const promise = player.act(req)
            .then(action => ({ playerId: req.playerId, action, request: req }))
          pending.set(req.playerId, promise)
        }
      }

      if (pending.size === 0) return null

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)

      const parsed = await this.validateWithRetry(
        response.action, response.request, players.get(response.playerId)!
      )

      this.emit({
        source: 'player',
        gameId: config.gameId,
        playerId: response.playerId,
        data: parsed,
        timestamp: new Date().toISOString(),
      })

      result = await gen.next({ playerId: response.playerId, action: parsed })
    }

    return result.value
  }

  private async validateWithRetry(
    action: unknown, request: ActionRequest, player: Player
  ): Promise<unknown> {
    let current = action
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = request.actionSchema.safeParse(current)
      if (result.success) return result.data
      if (attempt < this.maxRetries) {
        current = await player.act(request)
      }
    }
    return null
  }
}
