import { describe, it, expect } from 'vitest'
import { Engine } from '../../core/engine.js'
import { scriptedPlayers } from '../../test-utils/scripted-players.js'
import { Avalon } from './avalon.js'

// seed=42, 5 players: alice=merlin(good), bob=assassin(evil), charlie=loyal-servant(good),
//                      diana=percival(good), eve=morgana(evil), leaderIndex=2 (charlie)
// seed=42, 7 players: alice=loyal-servant(good), bob=percival(good), charlie=merlin(good),
//                      diana=morgana(evil), eve=assassin(evil), frank=loyal-servant(good),
//                      grace=mordred(evil), leaderIndex=0 (alice)

function makeConfig(playerCount: number, seed = 42) {
  const ids = ['alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace', 'heidi', 'ivan', 'judy'].slice(0, playerCount)
  return { gameId: 'test', seed, players: ids.map(id => ({ id, name: id })) }
}

// Helper to create all-approve votes for a list of players
function allApprove(playerIds: string[]): [string, unknown][] {
  return playerIds.map(id => [id, { approve: true }] as [string, unknown])
}

// Helper to create all-reject votes for a list of players
function allReject(playerIds: string[]): [string, unknown][] {
  return playerIds.map(id => [id, { approve: false }] as [string, unknown])
}

// Collect all events: emitted events + finalEvents from outcome metadata
function collectAllEvents(emittedEvents: unknown[], outcome: { metadata?: { finalEvents?: unknown[] } } | null) {
  const finalEvents = (outcome?.metadata?.finalEvents as unknown[]) ?? []
  return [...emittedEvents, ...finalEvents]
}

function findGameEnd(allEvents: unknown[]) {
  return allEvents.find((e: any) => e.source === 'game' && (e.data as any).type === 'game-end') as any
}

