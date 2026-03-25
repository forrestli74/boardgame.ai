import { createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'

export const registry = createProviderRegistry({
  anthropic,
  openai,
  google,
})

export const DEFAULT_MODEL = 'anthropic:claude-sonnet-4-20250514'
