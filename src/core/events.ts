export interface GameSourceEvent {
  seq: number
  source: 'game'
  gameId: string
  data: unknown
  timestamp: string
}

export interface PlayerSourceEvent {
  seq: number
  source: 'player'
  gameId: string
  playerId: string
  lastSeenSeq: number
  data: unknown
  timestamp: string
}

export type GameEvent = GameSourceEvent | PlayerSourceEvent
