# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to Orient

**Do NOT scan, glob, or grep source files to understand the project.** The docs below contain everything you need. Only read source files when you need to **edit** them.

- Read the specific doc relevant to your task — not all of them:
  - Architecture, data flow, project structure → `docs/architecture.md`
  - Implementing a new game → `docs/implementing-a-game.md`
  - Engine game loop → `docs/game-loop.md`
  - Type system rationale → `docs/type-system-options.md`
  - What's done vs pending → `docs/requirements.md`
- For project description, stack, commands, conventions → `README.md`

## Commands

- `pnpm test` — run all tests
- `pnpm vitest run src/path/to/file.test.ts` — run a single test file
- `pnpm vitest run -t "test name"` — run a single test by name
- `pnpm run typecheck` — type-check without emitting
- `pnpm run build` — compile TypeScript
- `pnpm test:record` — re-record VCR cassettes (sets `VCR_MODE=record`)
- `pnpm test:ci` — run tests in lockdown mode (fails if cassette missing)

## Stack

- TypeScript (ES2022, Node16 modules, strict mode), ESM (`"type": "module"`, `.js` extensions in imports)
- Zod v4 for runtime validation, Pino for logging, Vitest for testing, pnpm package manager
- Vercel AI SDK (`ai` + `@ai-sdk/google`) for LLM calls — provider registry at `src/core/llm-registry.ts`
- `GEMINI_API_KEY` env var required for LLM tests/runs

## Key Conventions

- Tests co-located with source (`*.test.ts` next to `*.ts`)
- VCR cassettes used for LLM tests (nock) — **never delete cassettes**, they take very long to re-record
- Games are generator-based state machines (`play()` yields `GameResponse`, returns `GameOutcome`)
- Players receive opaque views + Zod action schemas — no game-specific logic in Player
- Engine is a mediator: stamps `seq/gameId/timestamp`, diffs requests, never contains game logic

## Rules

- The project uses TIDE task management.
- **Never read source files unless you are about to edit them or docs don't cover what you need.** Read docs first. If you must explore source to fill a gap, update the relevant doc with your findings.
- **Keep README.md and docs up to date.** After making changes, update any affected docs.
