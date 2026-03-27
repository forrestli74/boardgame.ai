import { describe, it, expect } from 'vitest'
import {
  TEAM_COUNTS,
  QUEST_CONFIGS,
  EXPERIENCED_ROLES,
  ROLE_TEAM,
  TeamProposalSchema,
  TeamVoteSchema,
  QuestVoteSchema,
  AssassinationTargetSchema,
  AvalonOptionsSchema,
  assignRoles,
  buildView,
  type AvalonPlayer,
  type AvalonState,
} from './types.js'

describe('TEAM_COUNTS', () => {
  it('maps 5 players to 3 good, 2 evil', () => {
    expect(TEAM_COUNTS[5]).toEqual({ good: 3, evil: 2 })
  })
  it('maps 6 players to 4 good, 2 evil', () => {
    expect(TEAM_COUNTS[6]).toEqual({ good: 4, evil: 2 })
  })
  it('maps 7 players to 4 good, 3 evil', () => {
    expect(TEAM_COUNTS[7]).toEqual({ good: 4, evil: 3 })
  })
  it('maps 8 players to 5 good, 3 evil', () => {
    expect(TEAM_COUNTS[8]).toEqual({ good: 5, evil: 3 })
  })
  it('maps 9 players to 6 good, 3 evil', () => {
    expect(TEAM_COUNTS[9]).toEqual({ good: 6, evil: 3 })
  })
  it('maps 10 players to 6 good, 4 evil', () => {
    expect(TEAM_COUNTS[10]).toEqual({ good: 6, evil: 4 })
  })
})

describe('QUEST_CONFIGS', () => {
  it('has 5 quests for each player count', () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      expect(QUEST_CONFIGS[count]).toHaveLength(5)
    }
  })

  it('5 players: correct team sizes', () => {
    const configs = QUEST_CONFIGS[5]
    expect(configs.map(c => c.teamSize)).toEqual([2, 3, 2, 3, 3])
  })

  it('6 players: correct team sizes', () => {
    const configs = QUEST_CONFIGS[6]
    expect(configs.map(c => c.teamSize)).toEqual([2, 3, 4, 3, 4])
  })

  it('7 players: correct team sizes', () => {
    const configs = QUEST_CONFIGS[7]
    expect(configs.map(c => c.teamSize)).toEqual([2, 3, 3, 4, 4])
  })

  it('8 players: correct team sizes', () => {
    const configs = QUEST_CONFIGS[8]
    expect(configs.map(c => c.teamSize)).toEqual([3, 4, 4, 5, 5])
  })

  it('9 players: correct team sizes', () => {
    const configs = QUEST_CONFIGS[9]
    expect(configs.map(c => c.teamSize)).toEqual([3, 4, 4, 5, 5])
  })

  it('10 players: correct team sizes', () => {
    const configs = QUEST_CONFIGS[10]
    expect(configs.map(c => c.teamSize)).toEqual([3, 4, 4, 5, 5])
  })

  it('4th quest requires 1 fail for 5 and 6 players', () => {
    expect(QUEST_CONFIGS[5][3].failsRequired).toBe(1)
    expect(QUEST_CONFIGS[6][3].failsRequired).toBe(1)
  })

  it('4th quest requires 2 fails for 7+ players', () => {
    for (const count of [7, 8, 9, 10]) {
      expect(QUEST_CONFIGS[count][3].failsRequired).toBe(2)
    }
  })

  it('all non-4th quests require 1 fail', () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      for (let i = 0; i < 5; i++) {
        if (i === 3 && count >= 7) continue
        expect(QUEST_CONFIGS[count][i].failsRequired).toBe(1)
      }
    }
  })
})

