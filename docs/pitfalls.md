# Pitfalls

Critical pitfalls for LLM agent board game frameworks, ordered by recovery cost.

## 1. Hidden Information Leakage (HIGH recovery cost)

Full game state reaches player prompts — agents "know" things they shouldn't, invalidating all training data.

**Prevention**: Game holds state internally, only exposes filtered views via `ActionRequest.view: unknown`. Engine/Player never access raw state. Test each role's view for correct field presence/absence.

**Warning signs**: Evil agents avoid Merlin at above-random rates; player code has access to anything beyond ActionRequest view.

## 2. Training Data Schema Designed After the Fact (HIGH recovery cost)

Logs structured for readability, not ML pipelines. Reasoning mixed with events. No `gameId`/`playerId` for joining.

**Prevention**: Define log schema as first-class artifact before engine code. Validate every emitted event against schema at emit time.

## 3. LLM Agents Revealing Hidden Role in Discussion (MEDIUM)

Evil agents announce allegiance directly. Documented in AvalonBench: LLMs default to transparency over deception.

**Prevention**: Private scratchpad reasoning step before public statement. Validate public text for role name disclosures.

## 4. Flat Prompt Architecture (MEDIUM)

Single prompt template for all roles. Merlin and minions get same reasoning structure despite completely different information asymmetries.

**Prevention**: Role-specific prompt components from the start. Each role has distinct: what they know, what they're trying to achieve, what could betray them.

## 5. Context Window Growth (MEDIUM)

Full game history appended to every prompt. By round 4–5 with 7 players, >20K tokens/call. Batch amplifies costs.

**Prevention**: Scope each agent's context to current phase + private knowledge + bounded recent history. Design `view` to enforce this.

## 6. Structured Output Brittleness Across Models (LOW recovery)

Works with GPT-4o, breaks with Claude — different field names, prose with embedded JSON, truncation.

**Prevention**: Provider-native structured output + Zod validation on every response. Retry-with-clarification loop (max 3). Never `JSON.parse` without `.parse()`.

## 7. Batch Concurrency Explosion (LOW recovery)

100 games × 7 players = 700 concurrent API requests. Rate limiter returns 429s, retry amplifies.

**Prevention**: `p-limit` concurrency cap. Separate game-level from call-level concurrency. Per-provider token-per-minute tracking.

## 8. Over-Engineering Abstractions Early (MEDIUM)

Generic `Game<TState, TAction, TPhase>` before a single game works. When Avalon mechanics don't fit, framework fights back.

**Prevention**: Build Avalon directly first. Use `unknown` at boundaries, not generics. Abstract when you have two concrete examples.

## Technical Debt Patterns

| Shortcut | When Acceptable |
|----------|-----------------|
| Expose game state outside Game class | Never |
| Single prompt template for all roles | Never |
| `Promise.all()` for batch games | Only ≤5 games in tests |
| `JSON.parse()` without Zod validation | Never in production paths |
| Append full history to every prompt | Only for single-game prototyping |

## Sources

- [AvalonBench (arXiv 2310.05036)](https://arxiv.org/abs/2310.05036) — LLM failure modes in Avalon
- [LLM-Based Agent Society (arXiv 2310.14985)](https://arxiv.org/html/2310.14985) — information asymmetry challenges
- [Game Programming Patterns](https://gameprogrammingpatterns.com/architecture-performance-and-games.html) — premature abstraction costs
