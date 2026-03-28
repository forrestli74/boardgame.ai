import type { Game, GameFlow, PlayerAction } from '../../core/game.js'
import type { GameConfig, GameOutcome, ActionRequest } from '../../core/types.js'
import type { GameEvent } from '../../core/events.js'
import type { Discussion } from '../../core/discussion.js'
import {
  type AvalonPlayer, type AvalonState,
  AvalonOptionsSchema, TeamProposalSchema, TeamVoteSchema, QuestVoteSchema, AssassinationTargetSchema,
  QUEST_CONFIGS, assignRoles, buildView,
} from './types.js'

function event(gameId: string, data: unknown): GameEvent {
  return { source: 'game', gameId, data, timestamp: new Date().toISOString() }
}

export class Avalon implements Game {
  readonly optionsSchema = AvalonOptionsSchema

  constructor(private discussion?: Discussion) {}

  play(config: GameConfig): GameFlow {
    const self = this
    return (async function* () {
      const gameId = config.gameId
      const playerIds = config.players.map(p => p.id)
      const playerCount = playerIds.length
      const players = assignRoles(playerIds, config.seed)
      const questConfigs = QUEST_CONFIGS[playerCount]

      const state: AvalonState = {
        players,
        phase: 'team-proposal',
        questNumber: 0,
        questResults: [null, null, null, null, null],
        leaderIndex: config.seed % playerCount,
        proposalRejections: 0,
        proposedTeam: undefined,
      }

      // Events to carry forward and emit with the next yield that has requests
      let pendingEvents: GameEvent[] = [
        event(gameId, { type: 'game-start', players: playerIds, questConfigs }),
      ]

      let successes = 0
      let fails = 0

      while (successes < 3 && fails < 3) {
        // --- Team Proposal + Vote loop ---
        let teamApproved = false
        while (!teamApproved) {
          state.phase = 'team-proposal'
          state.proposedTeam = undefined
          const leader = players[state.leaderIndex]

          // --- Discussion phase (if configured) ---
          if (self.discussion) {
            const contexts = Object.fromEntries(
              players.map(p => [p.id, buildView(p, state)])
            )
            const result = yield* self.discussion.run(
              gameId,
              playerIds,
              contexts,
              { firstSpeakers: [leader.id] },
            )
            // Carry discussion's pending events forward
            pendingEvents.push(...result.pendingEvents)
          }

          // Yield team-proposal request, carrying forward any pending events
          const proposalAction: PlayerAction = yield {
            requests: [{ playerId: leader.id, view: buildView(leader, state), actionSchema: TeamProposalSchema }],
            events: pendingEvents,
          }
          pendingEvents = []

          const proposal = proposalAction.action as { team: string[] }
          state.proposedTeam = proposal.team

          const proposalEvent = event(gameId, {
            type: 'team-proposed', leader: leader.id, team: proposal.team, questNumber: state.questNumber,
          })

          // --- Team Vote (parallel) ---
          state.phase = 'team-vote'
          const voteRequests: ActionRequest[] = players.map(p => ({
            playerId: p.id, view: buildView(p, state), actionSchema: TeamVoteSchema,
          }))

          const votes: Record<string, boolean> = {}
          const firstVote: PlayerAction = yield {
            requests: voteRequests,
            events: [proposalEvent],
          }
          votes[firstVote.playerId] = (firstVote.action as { approve: boolean }).approve

          while (Object.keys(votes).length < playerCount) {
            const nextVote: PlayerAction = yield { requests: [], events: [] }
            votes[nextVote.playerId] = (nextVote.action as { approve: boolean }).approve
          }

          const approvals = Object.values(votes).filter(v => v === true).length
          const approved = approvals > playerCount / 2

          const voteRecord: Record<string, 'approve' | 'reject'> = {}
          for (const [pid, v] of Object.entries(votes)) {
            voteRecord[pid] = v ? 'approve' : 'reject'
          }

          const voteResultEvent = event(gameId, {
            type: 'vote-result', votes: voteRecord, result: approved ? 'approved' : 'rejected',
          })

          if (approved) {
            teamApproved = true
            state.proposalRejections = 0
            // Carry vote-result event to next yield (quest votes)
            pendingEvents = [voteResultEvent]
          } else {
            state.proposalRejections++
            if (state.proposalRejections >= 5) {
              // Hammer: game over — return with terminal events as metadata
              const gameEndEvent = event(gameId, { type: 'game-end', reason: 'hammer', winner: 'evil' })
              return self.makeScores(players, 'evil', [voteResultEvent, gameEndEvent])
            }
            state.leaderIndex = (state.leaderIndex + 1) % playerCount
            // Carry vote-result event to next proposal yield
            pendingEvents = [voteResultEvent]
          }
        }

        // --- Quest Execution (parallel, team members only) ---
        state.phase = 'quest'
        const team = players.filter(p => state.proposedTeam!.includes(p.id))
        const questRequests: ActionRequest[] = team.map(p => ({
          playerId: p.id, view: buildView(p, state), actionSchema: QuestVoteSchema,
        }))

        const questVotes: Record<string, boolean> = {}
        const firstQuest: PlayerAction = yield {
          requests: questRequests,
          events: pendingEvents,
        }
        pendingEvents = []
        questVotes[firstQuest.playerId] = (firstQuest.action as { success: boolean }).success

        while (Object.keys(questVotes).length < team.length) {
          const nextQuest: PlayerAction = yield { requests: [], events: [] }
          questVotes[nextQuest.playerId] = (nextQuest.action as { success: boolean }).success
        }

        const failCount = Object.values(questVotes).filter(v => v === false).length
        const questFailed = failCount >= questConfigs[state.questNumber].failsRequired
        state.questResults[state.questNumber] = questFailed ? 'fail' : 'success'

        if (questFailed) fails++
        else successes++

        const questResultEvent = event(gameId, {
          type: 'quest-result', questNumber: state.questNumber,
          result: questFailed ? 'fail' : 'success', failVotes: failCount,
        })

        state.questNumber++
        state.leaderIndex = (state.leaderIndex + 1) % playerCount
        state.proposalRejections = 0
        state.proposedTeam = undefined

        // Carry quest-result to next proposal (or terminal return below)
        pendingEvents = [questResultEvent]
      }

      // --- Game End: 3 quest failures ---
      if (fails >= 3) {
        const gameEndEvent = event(gameId, { type: 'game-end', reason: 'three-fails', winner: 'evil' })
        return self.makeScores(players, 'evil', [...pendingEvents, gameEndEvent])
      }

      // --- Assassination Phase ---
      state.phase = 'assassination'
      const assassin = players.find(p => p.role === 'assassin')!
      const assassinAction: PlayerAction = yield {
        requests: [{ playerId: assassin.id, view: buildView(assassin, state), actionSchema: AssassinationTargetSchema }],
        events: pendingEvents,
      }
      pendingEvents = []

      const targetId = (assassinAction.action as { targetId: string }).targetId
      const merlin = players.find(p => p.role === 'merlin')!
      const assassinationSuccess = targetId === merlin.id
      const winner = assassinationSuccess ? 'evil' : 'good'

      const finalEvents = [
        event(gameId, { type: 'assassination-attempt', assassin: assassin.id, target: targetId, result: assassinationSuccess ? 'success' : 'fail' }),
        event(gameId, { type: 'game-end', reason: assassinationSuccess ? 'assassination' : 'three-successes', winner }),
      ]

      return self.makeScores(players, winner, finalEvents)
    })()
  }

  private makeScores(players: AvalonPlayer[], winner: 'good' | 'evil', finalEvents: GameEvent[] = []): GameOutcome {
    const scores: Record<string, number> = {}
    for (const p of players) {
      scores[p.id] = p.team === winner ? 1 : 0
    }
    return { scores, metadata: { finalEvents } }
  }
}
