import type { ActionRequest } from './types.js'

export interface PlayerPrivateEvent {
  type: string
  data: unknown
  triggerSeq?: number
}

export interface Player {
  readonly id: string
  readonly name: string
  act(request: ActionRequest): Promise<unknown>
  onEvent?(listener: (event: PlayerPrivateEvent) => void): void
}
