# BoardGame.AI

Framework for LLM agents to play social deduction board games (starting with Avalon), producing structured JSONL logs for training data.

## Current State

- **Phase 1 complete** — core types, engine, recorder, events.
- **Phase 2 next** — Avalon rules (deterministic, no LLMs needed)
- `src/core/` is stable. `src/games/ai_game/` is experimental/WIP.

## Stack

- TypeScript (ES2022, Node16 modules, strict mode)
- Zod v4 for runtime validation
- Pino for logging/recording
- Vitest for testing
- pnpm as package manager

## Commands

- `pnpm test` — run all tests (vitest)
- `pnpm run typecheck` — type-check without emitting
- `pnpm run dev` — run dev server with tsx watch

## Docs

- `docs/project.md` — vision, constraints, out-of-scope
- `docs/requirements.md` — requirement IDs, traceability, links to TIDE tasks
- `docs/roadmap.md` — phase ordering and rationale
- `docs/architecture.md` — components, data flow, project structure, anti-patterns
- `docs/type-system-options.md` — design decisions (no generics, unknown views, Zod validation)
- `docs/game-loop.md` — step-by-step lifecycle, example walkthrough, JSONL output
- `docs/implementing-a-game.md` — how to implement `Game`, checklist, patterns
- `docs/pitfalls.md` — 8 critical pitfalls with prevention strategies
- `docs/stack.md` — technology choices, alternatives, version compatibility
- `docs/features.md` — MVP definition, feature priority, competitor comparison
- `docs/community-growth.md` — community/growth strategy

## Source

- `src/core/` — framework types, engine, recorder, events
- `src/games/ai_game/` — LLM-powered game master (experimental/WIP)

## Conventions

- Tests co-located with source (`*.test.ts` next to `*.ts`)
- ESM (`"type": "module"`, `.js` extensions in imports)
