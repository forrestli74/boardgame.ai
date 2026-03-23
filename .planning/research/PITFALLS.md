# Pitfalls Research

**Domain:** LLM Agent Framework for Social Deduction Board Games (Avalon)
**Researched:** 2026-03-21
**Confidence:** MEDIUM (WebSearch + academic papers; no production deployments to verify against)

---

## Critical Pitfalls

### Pitfall 1: Hidden Information Leakage Into Agent Context

**What goes wrong:**
Evil player agents receive game state objects containing all hidden role assignments, not just what they legitimately know. Or the game state serialized into a prompt includes fields like `{role: "Merlin", knownEvil: ["player2", "player4"]}` even for players who shouldn't see that data. The LLM then "knows" things it shouldn't, invalidating all game logic and making logs useless for training.

**Why it happens:**
The same game state object is used for orchestration (where complete information is needed) and for building player prompts (where information must be filtered). Developers pass the full state to a generic `buildPrompt(state, player)` helper and forget that serialization exposes all fields. TypeScript's structural typing gives no runtime protection — a `GameState` object passed to a function doesn't enforce that only a `PlayerView` subset reaches the LLM.

**How to avoid:**
Game holds state internally and only exposes filtered views through ActionRequest as `unknown`. The Engine and Player never have access to raw game state — only the view the Game constructs. Add a test for each role that asserts which fields are present and absent in their view.

**Warning signs:**
- Evil agents "accidentally" avoid nominating Merlin in the late game at above-random rates even in early tests
- Player or prompt builder has access to anything other than the ActionRequest view
- Log output shows role fields in per-player prompt sections

**Phase to address:** Phase 1 (core data model) — Game holds state internally; view is `unknown` in ActionRequest

---

### Pitfall 2: LLM Agents Revealing Their Hidden Role in Discussion

**What goes wrong:**
Evil agents announce their allegiance directly in discussion text. E.g., an evil player says "I am on the evil team so I voted to fail the quest." This is documented extensively in the AvalonBench paper: agents fail to sustain deception even when explicitly instructed not to reveal their role.

**Why it happens:**
LLMs are trained on helpfulness — they default to being transparent and cooperative. Role-play instructions like "you are evil but must pretend to be good" conflict with trained behavior. Without a structured reasoning step that models the strategic cost of disclosure, the LLM takes the path of least confusion: being honest about its situation.

**How to avoid:**
Add a private reasoning chain (scratchpad) step before discussion output. The scratchpad prompt asks the agent to reason about what information is safe to share and what would reveal their role, then produce a separate public statement. Keep scratchpad output in the structured log but never expose it to other agents. Validate public statements with a secondary check: does the text contain role names or explicit allegiance claims?

**Warning signs:**
- First 5 test games show evil players losing at a rate > 85%
- Discussion text contains words like "evil," "fail," or role names ("Mordred," "Minion") spoken by non-Merlin good players
- Prompt system messages don't distinguish between private reasoning and public speech

**Phase to address:** LLM agent prompt engineering phase

---

### Pitfall 3: Flat Prompt Architecture That Prevents Role Differentiation

**What goes wrong:**
All agents share one prompt template with a role field substituted in. The system prompt says "You are Player 3. Your role is Merlin." This gives Merlin and Percival the same reasoning structure as Minions, even though their information asymmetries and optimal strategies are completely different. Agents play poorly and produce low-quality training data.

**Why it happens:**
Starting simple is reasonable, but role-specific strategy and information exposure are fundamental to Avalon — they're not edge cases. A single template treats role as a cosmetic variation rather than a structural difference in knowledge, goals, and constraints.

**How to avoid:**
Build role-specific prompt components from the start. Each role has a distinct system prompt section covering: what they know (information structure), what they're trying to achieve (win condition), and what risks they face (what could betray them). Share scaffolding (output format, game rules summary) but keep role logic separate and independently testable.

**Warning signs:**
- A single `getSystemPrompt(role: Role)` function with a switch statement returning mostly identical text
- Merlin doesn't vote differently from vanilla Good players in early quests
- No per-role prompt tests in the test suite

**Phase to address:** LLM agent prompt engineering phase, before batch runs

---

### Pitfall 4: Context Window Growth Across Long Games

**What goes wrong:**
The full game history (all discussion rounds, all votes, all quest results) is appended to every prompt. By rounds 4–5 of a 5-round Avalon game with 7 players generating discussion, the context can exceed 20K tokens per call, multiplied across all players per phase. Batch mode amplifies this: 100 parallel games × 7 players × ~$0.15/call = surprise billing event.

