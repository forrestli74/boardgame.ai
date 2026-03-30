import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { Player } from '../../core/player.js'
import type { ActionRequest } from '../../core/types.js'
import type { GameEvent } from '../../core/events.js'
import { Recorder } from '../../core/recorder.js'
import { AIGame } from './ai-game.js'
import { Engine } from '../../core/engine.js'
import { LLMPlayer } from '../../players/llm-player.js'
import { registry, DEFAULT_MODEL } from '../../core/llm-registry.js'
import { useHttpRecording } from '../../test-utils/http-recording.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(__dirname, '../../../rules/avalon.md')
// NOTE: hardcoded /tmp path — only tested on macOS.
const LOG_FILE = '/tmp/boardgame-avalon-integration.jsonl'
const CASSETTE = join(__dirname, '__fixtures__', 'integration-AI-Game-Avalon-plays-a-5-player-game-to-completion.json')
const SKIP = !process.env.GEMINI_API_KEY && !existsSync(CASSETTE)

/** Ask an LLM whether the game events look like a valid Avalon game. */
async function verifyGameLog(events: GameEvent[], scores: Record<string, number>): Promise<void> {
  const result = await generateText({
    model: registry.languageModel(DEFAULT_MODEL as Parameters<typeof registry.languageModel>[0]),
    system: 'You are a board game expert analyzing game logs.',
    messages: [{
      role: 'user',
      content: `Analyze this JSONL log of a 5-player Avalon game. The game finished with these scores: ${JSON.stringify(scores)}.

Determine if the log shows an Avalon game being played — look for recognizable Avalon elements like role assignment, team proposals, voting, and quest execution. The game master is an LLM so it may not follow rules perfectly, but the log should show an attempt at playing Avalon rather than some other game or nonsense.

${JSON.stringify(events.map(({ timestamp, ...rest }) => rest))}`,
    }],
    tools: {
      verify_game: tool({
        description: 'Report whether the game log represents an Avalon game',
        inputSchema: z.object({
          valid: z.boolean().describe('Whether this log shows an Avalon game being played'),
          reason: z.string().describe('Brief explanation'),
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'verify_game' },
  })
  const verification = result.toolCalls[0]
  expect(verification).toBeDefined()
  expect((verification!.input as Record<string, unknown>).valid).toBe(true)
}

describe.skipIf(SKIP)('integration: AI Game - Avalon', () => {
  afterEach(() => {
    if (!process.env.VCR_MODE && existsSync(LOG_FILE)) unlinkSync(LOG_FILE)
  })

  // LLM API calls (game master + 5 players per round + verification) can be slow.
  it('plays a 5-player game to completion', async () => {
    await useHttpRecording()
    const playerIds = ['alice', 'bob', 'charlie', 'diana', 'eve']

    // Serialize LLM calls so HTTP request order is deterministic for cassette replay.
    // Without this, concurrent player calls (e.g., team voting) resolve in arbitrary order,
    // changing the batch action message body and breaking nock's body matching.
    let chain = Promise.resolve<unknown>(undefined)
    const players = new Map<string, Player>(
      playerIds.map(id => {
        const inner = new LLMPlayer(id, id)
        return [id, {
          id,
          name: id,
          act: (req: ActionRequest) => {
            const p = chain.then(() => inner.act(req))
            chain = p.then(() => {}, () => {})
            return p
          },
        }]
      })
    )

    const events: GameEvent[] = []
    const recorder = new Recorder('avalon-1', LOG_FILE)
    const engine = new Engine('avalon-1')
    engine.onEvent((e) => recorder.record(e))
    engine.onEvent((e) => events.push(e))

    const outcome = await engine.run(
      new AIGame(readFileSync(RULES_PATH, 'utf-8'), { gameId: 'avalon-1', seed: 42 }),
      players,
    )
    if (!outcome) throw new Error('game did not produce an outcome')

    // Scores: each player gets 1 (winner) or 0 (loser), with at least one of each
    const scores = Object.values(outcome.scores)
    expect(scores).toHaveLength(5)
    scores.forEach(s => expect([0, 1]).toContain(s))
    expect(scores.filter(s => s === 1).length).toBeGreaterThanOrEqual(1)
    expect(scores.filter(s => s === 0).length).toBeGreaterThanOrEqual(1)

    // Log: every entry belongs to this game
    const lines = readFileSync(LOG_FILE, 'utf-8').trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(5)
    lines.forEach(line => expect(JSON.parse(line).gameId).toBe('avalon-1'))

    // LLM verification: events should look like an Avalon game
    await verifyGameLog(events, outcome.scores)
  }, 900_000)
})
