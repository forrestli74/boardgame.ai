import { describe, it, expect } from 'vitest'
import { registry, DEFAULT_MODEL } from './llm-registry.js'

describe('llm-registry', () => {
  it('exports a DEFAULT_MODEL string', () => {
    expect(DEFAULT_MODEL).toBe('google:gemini-2.5-flash')
  })

  it('resolves a google model from the registry', () => {
    const model = registry.languageModel('google:gemini-2.5-flash')
    expect(model).toBeDefined()
    expect(model.modelId).toBe('gemini-2.5-flash')
  })

  it('throws on unknown provider prefix', () => {
    expect(() => registry.languageModel('unknown:model' as any)).toThrow()
  })
})
