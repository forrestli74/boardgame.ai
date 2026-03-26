import { createProviderRegistry } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })

export const registry = createProviderRegistry({
  google,
})

export const DEFAULT_MODEL = 'google:gemini-2.5-flash'
