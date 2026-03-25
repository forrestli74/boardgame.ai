import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { Player } from '../core/player.js'
import type { ActionRequest, GameConfig } from '../core/types.js'
import { Recorder } from '../core/recorder.js'
import { AIGameMaster } from './game-master.js'
import { Engine } from '../core/engine.js'
import { LLMClient } from './llm-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const RULES_PATH = join(__dirname, '../../rules/avalon.md')
const LOG_FILE = '/tmp/boardgame-ai-avalon-integration-test.jsonl'

const SKIP = !process.env.ANTHROPIC_API_KEY

/**
 * Avalon player that reads its view and responds sensibly.
 * - team_proposal: proposes the first N players from the player list
 * - team_vote: always approves
 * - quest_execution: always votes "success"
 * - assassination: picks a non-self player (may or may not be Merlin)
 */
class FixedAvalonPlayer implements Player {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  async act(request: ActionRequest): Promise<unknown> {
    const view = request.view as Record<string, unknown>
    const phase = view.phase as string | undefined

    // Determine phase from view or infer from action schema shape
    if (phase === 'team_proposal' || this.isTeamProposal(view)) {
      return this.proposeTeam(view)
    }

    if (phase === 'team_vote' || this.isTeamVote(view)) {
      return { vote: 'approve' }
    }

    if (phase === 'quest_execution' || this.isQuestExecution(view)) {
      return { questVote: 'success' }
    }

    if (phase === 'assassination' || this.isAssassination(view)) {
      return this.assassinate(view)
    }

    // Fallback: try to infer from context
    // If view mentions proposedTeam and we're on it, likely quest
    if (view.proposedTeam) {
      return { questVote: 'success' }
    }

    // Default: approve (safe for voting)
    return { vote: 'approve' }
  }

  private proposeTeam(view: Record<string, unknown>): unknown {
    const players = (view.players as string[]) || []
    const quests = view.quests as Array<Record<string, unknown>> | undefined
    const currentQuest = (view.currentQuest as number) || 1

    // Figure out team size from quest config or default to 2
    let teamSize = 2
    if (quests && quests[currentQuest - 1]) {
      teamSize = (quests[currentQuest - 1].teamSize as number) || 2
    } else if (view.teamSize) {
      teamSize = view.teamSize as number
    } else if (view.questConfiguration) {
      const qc = view.questConfiguration as Array<Record<string, unknown>>
      if (qc[currentQuest - 1]) {
        teamSize = (qc[currentQuest - 1].teamSize as number) || 2
      }
    }

    // Propose the first N players
    const team = players.slice(0, teamSize)
    return { team }
  }

  private assassinate(view: Record<string, unknown>): unknown {
    const players = (view.players || view.playerList) as string[] | undefined
    if (players && players.length > 0) {
      // Pick the last player (arbitrary — may or may not be Merlin)
      return { target: players[players.length - 1] }
    }
    // Fallback
    return { target: 'unknown' }
  }

  private isTeamProposal(view: Record<string, unknown>): boolean {
    return view.leader === this.id && !view.proposedTeam
  }

  private isTeamVote(view: Record<string, unknown>): boolean {
    return !!view.proposedTeam && !view.questVote
  }

  private isQuestExecution(view: Record<string, unknown>): boolean {
    return !!view.proposedTeam && view.yourTeam !== undefined
  }

  private isAssassination(view: Record<string, unknown>): boolean {
    return view.yourRole === 'Assassin' && !!view.playerList
  }
}

afterEach(() => {
  if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE)
})

describe.skipIf(SKIP)('integration: AI Game Master - Avalon', () => {
  it('plays a 5-player Avalon game to completion', async () => {
    const rulesDoc = readFileSync(RULES_PATH, 'utf-8')
    const llmClient = new LLMClient()
    const game = new AIGameMaster(rulesDoc, llmClient)
    const recorder = new Recorder('avalon-integration-1', LOG_FILE)

    const playerIds = ['alice', 'bob', 'charlie', 'diana', 'eve']
    const players = new Map<string, Player>(
      playerIds.map(id => [id, new FixedAvalonPlayer(id, id.charAt(0).toUpperCase() + id.slice(1))])
    )

    const config: GameConfig = {
      gameId: 'avalon-integration-1',
      seed: 42,
      players: playerIds.map(id => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
      })),
    }

    const engine = new Engine(recorder)
    const outcome = await engine.run(game, players, config)
    recorder.flush()

    // Game must reach a terminal state with an outcome
    expect(outcome).not.toBeNull()
    expect(outcome!.scores).toBeDefined()

    // All 5 players should have scores
    for (const id of playerIds) {
      expect(outcome!.scores).toHaveProperty(id)
    }

    // Scores should be 0 or 1 (Avalon is win/lose per team)
    for (const id of playerIds) {
      expect([0, 1]).toContain(outcome!.scores[id])
    }

    // Total score should reflect team-based scoring
    // Good team (3 players) all get same score, Evil team (2 players) all get same score
    const scores = Object.values(outcome!.scores)
    const winners = scores.filter(s => s === 1).length
    const losers = scores.filter(s => s === 0).length
    expect(winners + losers).toBe(5)
    // Either 3 winners + 2 losers (Good wins) or 2 winners + 3 losers (Evil wins)
    expect([2, 3]).toContain(winners)

    // The game master should have marked the game as terminal
    expect(game.isTerminal()).toBe(true)

    // JSONL log file should have recorded events
    expect(existsSync(LOG_FILE)).toBe(true)
    const lines = readFileSync(LOG_FILE, 'utf-8').trim().split('\n')
    // Avalon should have many events: game_start, proposals, votes, quests, game_end
    expect(lines.length).toBeGreaterThanOrEqual(5)

    // Each log line should be valid JSON containing the gameId
    for (const line of lines) {
      const entry = JSON.parse(line)
      expect(entry.gameId).toBe('avalon-integration-1')
    }
  }, 600_000) // 10 min timeout - Avalon has many LLM calls
})