describe('EXPERIENCED_ROLES', () => {
  it('5 players: merlin, percival, loyal-servant, morgana, assassin', () => {
    const roles = EXPERIENCED_ROLES[5]
    expect(roles).toHaveLength(5)
    expect(roles.filter(r => r === 'merlin')).toHaveLength(1)
    expect(roles.filter(r => r === 'percival')).toHaveLength(1)
    expect(roles.filter(r => r === 'loyal-servant')).toHaveLength(1)
    expect(roles.filter(r => r === 'morgana')).toHaveLength(1)
    expect(roles.filter(r => r === 'assassin')).toHaveLength(1)
    expect(roles.filter(r => r === 'mordred')).toHaveLength(0)
    expect(roles.filter(r => r === 'oberon')).toHaveLength(0)
  })

  it('6 players: adds another loyal-servant', () => {
    const roles = EXPERIENCED_ROLES[6]
    expect(roles).toHaveLength(6)
    expect(roles.filter(r => r === 'loyal-servant')).toHaveLength(2)
    expect(roles.filter(r => r === 'mordred')).toHaveLength(0)
  })

  it('7 players: adds mordred', () => {
    const roles = EXPERIENCED_ROLES[7]
    expect(roles).toHaveLength(7)
    expect(roles.filter(r => r === 'mordred')).toHaveLength(1)
    expect(roles.filter(r => r === 'loyal-servant')).toHaveLength(2)
    expect(roles.filter(r => r === 'oberon')).toHaveLength(0)
  })

  it('8 players: 3 loyal-servants', () => {
    const roles = EXPERIENCED_ROLES[8]
    expect(roles).toHaveLength(8)
    expect(roles.filter(r => r === 'loyal-servant')).toHaveLength(3)
  })

  it('9 players: 4 loyal-servants', () => {
    const roles = EXPERIENCED_ROLES[9]
    expect(roles).toHaveLength(9)
    expect(roles.filter(r => r === 'loyal-servant')).toHaveLength(4)
  })

  it('10 players: adds oberon', () => {
    const roles = EXPERIENCED_ROLES[10]
    expect(roles).toHaveLength(10)
    expect(roles.filter(r => r === 'oberon')).toHaveLength(1)
    expect(roles.filter(r => r === 'loyal-servant')).toHaveLength(4)
  })
})

describe('TeamProposalSchema', () => {
  it('validates valid proposal', () => {
    const result = TeamProposalSchema.safeParse({ team: ['p1', 'p2'] })
    expect(result.success).toBe(true)
  })

  it('rejects missing team field', () => {
    const result = TeamProposalSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects non-array team', () => {
    const result = TeamProposalSchema.safeParse({ team: 'p1' })
    expect(result.success).toBe(false)
  })
})

