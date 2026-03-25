import type { Game } from './game.js'
import type { Player } from './player.js'
import type { ActionRequest, GameConfig, GameOutcome } from './types.js'
import type { Recorder } from './recorder.js'

interface PendingResponse {
  playerId: string
  action: unknown
  request: ActionRequest
}

export class Engine {
  private maxRetries = 3

  constructor(private recorder: Recorder) {}

  async run(game: Game, players: Map<string, Player>, config: GameConfig): Promise<GameOutcome | null> {
    const pending = new Map<string, Promise<PendingResponse>>()

    const initial = await game.init(config)
    for (const event of initial.events) {
      this.recorder.record(event)
    }
    let requests = initial.requests

    while (true) {
      for (const req of requests) {
        if (!pending.has(req.playerId)) {
          const player = players.get(req.playerId)!
          const promise = player.act(req)
            .then(action => ({ playerId: req.playerId, action, request: req }))
          pending.set(req.playerId, promise)
        }
      }

      if (pending.size === 0) break

      const response = await Promise.race(pending.values())
      pending.delete(response.playerId)

      const parsed = await this.validateWithRetry(
        response.action, response.request, players.get(response.playerId)!
      )

      this.recorder.record({
        source: 'player',
        gameId: config.gameId,
        playerId: response.playerId,
        data: parsed,
        timestamp: new Date().toISOString(),
      })

      const gameResponse = await game.handleResponse(response.playerId, parsed)
      for (const event of gameResponse.events) {
        this.recorder.record(event)
      }
      requests = gameResponse.requests

      if (game.isTerminal()) break
    }

    return game.getOutcome()
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
