# Stack Research

**Domain:** LLM agent framework for social deduction board games (TypeScript/pnpm)
**Researched:** 2026-03-21
**Confidence:** HIGH (all major choices verified against current npm/official sources)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.x | Language | Non-negotiable constraint; strict mode for game state correctness |
| Node.js | 20+ LTS | Runtime | LTS, required by commander v14; tsx runs on it natively |
| Vercel AI SDK (`ai`) | 6.x (6.0.116) | Multi-provider LLM unification | Single API for OpenAI/Anthropic/Google; `generateObject` + Zod gives typed agent decisions; active (published 15 days ago); v6 adds agentic loop control and structured output at end of tool loops |
| `@ai-sdk/openai` | 1.x | OpenAI provider | Official AI SDK provider, maintained by Vercel |
| `@ai-sdk/anthropic` | 3.x (3.0.58) | Anthropic provider | Official AI SDK provider, maintained by Vercel |
| `@ai-sdk/google` | latest | Google provider | Official AI SDK provider, maintained by Vercel |
| Zod | 4.x | Schema validation + LLM output typing | Required by AI SDK for structured outputs; `generateObject` uses Zod schemas to enforce typed game decisions; v4 is current (zero deps, 2kb) |
| Commander.js | 14.x (14.0.2) | CLI argument parsing | Most widely used Node CLI framework; full TypeScript support; requires Node 20+; minimal, no magic |
| `@clack/prompts` | 1.x (1.1.0) | Interactive CLI prompts | Beautiful interactive prompts (spinners, select, confirm); complements Commander for interactive session setup; active (published 14 days ago) |
| Pino | 10.x (10.3.1) | Structured JSON logging | Fastest Node.js logger; outputs newline-delimited JSON natively — critical for machine-readable game logs used in training pipelines; 9k+ dependents; active |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino-pretty` | 13.x | Human-readable dev log formatting | Dev only — pipe pino output through it for readable terminal output; never in batch/production mode |
| `tsx` | 4.x | TypeScript execution (dev) | Fast esbuild-based TS runner; replaces ts-node; ~2x faster on medium projects; use for `pnpm dev` |
| `zod-to-json-schema` | latest | Zod → JSON Schema conversion | Needed if any LLM provider requires raw JSON Schema instead of Zod object; use only when provider doesn't accept Zod directly |
| `p-limit` | 5.x | Concurrency limiter | Batch mode: cap parallel game executions to avoid API rate limits; pure ESM, zero deps |
| `dotenv` | 16.x | Environment variable loading | API key management for OpenAI/Anthropic/Google; use `dotenv/config` import pattern |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | 4.x (4.1.0) | Testing framework | Fastest TypeScript-native test runner; no Vite app needed — works standalone; watch mode for game logic TDD |
| `tsx` | TS execution | `tsx watch src/index.ts` for dev; `tsx src/index.ts` for one-off runs |
| `tsc --noEmit` | Type checking | Run separately from tsx (tsx skips type checking by design); add as `pnpm typecheck` |
| ESLint + `@typescript-eslint` | Linting | Standard TS linting; no special config needed for this domain |

## Installation

```bash
# Phase 1: Core types + logging
pnpm add zod pino
pnpm add -D typescript tsx vitest pino-pretty @types/node

# Phase 3 (LLM agents): AI SDK
# pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google

# Phase 4 (CLI):
# pnpm add commander @clack/prompts dotenv

