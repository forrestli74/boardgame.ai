import { describe, it, expect } from 'vitest'
import { registry, DEFAULT_MODEL } from './llm-registry.js'

describe('llm-registry', () => {
  it('exports a DEFAULT_MODEL string', () => {
    expect(DEFAULT_MODEL).toBe('anthropic:claude-sonnet-4-20250514')
  })

  it('resolves an anthropic model from the registry', () => {
    const model = registry.languageModel('anthropic:claude-sonnet-4-20250514')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('claude-sonnet-4-20250514')
  })

  it('resolves an openai model from the registry', () => {
    const model = registry.languageModel('openai:gpt-4o')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('gpt-4o')
  })

  it('resolves a google model from the registry', () => {
    const model = registry.languageModel('google:gemini-2.0-flash')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('gemini-2.0-flash')
  })

  it('throws on unknown provider prefix', () => {
    expect(() => registry.languageModel('unknown:model' as any)).toThrow()
  })
})
