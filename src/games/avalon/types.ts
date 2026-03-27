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

export const AvalonOptionsSchema = z.object({
  useLady: z.boolean().optional(),
})

// --- Action Types ---

export type TeamProposal = z.infer<typeof TeamProposalSchema>
export type TeamVote = z.infer<typeof TeamVoteSchema>
export type QuestVote = z.infer<typeof QuestVoteSchema>
export type AssassinationTarget = z.infer<typeof AssassinationTargetSchema>
