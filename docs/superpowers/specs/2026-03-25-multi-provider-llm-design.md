# Multi-Provider LLM Client Design

## Problem

The current `LLMClient` (`src/ai-game-master/llm-client.ts`) is hardcoded to the Anthropic SDK. This prevents:
- Running different players on different models (e.g., Claude vs GPT vs Gemini in the same game) for model comparison
- Switching providers without code changes (vendor lock-in)

## Decision

Replace the Anthropic-specific `LLMClient` with direct usage of the **Vercel AI SDK** (`ai` + `@ai-sdk/*` provider packages).

### Why Vercel AI SDK

- TypeScript-native with first-class Zod support
- Translates `toolChoice` across providers (Anthropic, OpenAI, Google, etc.) — the core feature both game master and players need
- Provider registry resolves `'provider:model'` strings to model instances — serializable for game configs and JSONL logs
- ~85k GitHub stars, actively maintained, 30+ provider integrations
- No extra infrastructure (vs LiteLLM proxy, OpenRouter)

### Why not alternatives

| Alternative | Reason to reject |
|---|---|
| OpenAI-compat endpoints | Anthropic doesn't offer one |
| OpenRouter | Latency/cost overhead, third-party dependency, bad for benchmarking |
| LiteLLM | Python-only; TS usage requires running a proxy server |
| DIY adapters | Rebuilds what the AI SDK already does; high maintenance |

## Design

### Overview

- **Delete** `src/ai-game-master/llm-client.ts` — no shared LLM wrapper class
- **New** `src/core/llm-registry.ts` — exports a configured provider registry
- **Edit** `src/ai-game-master/game-master.ts` — call `generateText()` directly
- **Edit** `src/players/llm-player.ts` — call `generateText()` directly
- **Edit** tests for both consumers

### Model String Convention

Models are identified by `'provider:model'` strings (AI SDK native format):

```
'anthropic:claude-sonnet-4-20250514'   (default)
'openai:gpt-4o'
'google:gemini-2.0-flash'
```

This format is serializable (works in game configs and JSONL logs) and resolved by the provider registry at call time.

### Provider Registry

```ts
// src/core/llm-registry.ts
import { createProviderRegistry } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

export const registry = createProviderRegistry({
  anthropic,
  openai,
  google,
});

export const DEFAULT_MODEL = 'anthropic:claude-sonnet-4-20250514';
```

- Registers Anthropic, OpenAI, and Google providers
- API keys via environment variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- If a key is missing, the AI SDK throws at call time — clear error, no silent failures
- Adding a new provider = one import + one registry entry

### Consumer Pattern

Both `LLMPlayer` and `AIGameMaster` follow the same pattern:

```ts
import { generateText, tool } from 'ai';
import { registry, DEFAULT_MODEL } from '../core/llm-registry.js';

// Inside act() or similar method:
const result = await generateText({
  model: registry.languageModel(this.model),
  system: systemPrompt,
  messages,
  tools: {
    [toolName]: tool({
      description: toolDescription,
      parameters: actionSchema,  // Zod schema directly
    }),
  },
  toolChoice: { type: 'tool', toolName },
});

return result.toolCalls[0].args;
```

### LLMPlayer Changes

```ts
interface LLMPlayerOptions {
  model?: string     // default: DEFAULT_MODEL
  persona?: string
}
```

- Removes `apiKey` field — environment variables handle auth
- `act()` calls `generateText()` with forced tool use
- Zod action schema passed directly to AI SDK `tool()` (AI SDK supports Zod natively — no manual `z.toJSONSchema()` needed)

### AIGameMaster Changes

- Constructor takes `model?: string` instead of `LLMClientOptions`
- Each `init()`/`handleResponse()` call uses `generateText()` directly
- Same forced tool use pattern as LLMPlayer

### Dependency Changes

**Add:**
- `ai` (core AI SDK)
- `@ai-sdk/anthropic`
- `@ai-sdk/openai`
- `@ai-sdk/google`

**Remove:**
- `@anthropic-ai/sdk`

### Testing

- Existing tests mock `LLMClient` — update to mock `generateText()` from `ai`
- The AI SDK provides mock utilities via `ai/test`, or mock at the module level
- No integration tests against real APIs — engine validates with `safeParse()` + retry
- Only Anthropic API key required for manual end-to-end testing

## Caveats

- Structured output strictness varies by provider (OpenAI enforces server-side, others don't). Not an issue — the engine already validates responses with `actionSchema.safeParse()` and retries.
- Google Gemini has schema subset restrictions (no `z.union`, `z.record`). Not a blocker for current game schemas.
- Per-provider configuration (custom headers, base URLs) is possible at the registry level if needed later.

## Scope

This change is limited to the LLM plumbing layer. No changes to:
- `Player` or `Game` interfaces
- `Engine`, `Recorder`, events
- Game-specific code
- JSONL output format
