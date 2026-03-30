import { z } from 'zod'

// --- Core Types ---

export type Team = 'good' | 'evil'

export type Role =
  | 'merlin'
  | 'percival'
  | 'loyal-servant'
  | 'morgana'
  | 'mordred'
  | 'oberon'
  | 'assassin'

export type Phase =
  | 'team-proposal'
  | 'team-vote'
  | 'quest-vote'
  | 'assassination'
  | 'game-over'

export interface AvalonPlayer {
  id: string
  role: Role
  team: Team
}

export interface PlayerView {
  yourId: string
  yourRole: Role
  yourTeam: Team
  knownPlayers: { id: string; appearance: string }[]
  phase: Phase
  questNumber: number
  questResults: ('success' | 'fail' | null)[]
  leader: string
  proposalRejections: number
  proposedTeam?: string[]
  players: string[]
}

export interface QuestConfig {
  teamSize: number
  failsRequired: number
}

// --- Lookup Tables ---

export const ROLE_TEAM: Record<Role, Team> = {
  merlin: 'good',
  percival: 'good',
  'loyal-servant': 'good',
  morgana: 'evil',
  mordred: 'evil',
  oberon: 'evil',
  assassin: 'evil',
}

export const TEAM_COUNTS: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
}

function q(teamSize: number, failsRequired = 1): QuestConfig {
  return { teamSize, failsRequired }
}

export const QUEST_CONFIGS: Record<number, QuestConfig[]> = {
  5: [q(2), q(3), q(2), q(3), q(3)],
  6: [q(2), q(3), q(4), q(3), q(4)],
  7: [q(2), q(3), q(3), q(4, 2), q(4)],
  8: [q(3), q(4), q(4), q(5, 2), q(5)],
  9: [q(3), q(4), q(4), q(5, 2), q(5)],
  10: [q(3), q(4), q(4), q(5, 2), q(5)],
}

export const EXPERIENCED_ROLES: Record<number, Role[]> = {
  5: ['merlin', 'percival', 'loyal-servant', 'morgana', 'assassin'],
  6: ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'morgana', 'assassin'],
  7: ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'assassin'],
  8: ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'assassin'],
  9: ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'assassin'],
  10: ['merlin', 'percival', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'loyal-servant', 'mordred', 'morgana', 'oberon', 'assassin'],
}

// --- Zod Schemas ---

export const TeamProposalSchema = z.object({
  team: z.array(z.string()),
})

export const TeamVoteSchema = z.object({
  approve: z.boolean(),
})

export const QuestVoteSchema = z.object({
  success: z.boolean(),
})

export const AssassinationTargetSchema = z.object({
  targetId: z.string(),
})

// --- Game State ---

export interface AvalonState {
  players: AvalonPlayer[]
  phase: Phase
  questNumber: number
  questResults: ('success' | 'fail' | null)[]
  leaderIndex: number
  proposalRejections: number
  proposedTeam?: string[]
}

// --- View Building ---

export function getKnownPlayers(
  player: AvalonPlayer,
  players: AvalonPlayer[],
): { id: string; appearance: string }[] {
  const others = players.filter(p => p.id !== player.id)

  switch (player.role) {
    case 'merlin':
      // Sees evil except mordred
      return others
        .filter(p => p.team === 'evil' && p.role !== 'mordred')
        .map(p => ({ id: p.id, appearance: 'evil' }))

    case 'percival':
      // Sees merlin and morgana (can't distinguish)
      return others
        .filter(p => p.role === 'merlin' || p.role === 'morgana')
        .map(p => ({ id: p.id, appearance: 'merlin-or-morgana' }))

    case 'oberon':
      // Sees nothing
      return []

    case 'loyal-servant':
      return []

    default:
      // Evil roles (mordred, morgana, assassin): see other evil except oberon
      if (player.team === 'evil') {
        return others
          .filter(p => p.team === 'evil' && p.role !== 'oberon')
          .map(p => ({ id: p.id, appearance: 'evil' }))
      }
      return []
  }
}

export function buildView(player: AvalonPlayer, state: AvalonState): PlayerView {
  return {
    yourId: player.id,
    yourRole: player.role,
    yourTeam: player.team,
    knownPlayers: getKnownPlayers(player, state.players),
    phase: state.phase,
    questNumber: state.questNumber,
    questResults: [...state.questResults],
    leader: state.players[state.leaderIndex].id,
    proposalRejections: state.proposalRejections,
    proposedTeam: state.proposedTeam ? [...state.proposedTeam] : undefined,
    players: state.players.map(p => p.id),
  }
}

// --- Seeded PRNG and Role Assignment ---

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function assignRoles(playerIds: string[], seed: number): AvalonPlayer[] {
  const rand = mulberry32(seed)
  const roles = EXPERIENCED_ROLES[playerIds.length]
  if (!roles) throw new Error(`Unsupported player count: ${playerIds.length}`)
  const shuffledRoles = shuffle(roles, rand)
  return playerIds.map((id, i) => ({
    id,
    role: shuffledRoles[i],
    team: ROLE_TEAM[shuffledRoles[i]],
  }))
}

// --- Action Types ---

export type TeamProposal = z.infer<typeof TeamProposalSchema>
export type TeamVote = z.infer<typeof TeamVoteSchema>
export type QuestVote = z.infer<typeof QuestVoteSchema>
export type AssassinationTarget = z.infer<typeof AssassinationTargetSchema>

// --- Event Data ---

export type AvalonEventData =
  | { type: 'game-start'; players: string[]; questConfigs: QuestConfig[] }
  | { type: 'team-proposed'; leader: string; team: string[]; questNumber: number }
  | { type: 'vote-result'; votes: Record<string, 'approve' | 'reject'>; result: 'approved' | 'rejected' }
  | { type: 'quest-result'; questNumber: number; result: 'success' | 'fail'; failVotes: number }
  | { type: 'assassination-attempt'; assassin: string; target: string; result: 'success' | 'fail' }
  | { type: 'game-end'; reason: 'three-successes' | 'three-fails' | 'assassination' | 'hammer'; winner: 'good' | 'evil' }
  | { type: 'validation-failed'; playerId: string; raw: unknown }
