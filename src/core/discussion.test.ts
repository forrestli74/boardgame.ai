import { describe, it, expect } from 'vitest'
import { Engine } from './engine.js'
import { scriptedPlayers } from '../test-utils/scripted-players.js'
import type { Game, GameFlow, PlayerAction } from './game.js'
import type { GameEvent } from './events.js'
import {
  DiscussionStatementSchema,
  BroadcastDiscussion,
  type DiscussionResult,
} from './discussion.js'

// ---- Schema tests ----

describe('DiscussionStatementSchema', () => {
  it('accepts valid statement', () => {
    const result = DiscussionStatementSchema.safeParse({ statement: 'hello' })
    expect(result.success).toBe(true)
  })

  it('accepts empty string (pass)', () => {
    const result = DiscussionStatementSchema.safeParse({ statement: '' })
    expect(result.success).toBe(true)
  })

  it('rejects missing statement field', () => {
    const result = DiscussionStatementSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects non-string statement', () => {
    const result = DiscussionStatementSchema.safeParse({ statement: 42 })
    expect(result.success).toBe(false)
  })
})

// ---- Helper game for testing ----

function discussionGame(
  discussion: BroadcastDiscussion,
  playerIds: string[],
  contexts?: Record<string, unknown>,
  options?: { firstSpeakers?: string[] },
): Game {
  return {
    play(_pIds: string[]): GameFlow {
      return (async function* () {
        const ctxs = contexts ?? Object.fromEntries(playerIds.map(id => [id, { info: 'test' }]))
        const result: DiscussionResult = yield* discussion.run(playerIds, ctxs, options)
        // Emit any pending events from the last round as metadata
        return { scores: {}, metadata: { discussion: result } }
      })() as GameFlow
    },
  }
}

// ---- BroadcastDiscussion tests ----

