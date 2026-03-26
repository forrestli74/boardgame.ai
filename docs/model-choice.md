# Model Choice

Default model is `google:gemini-2.5-flash`, shared by both `AIGameMaster` and `LLMPlayer` via `DEFAULT_MODEL` in `src/core/llm-registry.ts`.

## Why not flash-lite?

`gemini-2.5-flash-lite` was the original default. Testing revealed it **cannot reliably serve as game master**.

### Tic-tac-toe (10 runs each, fixed predetermined moves)

| Model | Completed | Avg Steps | Result |
|-------|-----------|-----------|--------|
| `gemini-2.5-flash-lite` | 0/10 | 10 (max) | Never reaches terminal state |
| `gemini-2.5-flash` | 10/10 | 5.0 | Correct winner every time |

Flash-lite failure mode: it drops moves — returns unchanged game state after a valid player action. This causes the engine to loop on the same player indefinitely.

### Avalon (5-player, single init call)

- `gemini-2.5-flash` — fails to produce a tool call (finish reason: `error`). Avalon init has not been resolved yet.
- `gemini-2.5-flash-lite` — not tested for Avalon (would be worse given TTT results).

## Cost

| | Flash Lite | Flash |
|---|---|---|
| Input (per 1M tokens) | $0.075 | $0.15 |
| Output (per 1M tokens) | $0.30 | $0.60 |

Flash is 2x the price. Both are cheap — a full TTT game (~6 LLM calls) costs fractions of a cent.

## Future considerations

- Flash-lite may still work for `LLMPlayer` (simpler task: pick one action, no state maintenance). Splitting `DEFAULT_MODEL` into per-component defaults is an option if cost matters.
- Avalon requires further investigation — flash can't produce the init tool call either.