**Why it happens:**
The naive implementation appends events to a history list and serializes the whole thing. It works in tests on short games but becomes expensive and slow at scale. The "Lost in the Middle" phenomenon means that long contexts don't even help agents reason better — they miss relevant information buried in the middle.

**How to avoid:**
Implement event filtering from the start. Each agent's context should receive only: the current game phase, their private knowledge, and a compressed recent history (last N events + key facts). Design the `PlayerView` type to support this scoping. Measure token usage per call in development and set a soft token budget per agent per decision point.

**Warning signs:**
- Prompt builders serialize the entire event history without filtering
- No token counting in the codebase
- Test games with 7 players feel slow after round 3
- No distinction between "current game state" and "historical event log"

**Phase to address:** Game engine data model phase (design for scoped views from the start) and batch execution phase (enforce budgets)

---

### Pitfall 5: Structured Output Brittleness Across Models

**What goes wrong:**
The agent returns a valid `TeamNominationAction` object when using GPT-4o, but when swapped to Claude or a smaller model it returns prose with an embedded JSON block, or a JSON object with unexpected field names (`players_nominated` instead of `nominatedPlayers`). The parser crashes and the game hangs, requiring manual intervention.

**Why it happens:**
Different models have different adherence to structured output instructions. Even with native structured output APIs, edge cases (refusals, max token truncation, ambiguous instructions) produce malformed output. Developers test with one model and assume portability.

**How to avoid:**
Use provider-native structured output (OpenAI `response_format`, Anthropic tool use with schema) with Zod schema validation as the contract. Never trust unvalidated output. Implement a retry-with-clarification loop: if parsing fails, send the failed output back with "Your response was not valid JSON matching the required schema. Please try again." Cap retries at 3 and surface a structured error event rather than crashing.

**Warning signs:**
- `JSON.parse(response.content)` anywhere in the codebase without a Zod `.parse()` call
- No retry logic around LLM calls
- Tests only use one model provider
- Type casting via `as ActionType` without runtime validation

**Phase to address:** LLM integration foundation phase

---

### Pitfall 6: Over-Engineering Game-Agnostic Abstractions Too Early

**What goes wrong:**
Weeks are spent building a generic `Game<TState, TAction, TPhase>` generic framework with plugin registries, event buses, and abstract base classes before a single game rule works. When Avalon's specific mechanics (the Lady of the Lake, special role abilities) don't fit the abstraction, the framework gets forced and becomes harder to work with than a direct implementation.

**Why it happens:**
The requirement says "game-agnostic" which reads as "build the framework first." But frameworks emerge from working implementations — they're extracted, not designed upfront. Designing for two games (Avalon + an imaginary second game) before shipping one leads to abstractions that serve neither well.

**How to avoid:**
Build Avalon directly first. Use plain TypeScript interfaces, not abstract classes. After Avalon is complete, identify what actually varied across game phases and extract only those boundaries. The rule: abstract when you have two concrete examples, not before. The game-agnostic interface should be defined after Avalon, not before.

**Warning signs:**
- Abstract base classes or generic type parameters before Avalon rules are implemented
- "We'll need this for future games" justifications in code review
- More files in `/engine/core` than in `/engine/avalon`
- Difficulty writing the first Avalon quest phase without touching the core framework

**Phase to address:** Architecture/foundation phase — set explicit policy of "Avalon first, extract later"

---

### Pitfall 7: Race Conditions in Batch Parallel Game Execution

**What goes wrong:**
100 games run concurrently with `Promise.all()`. All games simultaneously hit their first LLM call, producing 700 concurrent API requests (100 games × 7 players). The API rate limiter returns 429s, the retry logic amplifies the problem, and the batch completes in 3× the expected time with many games failing silently.

**Why it happens:**
`Promise.all()` on an unbounded array fires everything at once. Developers test with 5 games, which works fine, then discover the batch mode ceiling only in production.

**How to avoid:**
Use a concurrency-limited queue (e.g., `p-limit` or a custom semaphore) that caps concurrent LLM calls to a number calibrated to the API tier limits. Separate game-level concurrency (how many games run simultaneously) from call-level concurrency (how many LLM calls are in-flight). Implement per-provider token-per-minute tracking. Fail fast with a clear error if the configured concurrency would exceed estimated API limits.

**Warning signs:**
- `Promise.all(games.map(...))` in the batch runner
- No rate limiting configuration in the CLI
- 429 errors in any test batch runs
- No concept of a "concurrency budget" in the architecture