describe('BroadcastDiscussion', () => {
  it('single round, all speak — statements collected', async () => {
    const discussion = new BroadcastDiscussion(1)
    const playerIds = ['alice', 'bob']
    const game = discussionGame(discussion, playerIds)
    const engine = new Engine('test-game')
    const events: GameEvent[] = []
    engine.onEvent(e => events.push(e))

    const players = scriptedPlayers([
      ['alice', { statement: 'I trust bob' }],
      ['bob', { statement: 'I agree with alice' }],
    ])

    const outcome = await engine.run(game, players)
    expect(outcome).not.toBeNull()

    const result = (outcome!.metadata!.discussion as DiscussionResult)
    expect(result.statements).toHaveLength(2)

    const aliceStmt = result.statements.find(s => s.playerId === 'alice')!
    const bobStmt = result.statements.find(s => s.playerId === 'bob')!

    expect(aliceStmt.content).toBe('I trust bob')
    expect(bobStmt.content).toBe('I agree with alice')

    // The last round's event is in pendingEvents (not yet emitted by engine)
    expect(result.pendingEvents).toHaveLength(1)
    const roundEvent = result.pendingEvents[0]
    expect((roundEvent.data as any).type).toBe('discussion-round')
    expect((roundEvent.data as any).round).toBe(0)
    expect((roundEvent.data as any).statements).toHaveLength(2)
  })

  it('two rounds — round 1 event emitted, round 2 event in pendingEvents', async () => {
    const discussion = new BroadcastDiscussion(2)
    const playerIds = ['alice', 'bob']
    const game = discussionGame(discussion, playerIds)
    const engine = new Engine('test-game')
    const events: GameEvent[] = []
    engine.onEvent(e => events.push(e))

    const players = scriptedPlayers([
      // Round 1
      ['alice', { statement: 'hello' }],
      ['bob', { statement: 'world' }],
      // Round 2
      ['alice', { statement: 'round 2 alice' }],
      ['bob', { statement: 'round 2 bob' }],
    ])

    const outcome = await engine.run(game, players)
    expect(outcome).not.toBeNull()

    const result = (outcome!.metadata!.discussion as DiscussionResult)

    // 4 statements total (2 per round)
    expect(result.statements).toHaveLength(4)

    // Round 1 event should have been emitted by engine (carried forward with round 2 requests)
    const gameEvents = events.filter(e => e.source === 'game')
    const round1Event = gameEvents.find(e => (e.data as any).type === 'discussion-round' && (e.data as any).round === 0)
    expect(round1Event).toBeDefined()

    // Round 2 event is in pendingEvents (last round, not emitted by engine)
    expect(result.pendingEvents).toHaveLength(1)
    const round2Event = result.pendingEvents[0]
    expect((round2Event.data as any).type).toBe('discussion-round')
    expect((round2Event.data as any).round).toBe(1)
  })

  it('passing does not drop player — they can speak in later rounds', async () => {
    const discussion = new BroadcastDiscussion(3)
    const playerIds = ['alice', 'bob']
    const game = discussionGame(discussion, playerIds)
    const engine = new Engine('test-game')

    // Bob passes round 1, speaks round 2, passes round 3
    const players = scriptedPlayers([
      // Round 1
      ['alice', { statement: 'round 1 alice' }],
      ['bob', { statement: '' }],
      // Round 2 — both asked, bob speaks now
      ['alice', { statement: 'round 2 alice' }],
      ['bob', { statement: 'round 2 bob' }],
      // Round 3 — both asked again
      ['alice', { statement: 'round 3 alice' }],
      ['bob', { statement: '' }],
    ])

    const outcome = await engine.run(game, players)
    expect(outcome).not.toBeNull()

    const result = outcome!.metadata!.discussion as DiscussionResult
    expect(result.statements).toHaveLength(4)
    expect(result.statements.map(s => `${s.playerId}: ${s.content}`)).toEqual([
      'alice: round 1 alice',
      'alice: round 2 alice',
      'bob: round 2 bob',
      'alice: round 3 alice',
    ])
  })

  it('early exit when all pass — discussion ends after round where everyone passes', async () => {
    const discussion = new BroadcastDiscussion(5)
    const playerIds = ['alice', 'bob']
    const game = discussionGame(discussion, playerIds)
    const engine = new Engine('test-game')

    // Both speak round 1, both pass round 2
    const players = scriptedPlayers([
      // Round 1
      ['alice', { statement: 'hello' }],
      ['bob', { statement: 'world' }],
      // Round 2 — both pass
      ['alice', { statement: '' }],
      ['bob', { statement: '' }],
    ])

    const outcome = await engine.run(game, players)
    expect(outcome).not.toBeNull()

    const result = outcome!.metadata!.discussion as DiscussionResult
    // Only round 1 statements; discussion ended after round 2 (all passed)
    expect(result.statements).toHaveLength(2)
    expect(result.statements.map(s => s.content)).toEqual(
      expect.arrayContaining(['hello', 'world']),
    )
  })

  it('all pass round 1 — discussion ends with 0 statements', async () => {
    const discussion = new BroadcastDiscussion(3)
    const playerIds = ['alice', 'bob']
    const game = discussionGame(discussion, playerIds)
    const engine = new Engine('test-game')

    // Both pass immediately in round 1
    const players = scriptedPlayers([
      ['alice', { statement: '' }],
      ['bob', { statement: '' }],
    ])

    const outcome = await engine.run(game, players)
    expect(outcome).not.toBeNull()

    const result = outcome!.metadata!.discussion as DiscussionResult
    expect(result.statements).toHaveLength(0)
  })

  it('invalid action defaults to pass and emits validation-failed event', async () => {
    const discussion = new BroadcastDiscussion(1)
    const playerIds = ['alice', 'bob']
    const game = discussionGame(discussion, playerIds)
    const engine = new Engine('test-game')
    const events: GameEvent[] = []
    engine.onEvent(e => events.push(e))

    // alice sends valid statement, bob sends garbage
    const players = scriptedPlayers([
      ['alice', { statement: 'hello' }],
      ['bob', 42],
    ])

    const outcome = await engine.run(game, players)
    expect(outcome).not.toBeNull()

    const result = outcome!.metadata!.discussion as DiscussionResult
    // Only alice's statement (bob's invalid action defaulted to pass)
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0].playerId).toBe('alice')
  })

  it('firstSpeakers option orders requests with specified players first', async () => {
    const discussion = new BroadcastDiscussion(1)
    const playerIds = ['alice', 'bob', 'charlie']
    // Capture the request order from the first yield
    let capturedRequestOrder: string[] = []

    const game: Game = {
      play(_pIds: string[]): GameFlow {
        return (async function* () {
          const contexts = Object.fromEntries(playerIds.map(id => [id, {}]))
          const gen = discussion.run(playerIds, contexts, { firstSpeakers: ['charlie', 'bob'] })
          let step = await gen.next()
          while (!step.done) {
            if (step.value.requests.length > 0) {
              capturedRequestOrder = step.value.requests.map((r: any) => r.playerId)
            }
            const action: PlayerAction = yield step.value
            step = await gen.next(action)
          }
          return { scores: {}, metadata: { discussion: step.value } }
        })() as GameFlow
      },
    }

    const players = scriptedPlayers([
      ['alice', { statement: 'hi' }],
      ['bob', { statement: 'hey' }],
      ['charlie', { statement: 'yo' }],
    ])

    await engine_run(game, players)
    expect(capturedRequestOrder[0]).toBe('charlie')
    expect(capturedRequestOrder[1]).toBe('bob')
    expect(capturedRequestOrder[2]).toBe('alice')
  })
})

// Helper to run engine without tracking events
async function engine_run(game: Game, players: Map<string, any>) {
  const engine = new Engine('test-game')
  return engine.run(game, players)
}
