import { describe, it, expect, afterAll } from 'vitest'
import { sanitize, scrubScopes, useHttpRecording } from './http-recording.js'
import nock from 'nock'
import { existsSync, rmSync } from 'fs'
import path from 'path'

describe('sanitize', () => {
  it('replaces spaces with hyphens', () => {
    expect(sanitize('plays tic-tac-toe to completion')).toBe(
      'plays-tic-tac-toe-to-completion'
    )
  })

  it('removes special characters', () => {
    expect(sanitize('test: with (special) chars!')).toBe(
      'test-with-special-chars'
    )
  })

  it('collapses multiple hyphens', () => {
    expect(sanitize('a   b   c')).toBe('a-b-c')
  })

  it('strips leading and trailing hyphens', () => {
    expect(sanitize(' leading and trailing ')).toBe('leading-and-trailing')
  })

  it('preserves underscores and hyphens', () => {
    expect(sanitize('my_test-name')).toBe('my_test-name')
  })
})

describe('scrubScopes', () => {
  it('redacts authorization header', () => {
    const scopes: nock.Definition[] = [
      {
        scope: 'https://api.example.com',
        method: 'POST',
        path: '/v1/chat',
        reqheaders: { Authorization: 'Bearer sk-secret-key', 'Content-Type': 'application/json' },
        status: 200,
        response: { ok: true },
      },
    ]
    const result = scrubScopes(scopes)
    expect(result[0].reqheaders!.Authorization).toBe('REDACTED')
    expect(result[0].reqheaders!['Content-Type']).toBe('application/json')
  })

  it('redacts x-goog-api-key header', () => {
    const scopes: nock.Definition[] = [
      {
        scope: 'https://generativelanguage.googleapis.com',
        method: 'POST',
        path: '/v1/models/gemini:generateContent',
        reqheaders: { 'x-goog-api-key': 'AIzaSy-secret' },
        status: 200,
        response: {},
      },
    ]
    const result = scrubScopes(scopes)
    expect(result[0].reqheaders!['x-goog-api-key']).toBe('REDACTED')
  })

  it('redacts key= query parameter', () => {
    const scopes: nock.Definition[] = [
      {
        scope: 'https://api.example.com',
        method: 'GET',
        path: '/v1/models?key=AIzaSy-secret&alt=json',
        status: 200,
        response: {},
      },
    ]
    const result = scrubScopes(scopes)
    expect(result[0].path).toBe('/v1/models?key=REDACTED&alt=json')
  })

  it('redacts token= query parameter', () => {
    const scopes: nock.Definition[] = [
      {
        scope: 'https://api.example.com',
        method: 'GET',
        path: '/v1/data?token=abc123',
        status: 200,
        response: {},
      },
    ]
    const result = scrubScopes(scopes)
    expect(result[0].path).toBe('/v1/data?token=REDACTED')
  })

  it('leaves clean scope unchanged', () => {
    const scopes: nock.Definition[] = [
      {
        scope: 'https://api.example.com',
        method: 'POST',
        path: '/v1/chat',
        reqheaders: { 'Content-Type': 'application/json' },
        status: 200,
        response: { data: 'hello' },
      },
    ]
    const result = scrubScopes(scopes)
    expect(result[0].path).toBe('/v1/chat')
    expect(result[0].reqheaders!['Content-Type']).toBe('application/json')
    expect(result[0].response).toEqual({ data: 'hello' })
  })

  it('handles scope with no reqheaders', () => {
    const scopes: nock.Definition[] = [
      {
        scope: 'https://api.example.com',
        method: 'GET',
        path: '/v1/health',
        status: 200,
        response: 'ok',
      },
    ]
    const result = scrubScopes(scopes)
    expect(result[0].reqheaders).toBeUndefined()
  })
})

describe('useHttpRecording integration', () => {
  const fixtureDir = path.join(path.dirname(import.meta.filename), '__fixtures__')

  afterAll(() => {
    // Clean up test fixtures
    if (existsSync(fixtureDir)) {
      rmSync(fixtureDir, { recursive: true })
    }
  })

  it('records an HTTP request to a cassette', async () => {
    // Set record mode to save the cassette
    const originalMode = process.env.VCR_MODE
    process.env.VCR_MODE = 'record'

    await useHttpRecording()

    // Make a real HTTP request
    const response = await fetch('https://httpbin.org/get?foo=bar')
    const data = await response.json()
    expect(data.args.foo).toBe('bar')

    // Restore env
    if (originalMode !== undefined) {
      process.env.VCR_MODE = originalMode
    } else {
      delete process.env.VCR_MODE
    }
  })

  it('replays from cassette without network', async () => {
    // The previous test recorded a cassette. Now verify it exists (nockDone wrote it).
    const prevCassette = path.join(
      fixtureDir,
      sanitize('useHttpRecording integration > records an HTTP request to a cassette') + '.json'
    )
    expect(existsSync(prevCassette)).toBe(true)

    // Now set up replay with lockdown (no network allowed)
    const originalMode = process.env.VCR_MODE
    process.env.VCR_MODE = 'lockdown'

    // Use nock.back directly for replay since useHttpRecording enforces unique names
    nock.back.setMode('lockdown')
    nock.back.fixtures = fixtureDir
    const cassetteName = sanitize('useHttpRecording integration > records an HTTP request to a cassette') + '.json'
    const { nockDone } = await nock.back(cassetteName)

    // This should replay from the cassette, not hit the network
    const response = await fetch('https://httpbin.org/get?foo=bar')
    const data = await response.json()
    expect(data.args.foo).toBe('bar')

    nockDone()
    nock.cleanAll()
    nock.enableNetConnect()

    if (originalMode !== undefined) {
      process.env.VCR_MODE = originalMode
    } else {
      delete process.env.VCR_MODE
    }
  })
})
