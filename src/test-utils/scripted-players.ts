import type { Player } from '../core/player.js'

export function scriptedPlayers(actions: [string, unknown][]): Map<string, Player> {
  const queues = new Map<string, unknown[]>()
  for (const [id, action] of actions) {
    if (!queues.has(id)) queues.set(id, [])
    queues.get(id)!.push(action)
  }
  return new Map(
    [...queues.keys()].map(id => [id, {
      id,
      name: id,
      act: async () => queues.get(id)!.shift(),
    }])
  )
}
