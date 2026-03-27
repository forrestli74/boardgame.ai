import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { Player } from '../../core/player.js'
import type { ActionRequest } from '../../core/types.js'
import { Recorder } from '../../core/recorder.js'
import { AIGame } from './ai-game.js'
import { Engine } from '../../core/engine.js'
import { useHttpRecording } from '../../test-utils/http-recording.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(__dirname, '../../../rules/avalon.md')
const LOG_FILE = '/tmp/boardgame-avalon-integration.jsonl'
const SKIP = !process.env.GEMINI_API_KEY

/** Always approves, succeeds quests, proposes first N players, assassinates last player. */
class FixedAvalonPlayer implements Player {
  constructor(readonly id: string, readonly name: string) {}

  async act(request: ActionRequest): Promise<unknown> {
    const view = request.view as Record<string, unknown>

    // Team proposal: pick first N players
    if (view.leader === this.id && !view.proposedTeam) {
      const players = (view.players ?? []) as string[]
      const teamSize = this.inferTeamSize(view)
      return { team: players.slice(0, teamSize) }
    }

    // Assassination: pick last player
    if ((view.yourRole === 'Assassin' && view.playerList) || view.phase === 'assassination') {
      const players = (view.playerList ?? view.players ?? []) as string[]
      return { target: players[players.length - 1] }
    }

    // Quest: always succeed
    if (view.proposedTeam || view.phase === 'quest_execution') {
      return { questVote: 'success' }
    }

    // Default: approve votes
    return { vote: 'approve' }
  }

  private inferTeamSize(view: Record<string, unknown>): number {
    const quest = ((view.currentQuest as number) || 1) - 1
    for (const key of ['quests', 'questConfiguration'] as const) {
      const cfg = view[key] as Array<Record<string, unknown>> | undefined
      if (cfg?.[quest]?.teamSize) return cfg[quest].teamSize as number
    }
    return (view.teamSize as number) ?? 2
  }
}

afterEach(() => { if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE) })

describe.skipIf(SKIP)('integration: AI Game - Avalon', () => {
  it('plays a 5-player game to completion', async () => {
    await useHttpRecording()
    const playerIds = ['alice', 'bob', 'charlie', 'diana', 'eve']
    const players = new Map(
      playerIds.map(id => [id, new FixedAvalonPlayer(id, id)] as [string, Player]),
    )

    const outcome = await new Engine(new Recorder('avalon-1', LOG_FILE)).run(
      new AIGame(readFileSync(RULES_PATH, 'utf-8')),
      players,
      { gameId: 'avalon-1', seed: 42, players: playerIds.map(id => ({ id, name: id })) },
    )

    expect(outcome).not.toBeNull()
    const scores = Object.values(outcome!.scores)
    expect(scores).toHaveLength(5)
    scores.forEach(s => expect([0, 1]).toContain(s))

    // Either 3 winners (good) or 2 winners (evil)
    const winners = scores.filter(s => s === 1).length
    expect([2, 3]).toContain(winners)

    // JSONL log captured events
    const lines = readFileSync(LOG_FILE, 'utf-8').trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(5)
    lines.forEach(line => expect(JSON.parse(line).gameId).toBe('avalon-1'))
  }, 600_000)
})
