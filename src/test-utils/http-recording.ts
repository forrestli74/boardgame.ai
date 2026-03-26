import nock from 'nock'
import { expect, onTestFinished } from 'vitest'
import { mkdirSync } from 'fs'
import path from 'path'

const nockBack = nock.back

// Track used fixture names to catch collisions (tape-nock pattern)
const usedFixtureNames = new Set<string>()

export function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Blacklist approach (industry standard — used by Ruby VCR, VCRpy, tape-nock)
const SENSITIVE_HEADERS = ['authorization', 'x-goog-api-key', 'x-api-key']
const SENSITIVE_QUERY_PARAMS = [/key=[^&]+/g, /token=[^&]+/g]

export function scrubScopes(scopes: nock.Definition[]): nock.Definition[] {
  return scopes.map(scope => {
    let scrubbedPath = scope.path as string
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

/**
 * Enable HTTP record/replay for the current test.
 * Call at the top of any test that makes real HTTP calls.
 *
 * Modes (via VCR_MODE env var, maps directly to nock.back modes):
 *   - dryrun (default): replay from cassette if exists, pass through if not, no saving
 *   - record: replay from cassette if exists, record + save new cassettes
 *   - lockdown: replay from cassette only, fail if missing
 *   - wild: bypass all fixtures, always hit real API
 */
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
    nockBack.setMode(process.env.VCR_MODE as nock.BackMode)
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
