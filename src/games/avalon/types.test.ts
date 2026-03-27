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
