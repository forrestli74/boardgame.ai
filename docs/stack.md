# Stack

## Core

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Strict mode, ES2022, Node16 modules |
| Zod | 4.x | Schema validation + type inference. Required by AI SDK for structured outputs |
| Pino | 10.x | JSONL structured logging. Outputs NDJSON natively |
| Vitest | 4.x | TypeScript-native test runner |
| tsx | 4.x | TypeScript execution (esbuild-based, replaces ts-node) |

## Planned (Later Phases)

| Technology | Version | Purpose | Phase |
|------------|---------|---------|-------|
| Vercel AI SDK (`ai`) | 6.x | Multi-provider LLM unification. `generateObject` + Zod for typed agent decisions | 3 |
| `@ai-sdk/openai` | 1.x | OpenAI provider | 3 |
| `@ai-sdk/anthropic` | 3.x | Anthropic provider | 3 |
| Commander.js | 14.x | CLI argument parsing. Requires Node 20+ | 4 |
| `@clack/prompts` | 1.x | Interactive CLI (spinners, selects) | 4 |
| `p-limit` | 5.x | Concurrency limiter for batch mode | 5 |
| dotenv | 16.x | API key management | 4 |

## Installation by Phase

```bash
# Phase 1 (done): Core types + logging
pnpm add zod pino
pnpm add -D typescript tsx vitest pino-pretty @types/node

# Phase 3: LLM agents
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic

# Phase 4: CLI
pnpm add commander @clack/prompts dotenv

# Phase 5: Batch
pnpm add p-limit
```

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Vercel AI SDK | LangChain.js | Overengineered for direct LLM calls; poor TypeScript ergonomics |
| Vercel AI SDK | Raw provider SDKs | Only if you need provider-specific features not surfaced by AI SDK |
| Pino | Winston | 10x slower; JSON output requires config |
| Commander.js | Yargs | Yargs for complex argument coercion; Commander is simpler here |
| Vitest | Jest | Jest requires extra TS transform config; slower ESM support |
| tsx | ts-node | ~2x slower; ESM requires extra config |
| Hand-rolled engine | boardgame.io | Abandoned (last published 2022) |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ai` ^6.0 | `@ai-sdk/openai` ^1.x, `@ai-sdk/anthropic` ^3.x | Provider major must match SDK major |
| `commander` ^14.0 | Node.js ^20.0 | Dropped Node 18 |
| `zod` ^4.0 | `ai` SDK 6.x | AI SDK uses Zod internally |
| `pino` ^10.0 | Node.js ^18 | pino-pretty installed separately |
