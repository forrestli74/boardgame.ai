import type { Game, GameFlow, PlayerAction } from '../../core/game.js'
import type { GameOutcome, ActionRequest } from '../../core/types.js'
import type { GameYieldedEvent } from '../../core/events.js'
import type { Discussion } from '../../core/discussion.js'
import {
  type AvalonPlayer, type AvalonState,
  TeamProposalSchema, TeamVoteSchema, QuestVoteSchema, AssassinationTargetSchema,
  QUEST_CONFIGS, assignRoles, buildView,
} from './types.js'

function event(data: unknown): GameYieldedEvent {
  return { source: 'game', data, timestamp: new Date().toISOString() }
}

export class Avalon implements Game {
  private seed: number
  private discussion?: Discussion

  constructor(options?: { seed?: number; discussion?: Discussion }) {
    this.seed = options?.seed ?? 0
    this.discussion = options?.discussion
  }

  play(playerIds: string[]): GameFlow {
    const self = this
    return (async function* () {
      const playerCount = playerIds.length
      const players = assignRoles(playerIds, self.seed)
      const questConfigs = QUEST_CONFIGS[playerCount]

      const state: AvalonState = {
        players,
        phase: 'team-proposal',
        questNumber: 0,
        questResults: [null, null, null, null, null],
        leaderIndex: self.seed % playerCount,
        proposalRejections: 0,
        proposedTeam: undefined,
      }

      // Events to carry forward and emit with the next yield that has requests
      let pendingEvents: GameYieldedEvent[] = [
        event({ type: 'game-start', players: playerIds, questConfigs }),
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
            const result = yield* (self.discussion as any).run(
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

          let proposalParsed = TeamProposalSchema.safeParse(proposalAction.action)
          if (!proposalParsed.success) {
            pendingEvents.push(event({ type: 'validation-failed', playerId: leader.id, raw: proposalAction.action }))
            proposalParsed = { success: true, data: { team: playerIds.slice(0, questConfigs[state.questNumber].teamSize) } } as any
          }
          state.proposedTeam = proposalParsed.data!.team

          const proposalEvent = event({
            type: 'team-proposed', leader: leader.id, team: state.proposedTeam, questNumber: state.questNumber,
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
          let firstVoteParsed = TeamVoteSchema.safeParse(firstVote.action)
          if (!firstVoteParsed.success) {
            pendingEvents.push(event({ type: 'validation-failed', playerId: firstVote.playerId, raw: firstVote.action }))
            firstVoteParsed = { success: true, data: { approve: false } } as any
          }
          votes[firstVote.playerId] = firstVoteParsed.data!.approve

          while (Object.keys(votes).length < playerCount) {
            const nextVote: PlayerAction = yield { requests: [], events: [] }
            let nextVoteParsed = TeamVoteSchema.safeParse(nextVote.action)
            if (!nextVoteParsed.success) {
              pendingEvents.push(event({ type: 'validation-failed', playerId: nextVote.playerId, raw: nextVote.action }))
              nextVoteParsed = { success: true, data: { approve: false } } as any
            }
            votes[nextVote.playerId] = nextVoteParsed.data!.approve
          }

          const approvals = Object.values(votes).filter(v => v === true).length
          const approved = approvals > playerCount / 2

          const voteRecord: Record<string, 'approve' | 'reject'> = {}
          for (const [pid, v] of Object.entries(votes)) {
            voteRecord[pid] = v ? 'approve' : 'reject'
          }

          const voteResultEvent = event({
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
              const gameEndEvent = event({ type: 'game-end', reason: 'hammer', winner: 'evil' })
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
        let firstQuestParsed = QuestVoteSchema.safeParse(firstQuest.action)
        if (!firstQuestParsed.success) {
          pendingEvents.push(event({ type: 'validation-failed', playerId: firstQuest.playerId, raw: firstQuest.action }))
          firstQuestParsed = { success: true, data: { success: true } } as any
        }
        questVotes[firstQuest.playerId] = firstQuestParsed.data!.success

        while (Object.keys(questVotes).length < team.length) {
          const nextQuest: PlayerAction = yield { requests: [], events: [] }
          let nextQuestParsed = QuestVoteSchema.safeParse(nextQuest.action)
          if (!nextQuestParsed.success) {
            pendingEvents.push(event({ type: 'validation-failed', playerId: nextQuest.playerId, raw: nextQuest.action }))
            nextQuestParsed = { success: true, data: { success: true } } as any
          }
          questVotes[nextQuest.playerId] = nextQuestParsed.data!.success
        }

        const failCount = Object.values(questVotes).filter(v => v === false).length
        const questFailed = failCount >= questConfigs[state.questNumber].failsRequired
        state.questResults[state.questNumber] = questFailed ? 'fail' : 'success'

        if (questFailed) fails++
        else successes++

        const questResultEvent = event({
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
        const gameEndEvent = event({ type: 'game-end', reason: 'three-fails', winner: 'evil' })
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

      let targetParsed = AssassinationTargetSchema.safeParse(assassinAction.action)
      if (!targetParsed.success) {
        pendingEvents.push(event({ type: 'validation-failed', playerId: assassin.id, raw: assassinAction.action }))
        targetParsed = { success: true, data: { targetId: playerIds[0] } } as any
      }
      const targetId = targetParsed.data!.targetId
      const merlin = players.find(p => p.role === 'merlin')!
      const assassinationSuccess = targetId === merlin.id
      const winner = assassinationSuccess ? 'evil' : 'good'

      const finalEvents = [
        event({ type: 'assassination-attempt', assassin: assassin.id, target: targetId, result: assassinationSuccess ? 'success' : 'fail' }),
        event({ type: 'game-end', reason: assassinationSuccess ? 'assassination' : 'three-successes', winner }),
      ]

      return self.makeScores(players, winner, finalEvents)
    })()
  }

  private makeScores(players: AvalonPlayer[], winner: 'good' | 'evil', finalEvents: GameYieldedEvent[] = []): GameOutcome {
    const scores: Record<string, number> = {}
    for (const p of players) {
      scores[p.id] = p.team === winner ? 1 : 0
    }
    return { scores, metadata: { finalEvents } }
  }
}