# Phase 5 (Batch):
# pnpm add p-limit
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vercel AI SDK (`ai` v6) | LangChain.js | Never for this project — LangChain is overengineered for direct LLM calls; AI SDK is leaner, better typed, and purpose-built for TypeScript |
| Vercel AI SDK | Raw provider SDKs (`openai`, `@anthropic-ai/sdk`) | Only if you need a provider-specific feature (e.g., Anthropic's extended thinking API) not yet surfaced by AI SDK |
| Pino | Winston | Winston if you need multiple simultaneous transports (e.g., file + HTTP sink); for this project, pino + stdout redirection is sufficient |
| `@clack/prompts` | Ink (React TUI) | Ink if the CLI grows into a persistent interactive dashboard; overkill for simple session-setup prompts |
| Commander.js | Yargs | Yargs if you need complex argument coercion and middleware chains; Commander is simpler for the command surface this project needs |
| Hand-rolled game engine | boardgame.io | boardgame.io last published 3 years ago (v0.50.2, 2022); abandoned; do not use |
| Vitest | Jest | Jest requires extra TS transform config; Vitest works natively with TypeScript, faster, better ESM support |
| `tsx` | `ts-node` | ts-node if you need full type checking at execution time; tsx is ~2x faster and sufficient for dev iteration |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| boardgame.io | Abandoned — last npm publish 3 years ago (v0.50.2); no active maintenance; community forks are unmaintained | Hand-roll a thin game engine (~200 lines); Avalon state fits cleanly in a plain TypeScript class |
| LangChain.js | Heavy abstraction layer that obscures LLM calls; poor TypeScript ergonomics; chaining model changes away from your control; AI SDK does 90% of what LangChain does with 10% of the API surface | Vercel AI SDK |
| `ts-node` | Slow (~2x slower than tsx on medium projects); ESM support requires extra config; maintenance slower | `tsx` |
| Winston | 10x slower than pino; JSON output requires config; logs for training pipelines need clean newline-delimited JSON by default | Pino |
| `@google-cloud/aiplatform` (Vertex) | Vendor-specific SDK; AI SDK's `@ai-sdk/google` covers Gemini via Google AI Studio; use Vertex only if enterprise auth is a hard requirement | `@ai-sdk/google` |
| Ink (React TUI) | Overkill for a session-configuration CLI; adds React to the dep tree for no gain | `@clack/prompts` for interactive parts, Commander for argument parsing |

## Stack Patterns by Variant

**For the game engine (Avalon):**
- Do NOT use a game framework library
- Model `GameState` as a plain TypeScript interface/class with immutable transitions
- Each phase (team proposal, voting, quest) is a pure function: `(state, action) => state`
- This makes testing trivial and state serializable to JSON for logs

**For LLM agent decisions:**
- Use `generateObject` from AI SDK with a Zod schema per decision type
- Schema per decision: `ProposalDecision`, `VoteDecision`, `QuestDecision`, `AssassinationDecision`
- Each agent call returns a typed object, never raw text — eliminates parsing failures

**For batch mode:**
- Run game sessions as async functions, parallelize with `p-limit`
- Set limit based on provider rate limits (OpenAI: ~60 RPM tier 1, recommend limit of 5-10 concurrent games)
- Stream logs to files: `pino({ transport: { target: 'pino/file', options: { destination: 'games/run-001.jsonl' } } })`

**For multi-provider configuration:**
- Accept model strings at runtime: `openai:gpt-4o`, `anthropic:claude-3-5-sonnet-20241022`, `google:gemini-2.0-flash`
- AI SDK resolves provider from string prefix — no conditional code per provider
- Each agent in a game can use a different provider/model

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ai` ^6.0 | `@ai-sdk/openai` ^1.x, `@ai-sdk/anthropic` ^3.x, `@ai-sdk/google` ^1.x | Provider major versions must match AI SDK major; do not mix v5 core with v3 providers |
| `commander` ^14.0 | Node.js ^20.0 | v14 dropped Node 18 support |
| `vitest` ^4.0 | Node.js ^18 | v4 released Jan 2026; no Vite app required for pure Node testing |
| `zod` ^4.0 | `ai` SDK 6.x | AI SDK uses Zod internally; keep on same major |
| `pino` ^10.0 | Node.js ^18 | pino v10 requires Node 18+; pino-pretty must be installed separately |

## Sources

- [ai - npm](https://www.npmjs.com/package/ai) — current version 6.0.116, verified 2026-03-21
- [AI SDK 6 - Vercel](https://vercel.com/blog/ai-sdk-6) — v6 feature summary, v3 LM spec, backwards compat
- [@ai-sdk/anthropic - npm](https://www.npmjs.com/package/@ai-sdk/anthropic) — version 3.0.58, verified active
- [AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers) — OpenAI, Anthropic, Google provider packages confirmed
- [Zod - GitHub](https://github.com/colinhacks/zod) — v4.x current, zero deps, TypeScript-first (HIGH confidence)
- [commander - npm](https://www.npmjs.com/package/commander) — v14.0.2 current, Node 20+ required (HIGH confidence)
- [@clack/prompts - npm](https://www.npmjs.com/package/@clack/prompts) — v1.1.0, published 14 days ago (HIGH confidence)
- [pino - npm](https://www.npmjs.com/package/pino) — v10.3.1 current (HIGH confidence)
- [vitest - npm](https://www.npmjs.com/package/vitest) — v4.1.0, published 9 days ago (HIGH confidence)
- [boardgame.io - npm](https://www.npmjs.com/package/boardgame.io) — v0.50.2, last published 3 years ago — abandoned (HIGH confidence)
- [TSX vs ts-node - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/tsx-vs-ts-node/) — tsx recommended for modern projects (MEDIUM confidence)

---
*Stack research for: LLM agent framework for social deduction board games*
*Researched: 2026-03-21*
