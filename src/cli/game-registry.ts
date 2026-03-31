import type { Game } from '../core/game.js'
import type { Discussion } from '../core/discussion.js'
import { BroadcastDiscussion } from '../core/discussion.js'
import { Avalon } from '../games/avalon/avalon.js'

function buildDiscussion(raw: Record<string, unknown>): Discussion {
  if (raw.type === 'broadcast') {
    return new BroadcastDiscussion(
      raw.maxRounds as number | undefined,
      raw.prompt as string | undefined,
    )
  }
  throw new Error(`Unknown discussion type: ${raw.type}`)
}

export function createGame(name: string, gameOptions?: Record<string, unknown>): Game {
  if (name.endsWith('.md')) {
    throw new Error('AIGame (.md rules) not yet supported in CLI')
  }

  if (name === 'avalon') {
    const seed = gameOptions?.seed as number | undefined
    const discussion = gameOptions?.discussion
      ? buildDiscussion(gameOptions.discussion as Record<string, unknown>)
      : undefined
    return new Avalon({ seed, discussion })
  }

  throw new Error(`Unknown game: ${name}`)
}