**Phase to address:** Batch execution phase

---

### Pitfall 8: Training Data Schema Designed After the Fact

**What goes wrong:**
Game logs are structured for human readability (narrative text, embedded reasoning in prose), not for downstream ML pipelines. When it comes time to use the logs for fine-tuning, every field has to be re-parsed, reasoning traces are mixed with game events, and cross-game comparison requires custom extraction scripts. The data is technically present but ML-unusable.

**Why it happens:**
Logging is treated as an afterthought. The game runs correctly first, then someone adds `console.log` or a basic JSON dump. The structure reflects implementation internals rather than the data model a training pipeline would want.

**How to avoid:**
Define the log schema as a first-class artifact before writing engine code. Each log entry should be a typed event with framework fields (`gameId`, `playerId`, `action`, `phase`, `timestamp`) and game-specific data in `metadata`. The training pipeline consumer should be a stakeholder in schema design. Validate every emitted log entry against the schema at emit time.

**Warning signs:**
- Log entries are strings or nested objects without a defined TypeScript type
- Reasoning traces aren't separated from game events
- No `gameId` or `roundId` fields for joining across events
- No schema documentation exists alongside the code

**Phase to address:** Core data model / logging phase (must precede game engine implementation)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Expose game state outside the Game class | Simpler code | Hidden information leakage, invalid training data | Never |
| Single prompt template for all roles | Fast to iterate | Poor agent performance, no role differentiation | Never |
| `Promise.all()` for batch games | Simple code | API rate limit explosions at scale | Only for ≤5 games in tests |
| `JSON.parse()` without Zod validation | Less boilerplate | Silent type mismatches, runtime crashes in batch | Never in production paths |
| Flat event log (no typed schema) | Faster to ship | All training data requires re-processing | Never if ML use is a goal |
| Generics / abstract base classes before Avalon works | Feels extensible | Framework fights concrete game mechanics | Never — use `unknown` at boundaries |
| Append full history to every prompt | No filtering logic needed | Token costs explode in batch, context poisoning | Only for single-game prototyping |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI structured output | Using `response_format: {type: "json_object"}` without a schema | Use `response_format: {type: "json_schema", json_schema: {...}}` with a full Zod-derived schema |
| Anthropic tool use | Defining tools with loose `object` types | Use explicit required fields and `additionalProperties: false` |
| Multiple LLM providers | Assuming the same prompt works across providers | Test each role prompt against every supported model; expect divergence |
| API rate limits | Using a single shared client for all concurrent games | Use per-game clients or a shared client with a concurrency limiter aware of token budgets |
| Long game logs | Writing to a single file per batch | Write per-game log files; append to a batch manifest; enables partial recovery |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full history in every prompt | Slow responses after round 3, high token costs | Scope history to relevant recent events per agent per call | ~4 rounds with 7 players (>15K tokens/call) |
| Unbounded `Promise.all()` on batch | 429 rate limit errors, erratic completion times | p-limit concurrency cap calibrated to API tier | >10 concurrent games |
| Synchronous game loop (no async) | Entire batch blocks on one slow LLM call | Async game runner from the start | Immediately in batch mode |
| Per-call provider client instantiation | Slow client setup overhead multiplied across thousands of calls | Single shared client instance with connection pooling | >500 games in a batch |
| In-memory log accumulation | OOM errors in large batches | Stream log events to disk immediately, not at game end | ~500 games with verbose logging |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding API keys in game config files | Key exposure in logs or version control | Require keys via environment variables only; never accept in config files |
| Logging full LLM request/response bodies | API key in request headers, PII in content | Log sanitized versions; exclude auth headers; truncate large payloads in debug logs |
| Trusting LLM output without validation | Agent outputs malformed action that corrupts game state | Validate every action against game rules before applying; treat LLM output as untrusted input |
| Sharing role information across agent contexts | Cross-contamination: one agent sees another's private knowledge | Strict per-agent context isolation; no shared mutable state between agent instances |

---

## "Looks Done But Isn't" Checklist

