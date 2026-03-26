import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { generateText, tool } from 'ai'
import { registry } from '../../core/llm-registry.js'
import { LLMGameResponseSchema } from './schemas.js'
import { buildSystemPrompt, buildInitMessage } from './prompts.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const RULES_PATH = join(__dirname, '../../../rules/avalon.md')

const SKIP = !process.env.GEMINI_API_KEY

describe.skipIf(SKIP)('debug: avalon init', () => {
  it('single init call with flash', async () => {
    const rulesDoc = readFileSync(RULES_PATH, 'utf-8')
    const systemPrompt = buildSystemPrompt()
    const userMessage = buildInitMessage(rulesDoc, {
      gameId: 'avalon-debug-1',
      seed: 42,
      players: ['alice', 'bob', 'charlie', 'diana', 'eve'].map(id => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
      })),
    })

    console.log('Prompt length:', userMessage.length, 'chars')
    const model = 'google:gemini-2.5-flash'

    const result = await generateText({
      model: registry.languageModel(model as Parameters<typeof registry.languageModel>[0]),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      tools: {
        game_master_response: tool({
          description: 'Return the updated game state and next actions',
          inputSchema: LLMGameResponseSchema,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'game_master_response' },
      providerOptions: {
        google: { structuredOutputs: false },
      },
    })

    console.log('Tool calls:', result.toolCalls.length)
    console.log('Text:', result.text?.slice(0, 500))
    console.log('Finish reason:', result.finishReason)

    if (result.toolCalls.length > 0) {
      const input = result.toolCalls[0].input as any
      console.log('isTerminal:', input.isTerminal)
      console.log('requests:', input.requests?.length)
      console.log('events:', input.events?.length)
      try {
        const state = JSON.parse(input.state)
        console.log('state keys:', Object.keys(state))
      } catch {
        console.log('state (raw):', input.state?.slice(0, 300))
      }
    }

    expect(result.toolCalls.length).toBeGreaterThan(0)
  }, 120_000)
})