describe('Avalon', () => {
  it('evil wins by hammer rule (5 consecutive rejections)', async () => {
    const config = makeConfig(5)
    const players5 = ['alice', 'bob', 'charlie', 'diana', 'eve']
    // Quest 0, team size 2
    // Leaders in order: charlie(2) → diana(3) → eve(4) → alice(0) → bob(1) → 5th rejection → hammer
    const actions: [string, unknown][] = [
      // Round 1: charlie proposes, all reject
      ['charlie', { team: ['alice', 'charlie'] }],
      ...allReject(players5),
      // Round 2: diana proposes, all reject
      ['diana', { team: ['alice', 'diana'] }],
      ...allReject(players5),
      // Round 3: eve proposes, all reject
      ['eve', { team: ['alice', 'eve'] }],
      ...allReject(players5),
      // Round 4: alice proposes, all reject
      ['alice', { team: ['alice', 'charlie'] }],
      ...allReject(players5),
      // Round 5: bob proposes, all reject → hammer
      ['bob', { team: ['alice', 'bob'] }],
      ...allReject(players5),
    ]

    const engine = new Engine()
    const emittedEvents: unknown[] = []
    engine.onEvent(e => emittedEvents.push(e))

    const outcome = await engine.run(new Avalon(), scriptedPlayers(actions), config)

    const allEvents = collectAllEvents(emittedEvents, outcome as any)
    const gameEndEvent = findGameEnd(allEvents)

    expect(gameEndEvent).toBeDefined()
    expect(gameEndEvent.data.reason).toBe('hammer')
    expect(gameEndEvent.data.winner).toBe('evil')

    // Evil players (bob, eve) get score 1; good players get score 0
    expect(outcome?.scores['bob']).toBe(1)
    expect(outcome?.scores['eve']).toBe(1)
    expect(outcome?.scores['alice']).toBe(0)
    expect(outcome?.scores['charlie']).toBe(0)
    expect(outcome?.scores['diana']).toBe(0)
  })

  it('evil wins by 3 quest failures', async () => {
    const config = makeConfig(5)
    const players5 = ['alice', 'bob', 'charlie', 'diana', 'eve']
    // Quest configs 5p: q(2), q(3), q(2), q(3), q(3)
    // Leaders: charlie(2) → diana(3) → eve(4) after quest rotations
    // Include eve(evil) on each team, she votes fail
    // All vote approve for team votes
    const actions: [string, unknown][] = [
      // Quest 0: leader=charlie, team size 2, include eve
      ['charlie', { team: ['charlie', 'eve'] }],
      ...allApprove(players5),
      // Quest 0 votes: charlie success, eve fail
      ['charlie', { success: true }],
      ['eve', { success: false }],
      // Quest 1: leader=diana, team size 3, include eve
      ['diana', { team: ['charlie', 'diana', 'eve'] }],
      ...allApprove(players5),
      // Quest 1 votes: charlie and diana success, eve fail
      ['charlie', { success: true }],
      ['diana', { success: true }],
      ['eve', { success: false }],
      // Quest 2: leader=eve, team size 2, include eve
      ['eve', { team: ['charlie', 'eve'] }],
      ...allApprove(players5),
      // Quest 2 votes: charlie success, eve fail
      ['charlie', { success: true }],
      ['eve', { success: false }],
    ]

    const engine = new Engine()
    const emittedEvents: unknown[] = []
    engine.onEvent(e => emittedEvents.push(e))

    const outcome = await engine.run(new Avalon(), scriptedPlayers(actions), config)

    const allEvents = collectAllEvents(emittedEvents, outcome as any)
    const gameEndEvent = findGameEnd(allEvents)

    expect(gameEndEvent).toBeDefined()
    expect(gameEndEvent.data.reason).toBe('three-fails')
    expect(gameEndEvent.data.winner).toBe('evil')

    // No assassination event should exist
    const assassinationEvent = allEvents.find(
      (e: any) => e.source === 'game' && (e.data as any).type === 'assassination-attempt'
    )
    expect(assassinationEvent).toBeUndefined()

    expect(outcome?.scores['bob']).toBe(1)
    expect(outcome?.scores['eve']).toBe(1)
    expect(outcome?.scores['alice']).toBe(0)
  })

  it('good wins when assassin guesses wrong', async () => {
    const config = makeConfig(5)
    const players5 = ['alice', 'bob', 'charlie', 'diana', 'eve']
    // alice=merlin, bob=assassin; merlin is alice
    // For assassin to LOSE: bob picks charlie (not alice)
    // Leaders: charlie(2) → diana(3) → eve(4)
    const actions: [string, unknown][] = [
      // Quest 0: leader=charlie, team size 2, good-only
      ['charlie', { team: ['alice', 'charlie'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      // Quest 1: leader=diana, team size 3, good-only
      ['diana', { team: ['alice', 'charlie', 'diana'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      ['diana', { success: true }],
      // Quest 2: leader=eve, team size 2, good-only (eve proposes good players)
      ['eve', { team: ['alice', 'charlie'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      // Assassination: bob picks charlie (not alice/merlin) → fail → good wins
      ['bob', { targetId: 'charlie' }],
    ]

    const engine = new Engine()
    const emittedEvents: unknown[] = []
    engine.onEvent(e => emittedEvents.push(e))

    const outcome = await engine.run(new Avalon(), scriptedPlayers(actions), config)

    const allEvents = collectAllEvents(emittedEvents, outcome as any)
    const gameEndEvent = findGameEnd(allEvents)

    expect(gameEndEvent).toBeDefined()
    expect(gameEndEvent.data.reason).toBe('three-successes')
    expect(gameEndEvent.data.winner).toBe('good')

    // Good players get score 1
    expect(outcome?.scores['alice']).toBe(1)
    expect(outcome?.scores['charlie']).toBe(1)
    expect(outcome?.scores['diana']).toBe(1)
    expect(outcome?.scores['bob']).toBe(0)
    expect(outcome?.scores['eve']).toBe(0)
  })

  it('evil wins when assassin correctly identifies Merlin', async () => {
    const config = makeConfig(5)
    const players5 = ['alice', 'bob', 'charlie', 'diana', 'eve']
    // alice=merlin, bob=assassin; assassin picks alice(merlin) → evil wins
    const actions: [string, unknown][] = [
      // Quest 0: leader=charlie, team size 2
      ['charlie', { team: ['alice', 'charlie'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      // Quest 1: leader=diana, team size 3
      ['diana', { team: ['alice', 'charlie', 'diana'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      ['diana', { success: true }],
      // Quest 2: leader=eve, team size 2
      ['eve', { team: ['alice', 'charlie'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      // Assassination: bob picks alice (merlin) → success → evil wins
      ['bob', { targetId: 'alice' }],
    ]

    const engine = new Engine()
    const emittedEvents: unknown[] = []
    engine.onEvent(e => emittedEvents.push(e))

    const outcome = await engine.run(new Avalon(), scriptedPlayers(actions), config)

    const allEvents = collectAllEvents(emittedEvents, outcome as any)
    const gameEndEvent = findGameEnd(allEvents)

    expect(gameEndEvent).toBeDefined()
    expect(gameEndEvent.data.reason).toBe('assassination')
    expect(gameEndEvent.data.winner).toBe('evil')

    expect(outcome?.scores['bob']).toBe(1)
    expect(outcome?.scores['eve']).toBe(1)
    expect(outcome?.scores['alice']).toBe(0)
    expect(outcome?.scores['charlie']).toBe(0)
    expect(outcome?.scores['diana']).toBe(0)
  })

  it('4th quest requires 2 fails for 7+ players', async () => {
    const config = makeConfig(7)
    const players7 = ['alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace']
    // Quest configs 7p: q(2), q(3), q(3), q(4,2), q(4)
    // seed=42, 7p: alice=loyal-servant, bob=percival, charlie=merlin, diana=morgana(evil),
    //              eve=assassin(evil), frank=loyal-servant, grace=mordred(evil), leaderIndex=0 (alice)
    // Quest 0 (size 2, fails=1): alice leads, good-only [alice, bob] → success
    // Quest 1 (size 3, fails=1): bob leads, good-only [alice, bob, charlie] → success
    // Quest 2 (size 3, fails=1): charlie leads, [alice, bob, diana] diana fails → fail
    // Quest 3 (size 4, fails=2): diana leads, [alice, bob, charlie, grace] grace fails → 1 fail < 2 → success!
    // Successes=3 → assassination: eve picks alice (not charlie/merlin) → good wins
    const actions: [string, unknown][] = [
      // Quest 0: alice leads, team [alice, bob]
      ['alice', { team: ['alice', 'bob'] }],
      ...allApprove(players7),
      ['alice', { success: true }],
      ['bob', { success: true }],
      // Quest 1: bob leads, team [alice, bob, charlie]
      ['bob', { team: ['alice', 'bob', 'charlie'] }],
      ...allApprove(players7),
      ['alice', { success: true }],
      ['bob', { success: true }],
      ['charlie', { success: true }],
      // Quest 2: charlie leads, team [alice, bob, diana] – diana fails
      ['charlie', { team: ['alice', 'bob', 'diana'] }],
      ...allApprove(players7),
      ['alice', { success: true }],
      ['bob', { success: true }],
      ['diana', { success: false }],
      // Quest 3: diana leads, team [alice, bob, charlie, grace] – grace fails (1 fail < 2 required → success)
      ['diana', { team: ['alice', 'bob', 'charlie', 'grace'] }],
      ...allApprove(players7),
      ['alice', { success: true }],
      ['bob', { success: true }],
      ['charlie', { success: true }],
      ['grace', { success: false }],
      // Assassination: eve picks alice (not charlie/merlin) → fail → good wins
      ['eve', { targetId: 'alice' }],
    ]

    const engine = new Engine()
    const emittedEvents: unknown[] = []
    engine.onEvent(e => emittedEvents.push(e))

    const outcome = await engine.run(new Avalon(), scriptedPlayers(actions), config)

    const allEvents = collectAllEvents(emittedEvents, outcome as any)

    // Verify quest 3 result is 'success' with failVotes=1
    const questResultEvents = allEvents.filter(
      (e: any) => e.source === 'game' && (e.data as any).type === 'quest-result'
    ) as any[]
    const quest3Result = questResultEvents.find((e: any) => e.data.questNumber === 3)
    expect(quest3Result).toBeDefined()
    expect(quest3Result.data.result).toBe('success')
    expect(quest3Result.data.failVotes).toBe(1)

    const gameEndEvent = findGameEnd(allEvents)
    expect(gameEndEvent.data.winner).toBe('good')

    // Good players score 1
    expect(outcome?.scores['alice']).toBe(1)
    expect(outcome?.scores['bob']).toBe(1)
    expect(outcome?.scores['charlie']).toBe(1)
    expect(outcome?.scores['frank']).toBe(1)
    expect(outcome?.scores['diana']).toBe(0)
    expect(outcome?.scores['eve']).toBe(0)
    expect(outcome?.scores['grace']).toBe(0)
  })

  it('rotates leader after team rejection', async () => {
    const config = makeConfig(5)
    const players5 = ['alice', 'bob', 'charlie', 'diana', 'eve']
    // seed=42, leaderIndex=2 (charlie); after rejection leaderIndex=3 (diana)
    // First proposal: charlie leads → all reject
    // Second proposal: diana leads → all approve → quest succeeds
    // Then need 2 more quests to reach assassination → end the game
    // After quest 0 (diana leads approved team), leaderIndex rotates from 3 to 4 (eve)
    // After quest 1, leaderIndex rotates from 4 to 0 (alice)
    // After quest 2, leaderIndex rotates from 0 to 1 (bob) → assassination
    const actions: [string, unknown][] = [
      // Quest 0 round 1: charlie proposes (leaderIndex=2), all reject
      ['charlie', { team: ['alice', 'charlie'] }],
      ...allReject(players5),
      // Quest 0 round 2: diana proposes (leaderIndex=3 after rotation), all approve
      ['diana', { team: ['alice', 'diana'] }],
      ...allApprove(players5),
      // Quest 0 execution (team size 2): alice and diana both vote success
      ['alice', { success: true }],
      ['diana', { success: true }],
      // Quest 1: leaderIndex was 3(diana) when approved, rotates to 4 (eve) after quest
      // Quest 1 team size 3
      ['eve', { team: ['alice', 'charlie', 'diana'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      ['diana', { success: true }],
      // Quest 2: leaderIndex rotates to 0 (alice), team size 2
      ['alice', { team: ['alice', 'charlie'] }],
      ...allApprove(players5),
      ['alice', { success: true }],
      ['charlie', { success: true }],
      // Assassination: bob(assassin) picks charlie (not alice/merlin) → good wins
      ['bob', { targetId: 'charlie' }],
    ]

    const engine = new Engine()
    const emittedEvents: unknown[] = []
    engine.onEvent(e => emittedEvents.push(e))

    await engine.run(new Avalon(), scriptedPlayers(actions), config)

    const teamProposedEvents = emittedEvents.filter(
      (e: any) => e.source === 'game' && (e.data as any).type === 'team-proposed'
    ) as any[]

    // First two proposal events should have different leaders
    expect(teamProposedEvents.length).toBeGreaterThanOrEqual(2)
    expect(teamProposedEvents[0].data.leader).toBe('charlie')
    expect(teamProposedEvents[1].data.leader).toBe('diana')
  })
})