describe('TeamVoteSchema', () => {
  it('validates approve', () => {
    const result = TeamVoteSchema.safeParse({ approve: true })
    expect(result.success).toBe(true)
  })

  it('validates reject', () => {
    const result = TeamVoteSchema.safeParse({ approve: false })
    expect(result.success).toBe(true)
  })

  it('rejects missing approve field', () => {
    const result = TeamVoteSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('QuestVoteSchema', () => {
  it('validates success vote', () => {
    const result = QuestVoteSchema.safeParse({ success: true })
    expect(result.success).toBe(true)
  })

  it('validates fail vote', () => {
    const result = QuestVoteSchema.safeParse({ success: false })
    expect(result.success).toBe(true)
  })

  it('rejects missing success field', () => {
    const result = QuestVoteSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('AssassinationTargetSchema', () => {
  it('validates valid target', () => {
    const result = AssassinationTargetSchema.safeParse({ targetId: 'player1' })
    expect(result.success).toBe(true)
  })

  it('rejects missing targetId', () => {
    const result = AssassinationTargetSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects non-string targetId', () => {
    const result = AssassinationTargetSchema.safeParse({ targetId: 123 })
    expect(result.success).toBe(false)
  })
})

describe('AvalonOptionsSchema', () => {
  it('validates empty options', () => {
    const result = AvalonOptionsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('validates with useLady flag', () => {
    const result = AvalonOptionsSchema.safeParse({ useLady: true })
    expect(result.success).toBe(true)
  })

  it('rejects invalid useLady type', () => {
    const result = AvalonOptionsSchema.safeParse({ useLady: 'yes' })
    expect(result.success).toBe(false)
  })
})

describe('assignRoles', () => {
  it('returns correct count for 5 players', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5']
    const players = assignRoles(ids, 42)
    expect(players).toHaveLength(5)
  })

  it('each player has an id, role, and team', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5']
    const players = assignRoles(ids, 42)
    for (const p of players) {
      expect(p.id).toBeTruthy()
      expect(p.role).toBeTruthy()
      expect(['good', 'evil']).toContain(p.team)
    }
  })

  it('7 players include mordred', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
    const players = assignRoles(ids, 42)
    expect(players.some(p => p.role === 'mordred')).toBe(true)
  })

  it('10 players include oberon', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']
    const players = assignRoles(ids, 42)
    expect(players.some(p => p.role === 'oberon')).toBe(true)
  })

  it('is deterministic: same seed produces same result', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5']
    const a = assignRoles(ids, 99)
    const b = assignRoles(ids, 99)
    expect(a).toEqual(b)
  })

  it('different seeds produce different results', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5']
    const a = assignRoles(ids, 1)
    const b = assignRoles(ids, 2)
    // Very unlikely to be identical with different seeds
    expect(a.map(p => p.role)).not.toEqual(b.map(p => p.role))
  })

  it('every player team matches ROLE_TEAM', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
    const players = assignRoles(ids, 42)
    for (const p of players) {
      expect(p.team).toBe(ROLE_TEAM[p.role])
    }
  })

  it('throws for unsupported player count', () => {
    expect(() => assignRoles(['p1', 'p2', 'p3'], 42)).toThrow('Unsupported player count: 3')
  })
})

describe('buildView', () => {
  // 7-player game: merlin, percival, 2x loyal-servant, mordred, morgana, assassin
  const players: AvalonPlayer[] = [
    { id: 'merlin', role: 'merlin', team: 'good' },
    { id: 'percival', role: 'percival', team: 'good' },
    { id: 'servant1', role: 'loyal-servant', team: 'good' },
    { id: 'servant2', role: 'loyal-servant', team: 'good' },
    { id: 'mordred', role: 'mordred', team: 'evil' },
    { id: 'morgana', role: 'morgana', team: 'evil' },
    { id: 'assassin', role: 'assassin', team: 'evil' },
  ]

  const state: AvalonState = {
    players,
    phase: 'team-proposal',
    questNumber: 2,
    questResults: ['success', null, null, null, null],
    leaderIndex: 1,
    proposalRejections: 0,
  }

  it('merlin sees evil players except mordred', () => {
    const view = buildView(players[0], state) // merlin
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).toContain('morgana')
    expect(knownIds).toContain('assassin')
    expect(knownIds).not.toContain('mordred')
    expect(knownIds).not.toContain('percival')
    expect(knownIds).not.toContain('servant1')
    for (const known of view.knownPlayers) {
      expect(known.appearance).toBe('evil')
    }
  })

  it('percival sees merlin and morgana as merlin-or-morgana', () => {
    const view = buildView(players[1], state) // percival
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).toContain('merlin')
    expect(knownIds).toContain('morgana')
    expect(knownIds).not.toContain('mordred')
    expect(knownIds).not.toContain('assassin')
    for (const known of view.knownPlayers) {
      expect(known.appearance).toBe('merlin-or-morgana')
    }
  })

  it('loyal-servant sees nothing', () => {
    const view = buildView(players[2], state) // servant1
    expect(view.knownPlayers).toHaveLength(0)
  })

  it('evil (assassin) sees other evil except oberon', () => {
    const view = buildView(players[6], state) // assassin
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).toContain('mordred')
    expect(knownIds).toContain('morgana')
    expect(knownIds).not.toContain('assassin') // not themselves
    expect(knownIds).not.toContain('merlin')
    for (const known of view.knownPlayers) {
      expect(known.appearance).toBe('evil')
    }
  })

  it('evil (mordred) sees other evil except oberon', () => {
    const view = buildView(players[4], state) // mordred
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).toContain('morgana')
    expect(knownIds).toContain('assassin')
    expect(knownIds).not.toContain('mordred') // not themselves
    expect(knownIds).not.toContain('merlin')
  })

  it('oberon sees nothing', () => {
    const oberonPlayers: AvalonPlayer[] = [
      { id: 'merlin', role: 'merlin', team: 'good' },
      { id: 'percival', role: 'percival', team: 'good' },
      { id: 'servant1', role: 'loyal-servant', team: 'good' },
      { id: 'servant2', role: 'loyal-servant', team: 'good' },
      { id: 'mordred', role: 'mordred', team: 'evil' },
      { id: 'morgana', role: 'morgana', team: 'evil' },
      { id: 'oberon', role: 'oberon', team: 'evil' },
      { id: 'assassin', role: 'assassin', team: 'evil' },
      { id: 'servant3', role: 'loyal-servant', team: 'good' },
      { id: 'servant4', role: 'loyal-servant', team: 'good' },
    ]
    const oberonState: AvalonState = {
      players: oberonPlayers,
      phase: 'team-proposal',
      questNumber: 1,
      questResults: [null, null, null, null, null],
      leaderIndex: 0,
      proposalRejections: 0,
    }
    const view = buildView(oberonPlayers[6], oberonState) // oberon
    expect(view.knownPlayers).toHaveLength(0)
  })

  it('evil does not see oberon', () => {
    const oberonPlayers: AvalonPlayer[] = [
      { id: 'merlin', role: 'merlin', team: 'good' },
      { id: 'percival', role: 'percival', team: 'good' },
      { id: 'servant1', role: 'loyal-servant', team: 'good' },
      { id: 'servant2', role: 'loyal-servant', team: 'good' },
      { id: 'mordred', role: 'mordred', team: 'evil' },
      { id: 'morgana', role: 'morgana', team: 'evil' },
      { id: 'oberon', role: 'oberon', team: 'evil' },
      { id: 'assassin', role: 'assassin', team: 'evil' },
      { id: 'servant3', role: 'loyal-servant', team: 'good' },
      { id: 'servant4', role: 'loyal-servant', team: 'good' },
    ]
    const oberonState: AvalonState = {
      players: oberonPlayers,
      phase: 'team-proposal',
      questNumber: 1,
      questResults: [null, null, null, null, null],
      leaderIndex: 0,
      proposalRejections: 0,
    }
    const view = buildView(oberonPlayers[7], oberonState) // assassin
    const knownIds = view.knownPlayers.map(p => p.id)
    expect(knownIds).not.toContain('oberon')
  })

  it('public state fields are correct', () => {
    const view = buildView(players[2], state)
    expect(view.yourId).toBe('servant1')
    expect(view.yourRole).toBe('loyal-servant')
    expect(view.yourTeam).toBe('good')
    expect(view.phase).toBe('team-proposal')
    expect(view.questNumber).toBe(2)
    expect(view.questResults).toEqual(['success', null, null, null, null])
    expect(view.leader).toBe('percival')
    expect(view.proposalRejections).toBe(0)
    expect(view.players).toEqual(players.map(p => p.id))
  })

  it('questResults is a copy, not a reference', () => {
    const view = buildView(players[2], state)
    view.questResults[0] = 'fail'
    expect(state.questResults[0]).toBe('success')
  })

  it('proposedTeam is included when set', () => {
    const stateWithTeam: AvalonState = {
      ...state,
      proposedTeam: ['merlin', 'percival'],
    }
    const view = buildView(players[2], stateWithTeam)
    expect(view.proposedTeam).toEqual(['merlin', 'percival'])
  })

  it('proposedTeam is undefined when not set', () => {
    const view = buildView(players[2], state)
    expect(view.proposedTeam).toBeUndefined()
  })

  it('proposedTeam copy is independent of state', () => {
    const stateWithTeam: AvalonState = {
      ...state,
      proposedTeam: ['merlin', 'percival'],
    }
    const view = buildView(players[2], stateWithTeam)
    view.proposedTeam!.push('servant1')
    expect(stateWithTeam.proposedTeam).toHaveLength(2)
  })
})
