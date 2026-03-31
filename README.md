# BoardGame.AI

Framework for LLM agents to play social deduction board games (starting with Avalon), producing structured JSONL logs for training data.

## Current State

- **Phase 1–3 complete** — core framework, Avalon rules, LLM agents, discussion
- **Phase 4 complete** — CLI runner with batch mode
- `src/core/` is stable. `src/games/ai_game/` is experimental/WIP.

## Stack

- TypeScript (ES2022, Node16 modules, strict mode)
- Zod v4 for runtime validation
- Pino for logging/recording
- Vitest for testing
- pnpm as package manager

## CLI Usage

```bash
# Single game
pnpm tsx src/cli/index.ts config.json

# Batch: 5 groups, rotate player positions, 3 parallel games
pnpm tsx src/cli/index.ts config.json --groups 5 --balance rotate --concurrency 3

# Custom output directory
pnpm tsx src/cli/index.ts config.json --output ./runs
```

**Flags:** `--groups N` (default 1), `--balance none|rotate|permute` (default none), `--concurrency N` (default 1), `--output dir` (default ./output)

See `docs/architecture.md` for config file format.

## Commands

- `pnpm test` — run all tests (vitest)
- `pnpm run typecheck` — type-check without emitting
- `pnpm run build` — compile TypeScript
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
- `src/cli/` — CLI entrypoint, config parsing, batch runner
- `src/games/avalon/` — Native Avalon implementation
- `src/games/ai_game/` — LLM-powered game master (experimental/WIP)
- `src/players/` — Player implementations (LLM player)

## Conventions

- Tests co-located with source (`*.test.ts` next to `*.ts`)
- ESM (`"type": "module"`, `.js` extensions in imports)