- [ ] **Hidden information isolation:** Verify by running a test where Merlin checks what evil players see in their prompt — their view must not include Merlin's identity
- [ ] **Structured output validation:** Verify that an intentionally malformed LLM response triggers a retry, not a crash
- [ ] **Role-differentiated prompts:** Verify that Minion and Merlin receive substantively different system prompts with different information sections
- [ ] **Batch concurrency limits:** Verify that running 50 games simultaneously produces no 429 errors and completes in expected time
- [ ] **Log schema completeness:** Verify that log files can reconstruct full game state from scratch for any game, and that each entry has `gameId`, `roundId`, `playerId`, `timestamp`
- [ ] **Game-agnostic boundary:** Verify that the Avalon implementation doesn't bleed game-specific logic into the core engine (i.e., no Avalon role names referenced in engine/ files)
- [ ] **Context scoping:** Verify that player prompts in round 5 are not materially longer than round 1 prompts (growth bounded by recent-history window)
- [ ] **Evil agent deception baseline:** Verify that evil agents do not mention their role or allegiance in any discussion output across 20 test games

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Hidden information leakage discovered after logs generated | HIGH | Audit all generated data; discard affected games; redesign PlayerView type; regenerate |
| Flat log schema after large batch | HIGH | Write migration scripts to re-parse and re-structure; likely need to re-run some games where data is unrecoverable |
| Over-engineered abstraction framework | MEDIUM | Identify the Avalon-specific code paths, extract them from the framework, simplify interfaces incrementally |
| Role prompt brittleness discovered in batch | MEDIUM | Stop batch; patch prompts per role; regression test all roles; resume |
| Batch concurrency explosion | LOW | Add `p-limit`; rerun failed games using their logged seeds |
| Structured output parsing failure | LOW | Add Zod validation + retry loop; no data loss if game state is persisted separately from LLM calls |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hidden information leakage | Phase 1: Core data model | Game holds state internally; ActionRequest view is `unknown`; test each role's view in Phase 2 |
| Training data schema designed after the fact | Phase 1: Core data model | Schema TypeScript types defined and reviewed before engine implementation begins |
| Context window growth | Phase 1: Core data model | ActionRequest view is game's responsibility; game controls what history to include |
| Flat prompt architecture | Phase 2: LLM agent integration | Per-role prompt templates exist as separate artifacts, each with a unit test |
| LLM agents revealing hidden roles | Phase 2: LLM agent integration | 20-game smoke test shows < 5% role-disclosure rate in discussion text |
| Structured output brittleness | Phase 2: LLM agent integration | Integration tests run against all supported model providers |
| Over-engineered abstractions | Phase 1 + 2: Actively deferred | No generics or abstract base classes; `unknown` at framework boundaries |
| Batch concurrency explosion | Phase 3: Batch execution | Load test with 50 games; verify no 429 errors; token budget tracked per game |
| Race conditions in batch | Phase 3: Batch execution | Concurrency limiter present; configurable via CLI flag |

---

## Sources

- [AvalonBench: Evaluating LLMs Playing the Game of Avalon](https://arxiv.org/abs/2310.05036) — empirical evidence of LLM failure modes (role disclosure, poor deduction)
- [LLM-Based Agent Society Investigation: Collaboration and Confrontation in Avalon Gameplay](https://arxiv.org/html/2310.14985v4) — persuasion and information asymmetry challenges
- [How I Built an LLM-Based Game from Scratch](https://towardsdatascience.com/how-i-built-an-llm-based-game-from-scratch-86ac55ec7a10/) — information leakage / spoiler problem in LLM game contexts
- [Why do Multi-Agent LLM Systems Fail](https://galileo.ai/blog/multi-agent-llm-systems-fail) — specification and design flaws as root cause of agent failures
- [Multi-agent LLM context engineering](https://weaviate.io/blog/context-engineering) — context poisoning and distraction patterns
- [Prompt Rate Limits & Batching](https://dev.to/superorange0707/prompt-rate-limits-batching-how-to-stop-your-llm-api-from-melting-down-56e1) — concurrency and rate limit management
- [LLM Structured Output in 2026](https://dev.to/pockit_tools/llm-structured-output-in-2026-stop-parsing-json-with-regex-and-do-it-right-34pk) — structured output reliability across providers
- [TypeScript & LLMs: Lessons Learned from 9 Months in Production](https://johnchildseddy.medium.com/typescript-llms-lessons-learned-from-9-months-in-production-4910485e3272) — production TypeScript LLM integration pitfalls
- [Game Programming Patterns — Architecture, Performance, and Games](https://gameprogrammingpatterns.com/architecture-performance-and-games.html) — premature abstraction costs
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — prompt injection and system prompt leakage

---
*Pitfalls research for: LLM Agent Framework / Social Deduction Board Games (Avalon)*
*Researched: 2026-03-21*
