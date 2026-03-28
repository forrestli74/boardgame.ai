# Integration Test Status

Updated: 2026-03-25

## Tic-Tac-Toe

- **Status**: Passes
- **Duration**: ~30s
- **Model**: `gemini-2.5-flash` (with thinking)

## Avalon (5-player)

- **Status**: Fails (fixable)
- **Model**: `gemini-2.5-flash` (with thinking)

### Root Cause: `maxOutputTokens` too low

Gemini 2.5 Flash uses "thinking" tokens (internal chain-of-thought) that count against the output token limit. The Avalon init call uses ~5K thinking + ~800 output = ~5.8K total, exceeding the 4096 limit. This causes `finishReason: error` with `"Malformed function call"` — the generation gets cut off mid-tool-call.

**Fix**: Increase `maxOutputTokens` from 4096 to 16384 in `game-master.ts`. Already applied.

### No-Thinking Mode

Tested with `thinkingConfig: { thinkingBudget: 0 }`:

- Game master produces correct state transitions (verified 5 turns)
- Role assignment, phase flow, quest config, simultaneous vote requests all correct
- **Seed-based leader selection is wrong** — model computed the wrong leader (bob instead of eve for seed=42). This is likely wrong with thinking too since LLMs can't reliably do modular arithmetic.
- Test timed out at 10 minutes — not a logic error, just many sequential LLM calls (~70+ per game at ~4s each)

### Cost Estimates (per full Avalon game, 5 LLM players)

| | With Thinking | No Thinking |
|---|---|---|
| Game Master | ~$0.37 | ~$0.04 |
| LLM Players | ~$0.11 | ~$0.01 |
| **Total** | **~$0.48** | **~$0.05** |

Thinking tokens are ~91% of total cost. No-thinking appears viable for correctness (except seed handling, which is unreliable either way).

### Architecture Note

The engine processes player actions one at a time via `Promise.race`. For simultaneous phases (team_vote, quest_execution), each individual vote triggers a separate `handleResponse` LLM call. A 5-player Avalon game requires ~70+ sequential LLM calls. This is correct behavior but slow and expensive — batching simultaneous actions into one `handleResponse` call would significantly reduce both.

## Pending Verification

- Full Avalon game completion with thinking + `maxOutputTokens: 16384`
- Leader rotation correctness across multiple quests
- Vote resolution (majority logic)
- Quest execution and scoring
- Assassination phase
- Game end conditions
