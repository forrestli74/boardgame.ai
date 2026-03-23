import type { ActionRequest } from './types.js'

export interface Player {
  readonly id: string
  readonly name: string
  act(request: ActionRequest): Promise<unknown>
}
