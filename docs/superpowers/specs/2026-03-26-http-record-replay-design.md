# HTTP Record/Replay for Integration Tests

## Context

Integration tests (`integration.test.ts`, `avalon-integration.test.ts`) call real LLM APIs via the Vercel AI SDK's `generateText()`. This makes them expensive (API costs), slow (network latency + LLM inference), and non-deterministic (LLM outputs vary). Tests are currently skipped when `GEMINI_API_KEY` is not set.

**Goal:** Record HTTP interactions on first run, replay them on subsequent runs. Tests become fast, free, and deterministic while still validating the full AI SDK pipeline (request serialization, tool schema conversion, response parsing).

## Design

### Library: Nock

[Nock](https://github.com/nock/nock) intercepts Node.js HTTP requests at the `http.ClientRequest` level. Its built-in `nock.back()` API provides VCR-style record/replay with cassette file management.

**Why nock.back():** Inspired by [tape-nock](https://github.com/Flet/tape-nock), which uses `nock.back()` as the engine rather than the manual `nock.recorder` API. `nock.back()` handles cassette loading, recording, and saving natively — less custom code, fewer bugs.

### API: `useHttpRecording()`

One function call at the top of each test. Standard Vitest `describe`/`it` are used everywhere else.

```typescript
import { useHttpRecording } from '../test-utils/http-recording.js'

describe('integration: AI Game Master', () => {
  it('plays tic-tac-toe to completion', async () => {
    await useHttpRecording()

    const game = new AIGameMaster(rulesDoc)
    const engine = new Engine(recorder)
    const outcome = await engine.run(game, players, config)
    expect(outcome.isTerminal).toBe(true)
  }, 120_000)
})
```

### Modes via `VCR_MODE`

Uses nock.back's native modes directly — no custom modes. `VCR_MODE` maps straight to `nockBack.setMode()`.

| `VCR_MODE` | Behavior |
|-----------|----------|
| (unset) / `dryrun` (nock default) | Replay from cassette if exists; pass through to real API if not; does NOT save |
| `record` | Replay from cassette if exists; record + save new cassettes |
| `lockdown` | Replay from cassette only; fail if missing |
| `wild` | Bypass all fixtures, always hit real API |

To re-record a specific test: delete its cassette file, then run with `VCR_MODE=record`.

npm scripts:
- `npm test` — `dryrun` (nock default)
- `npm run test:record` — `VCR_MODE=record vitest run`
- `npm run test:ci` — `VCR_MODE=lockdown vitest run`

### Cassette Storage

```
src/ai-game-master/__fixtures__/
  plays-tic-tac-toe-to-completion.json
  plays-avalon-5p-to-completion.json
```

- One JSON file per test, named from the sanitized test name
- Stored in `__fixtures__/` alongside test files
- Committed to git — CI replays without API keys

### Implementation

Single file: `src/test-utils/http-recording.ts` (~60 lines).

```typescript
import nock from 'nock'
import { expect, onTestFinished } from 'vitest'
import { mkdirSync } from 'fs'
import path from 'path'

const nockBack = nock.back

// Track used fixture names to catch collisions (tape-nock pattern)
const usedFixtureNames = new Set<string>()

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Blacklist approach (industry standard — used by Ruby VCR, VCRpy, tape-nock)
const SENSITIVE_HEADERS = ['authorization', 'x-goog-api-key', 'x-api-key']
const SENSITIVE_QUERY_PARAMS = [/key=[^&]+/g, /token=[^&]+/g]

function scrubScopes(scopes: nock.Definition[]): nock.Definition[] {
  return scopes.map(scope => {
    let scrubbedPath = scope.path
    for (const pattern of SENSITIVE_QUERY_PARAMS) {
      scrubbedPath = scrubbedPath.replace(pattern, match =>
        match.split('=')[0] + '=REDACTED'
      )
    }

    const scrubbedHeaders = scope.reqheaders
      ? Object.fromEntries(
          Object.entries(scope.reqheaders).map(([k, v]) =>
            SENSITIVE_HEADERS.includes(k.toLowerCase()) ? [k, 'REDACTED'] : [k, v]
          )
        )
      : undefined

    return { ...scope, path: scrubbedPath, reqheaders: scrubbedHeaders }
  })
}

export async function useHttpRecording(): Promise<void> {
  const { currentTestName, testPath } = expect.getState()
  if (!currentTestName || !testPath) {
    throw new Error('useHttpRecording() must be called inside a Vitest test')
  }

  const fixtureName = sanitize(currentTestName) + '.json'
  const fixtureDir = path.join(path.dirname(testPath), '__fixtures__')

  // Enforce unique fixture names (tape-nock pattern)
  const fixtureKey = path.join(fixtureDir, fixtureName)
  if (usedFixtureNames.has(fixtureKey)) {
    throw new Error(
      `Duplicate fixture name: "${fixtureName}". All test names must be unique.`
    )
  }
  usedFixtureNames.add(fixtureKey)

  // Use nock.back's native modes; default is dryrun (nock's own default)
  if (process.env.VCR_MODE) {
    nockBack.setMode(process.env.VCR_MODE)
  }

  mkdirSync(fixtureDir, { recursive: true })
  nockBack.fixtures = fixtureDir

  const { nockDone } = await nockBack(fixtureName, {
    afterRecord: (scopes) => scrubScopes(scopes),
  })

  onTestFinished(() => {
    nockDone()
    nock.cleanAll()
    nock.enableNetConnect()
  })
}
```

### Key Design Decisions

- **`nock.back()` as engine** — handles cassette I/O, recording, and replay natively. No manual `nock.recorder` management.
- **Fixture dir set per-call** — derived from `testPath`, so cassettes live alongside their test files.
- **`onTestFinished()` for cleanup** — Vitest API that registers a callback when the current test completes. Avoids needing `afterEach` or wrapper functions.
- **`nock.cleanAll()` + `nock.enableNetConnect()`** — proper cleanup per nock best practices. Never use `nock.restore()` (disables interceptor permanently).
- **Unique fixture name enforcement** — prevents cassette collisions from duplicate test names.
- **API key scrubbing via `afterRecord`** — strips `x-goog-api-key`, `Authorization` headers, and `key=` query params before writing cassettes.

### Security

Blacklist approach (industry standard — used by Ruby VCR, VCRpy, tape-nock). Cassettes are scrubbed via `afterRecord` before saving:
- **Headers blacklist:** `authorization`, `x-goog-api-key`, `x-api-key` → `REDACTED`
- **Query param blacklist:** `key=...`, `token=...` → `REDACTED`
- Response bodies and other fields are kept intact for nock's replay matching

### ESM Compatibility

Nock is CommonJS; the project uses ESM. Known compatibility concern (vitest-dev/vitest#2914). If nock fails to intercept due to import ordering, the workaround is `NODE_OPTIONS=--import=nock` in the test command. This should be verified during implementation.

### Pitfalls Addressed

| Pitfall | Mitigation |
|---------|-----------|
| Non-deterministic LLM output | Record once, replay deterministically |
| Large cassette files | One file per test; git manages diffs |
| API key leakage in cassettes | `afterRecord` scrubs keys before save |
| Leaked interceptors between tests | `nock.cleanAll()` in `onTestFinished` |
| Streaming responses | Project uses `generateText` (non-streaming), avoiding nock's streaming quirks |
| Duplicate test names | Collision detection throws early |

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/test-utils/http-recording.ts` | **Create** — `useHttpRecording()` implementation |
| `src/test-utils/http-recording.test.ts` | **Create** — unit tests for sanitize, scrubScopes, mode logic |
| `src/ai-game-master/integration.test.ts` | **Modify** — add `await useHttpRecording()`, remove `SKIP` guard |
| `src/ai-game-master/avalon-integration.test.ts` | **Modify** — add `await useHttpRecording()`, remove `SKIP` guard |
| `package.json` | **Modify** — add `nock` devDep, add `test:record` and `test:ci` scripts |
| `.gitignore` | **Verify** — ensure `__fixtures__/` is NOT gitignored |

## Verification

1. **Record cassettes:** `VCR_MODE=record npm test` with `GEMINI_API_KEY` set
2. **Replay from cassettes:** Unset `GEMINI_API_KEY`, run `npm test` — tests should pass using cassettes
3. **Lockdown mode:** `VCR_MODE=lockdown npm test` — should pass with cassettes, fail without
4. **Check cassettes:** Inspect `__fixtures__/*.json` — verify no API keys present
5. **ESM compatibility:** Verify nock intercepts correctly in the ESM context

## References

- [nock](https://github.com/nock/nock) — HTTP interceptor
- [tape-nock](https://github.com/Flet/tape-nock) — nock.back() VCR pattern (primary inspiration)
- [nock-vcr](https://github.com/carbonfive/nock-vcr) — manual recorder pattern (reference)
- [replayer](https://github.com/aneilbaboo/replayer) — VCR_MODE naming convention
