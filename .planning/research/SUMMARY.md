# Project Research Summary

**Project:** boardgame.ai2 — LLM Agent Framework for Social Deduction Board Games
**Domain:** Multi-agent LLM simulation framework (Avalon, training data generation)
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a TypeScript CLI framework for running Avalon games with LLM agents as players, with the primary output being structured training data for downstream ML pipelines. Experts in this niche (AvalonBench, TextArena, GamingAgent) consistently build these systems with a layered architecture: a game-agnostic engine loop, game-specific rule implementations, and a player interface that LLMs implement. The key insight from existing work is that training data quality is a first-class concern, not a post-hoc feature — the log schema must be designed before the game engine, not after. The recommended approach is to use the Vercel AI SDK v6 with Zod-typed structured outputs for all agent decisions, build Avalon directly without a game framework library, and use Pino for structured JSONL logging that serves both human debugging and ML pipelines.

The biggest implementation risks are not technical but conceptual. Hidden information leakage — where agent prompts inadvertently expose role information the player shouldn't have — invalidates training data and is nearly impossible to detect after the fact. LLM agents also reliably fail to maintain deception without a separate private scratchpad reasoning step before generating public discussion text, a pattern documented across multiple Avalon LLM papers. Both of these require deliberate design decisions at the data model layer before any LLM integration begins.

The correct build order is: data model and log schema first, then Avalon rules, then LLM agent integration, then batch execution. This order is validated by the pitfall research: the two highest-recovery-cost failures (hidden information leakage, flat log schema) both occur if the game engine is built before the data model is locked. Batch mode should be deferred until single-game output quality is confirmed, as parallelism amplifies any data quality problems.

## Key Findings

### Recommended Stack

The stack is fully TypeScript on Node.js 20+ LTS, with Vercel AI SDK v6 as the single multi-provider LLM interface. AI SDK's `generateObject` combined with Zod schemas provides typed agent decisions without any parsing code — each agent call returns a validated TypeScript object. Commander.js handles CLI argument parsing, `@clack/prompts` handles interactive session setup, and Pino produces newline-delimited JSONL logs that go directly into ML pipelines without transformation. `p-limit` provides concurrency control for batch mode. No game framework library is needed or recommended — `boardgame.io` is abandoned (last published 2022) and LangChain.js is overengineered for direct LLM calls.

**Core technologies:**
- **Vercel AI SDK v6** (`ai@6.x`): Multi-provider LLM unification — `generateObject` + Zod eliminates all response parsing
- **Zod v4**: Schema validation and LLM output typing — required by AI SDK; zero deps, TypeScript-first
- **Pino v10**: Structured JSONL logging — fastest Node logger; critical for ML-ready game logs
- **Commander.js v14**: CLI argument parsing — requires Node 20+; full TypeScript support
- **`@clack/prompts` v1**: Interactive CLI prompts — spinners, selects for session config
- **`p-limit` v5**: Concurrency limiter — batch mode rate-limit control; pure ESM
- **Vitest v4**: TypeScript-native testing — faster than Jest, no transform config needed
- **`tsx` v4**: TypeScript execution — replaces ts-node; ~2x faster via esbuild

### Expected Features

**Must have (table stakes):**
- Complete Avalon rules engine (nominate, vote, quest, Merlin/assassin resolution) — without this nothing works
- Per-player hidden role state with correct visibility rules (Merlin sees evil, Percival sees Merlin+Morgana) — foundational to game correctness and training data validity
- LLM player accepting any provider/model via string config — required for comparative research
- Structured JSONL game log with reasoning traces per decision — the primary output justifying the project
- Post-game outcome record (faction winner, per-player role, Merlin guess result) — required for batch win-rate analysis
- CLI to configure and run a single game — minimum usable interface
- Reproducible config via seed + YAML/JSON — required for research validity

**Should have (competitive advantage over existing tools):**
- Batch mode with parallel game execution and rate-limit awareness — training data at scale
- Per-agent persona injection into system prompt — distributional diversity in training data
- LLM token/cost tracking per game — essential for batch budget control
- AI-generated post-game summary — qualitative inspection of agent behavior
- Per-phase belief state logging (opt-in) — deception research capability
- Pluggable player interface — LLM vs. algorithmic baseline ablation

**Defer (v2+):**
- Game-agnostic engine abstraction — extract after a second game is needed, not before
- Configurable discussion phases — defer until base Avalon is validated
- Human player wiring — blocks batch throughput; not validated use case

### Architecture Approach

The system is structured in four layers: CLI (config wiring and dependency injection), Orchestration (generic `GameEngine<S,A>` turn loop), Player (pluggable `Player<S,A>` interface with `LLMPlayer` as the primary implementation), and Game Implementation (`AvalonGame` implementing `Game<AvalonState>`). Game state is immutable — `applyAction` returns a new state object. An `EventBus` decouples the game loop from the logger: the `Recorder` subscribes to events and writes JSONL without the engine needing to know logging exists. Each `GameEngine` instance owns its own `EventBus`, making batch parallelism safe by construction.

**Major components:**
1. `GameEngine<S,A>` — generic turn loop; calls only `Game<S>` and `Player<S,A>` interfaces; no game-specific code
2. `AvalonGame implements Game<AvalonState>` — all Avalon rules, phase state machine, role visibility logic
3. `LLMPlayer<S,A>` — formats state view as prompt (via `game.formatPrompt`), calls LLM via AI SDK, validates response with Zod
4. `EventBus` + `Recorder` — decoupled pub/sub logging; Recorder is a passive subscriber writing JSONL
5. `BatchRunner` — thin parallel wrapper using `Promise.allSettled` + `p-limit`; each game fully isolated

### Critical Pitfalls

1. **Hidden information leakage into agent prompts** — define a distinct `PlayerView` type; never pass `GameState` to prompt builders; enforce at the TypeScript type level with tests per role asserting which fields are present/absent. Recovery cost is HIGH (invalidates all generated data).

2. **Training data schema designed after the fact** — define log schema as typed TypeScript interfaces before writing engine code; every log entry needs `gameId`, `roundId`, `playerId`, `timestamp`, `role`, separated `publicStatement` and `privateReasoning` fields. Recovery cost is HIGH.

3. **LLM agents revealing their hidden role in discussion** — add a private scratchpad reasoning step before generating public output; validate public statements for role name disclosures. This is documented empirically in AvalonBench.

4. **Structured output brittleness across models** — use AI SDK's native structured output with Zod schema validation on every response; implement a retry-with-clarification loop (max 3 retries) before falling back; never use `JSON.parse` without Zod `.parse()`. Test all role prompts against every supported provider.

5. **Batch concurrency explosion** — never use unbounded `Promise.all()`; use `p-limit` to cap concurrent LLM calls calibrated to API tier; separate game-level and call-level concurrency tracking.

6. **Context window growth across long games** — scope each agent's context to current phase + private knowledge + bounded recent history (last N events); design `PlayerView` to enforce this from the start; measure token usage per call in development.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Data Model and Log Schema

**Rationale:** The two highest-recovery-cost pitfalls (hidden information leakage, flat log schema) both require the data model to be locked before engine code is written. PITFALLS.md explicitly maps both to Phase 1. ARCHITECTURE.md's build order starts with `core/types.ts` before any game logic.

**Delivers:** Typed `GameState<S>`, `PlayerView<S>`, `GameEvent`, and `GameLog` schema as TypeScript interfaces. Zod schemas for log entry validation. `EventBus` implementation. Per-role visibility rules specified as tests (not yet implemented).

**Addresses:** Reproducible config foundation (seed + schema), structured log schema design, information hiding model.

**Avoids:** Hidden information leakage (Pitfall 1), flat log schema (Pitfall 8), context window growth (Pitfall 4) — all require `PlayerView` scoping to be designed here.

**Research flag:** Standard patterns — type design and event sourcing are well-documented. Skip `/gsd:research-phase`.

### Phase 2: Avalon Rules Engine

**Rationale:** Avalon rules are the core dependency for everything else. FEATURES.md dependency graph shows CLI, player interface, and logging all require the game engine. PITFALLS.md warns against over-engineering game-agnostic abstractions before Avalon works — build Avalon directly first.

**Delivers:** `AvalonGame implements Game<AvalonState>` — complete phase state machine (nominate → vote → quest → Merlin assassination), role assignment, visibility logic, win condition resolution. No LLM integration yet — test with deterministic inputs.

**Addresses:** All table-stakes game features: complete rules, hidden role state, per-phase transitions, post-game outcome record.

**Avoids:** Over-engineered abstractions (Pitfall 6) — Avalon is implemented directly; no generic base classes until after this phase is complete.

**Research flag:** Standard patterns for turn-based game state machines. Skip `/gsd:research-phase`.

### Phase 3: LLM Agent Integration

**Rationale:** LLM integration builds on a working game engine with locked data model. Prompt engineering is Avalon-specific and role-differentiated — this cannot be designed until role visibility rules from Phase 1 and game phases from Phase 2 are implemented.

**Delivers:** `LLMClient` wrapper, `LLMPlayer<S,A>` with private scratchpad + public statement separation, role-differentiated prompt templates in `games/avalon/prompts.ts`, Zod-validated structured output for each decision type (`ProposalDecision`, `VoteDecision`, `QuestDecision`, `AssassinationDecision`), multi-provider support (OpenAI + Anthropic minimum), retry-with-clarification loop.

**Addresses:** Provider-agnostic LLM player, reasoning trace capture, persona injection, single-game end-to-end execution.

**Avoids:** Flat prompt architecture (Pitfall 3), role disclosure in discussion (Pitfall 2), structured output brittleness (Pitfall 5).

**Research flag:** Prompt engineering for each Avalon role warrants research. The scratchpad pattern and per-model structured output behavior needs validation. **Flag for `/gsd:research-phase`.**

### Phase 4: CLI and Single-Game Runner

**Rationale:** Wire all components together for a usable CLI once the game engine and LLM player are stable. Config validation via Zod, dependency injection in `cli/index.ts`, and `GameRunner` orchestration are thin wiring — no new logic.

**Delivers:** Commander.js CLI with `@clack/prompts` for interactive setup, Zod-validated config schema (model, roles, seed, output-dir), `GameRunner` producing a complete JSONL log file, `pino-pretty` for dev output. Reproducible runs via config file.

**Addresses:** CLI table-stakes feature, reproducible config, output directory management, provider API key handling via dotenv.

**Avoids:** API key embedding in config files (Security pitfall).

**Research flag:** Standard patterns — Commander and `@clack/prompts` have clear APIs. Skip `/gsd:research-phase`.

### Phase 5: Batch Mode and Scale

**Rationale:** Batch mode deferred until single-game output quality is confirmed. FEATURES.md explicitly recommends this order. Adding parallelism before data quality is validated amplifies any data problems across thousands of games.

**Delivers:** `BatchRunner` with `p-limit` concurrency cap, per-game isolated `EventBus` instances, batch manifest JSONL aggregating metadata, token/cost tracking per game, CLI flags for batch config (--count, --concurrency, --output-dir), partial recovery via per-game log files.

**Addresses:** Parallel game execution, cost tracking, batch statistics (win rates by faction/model).

**Avoids:** Batch concurrency explosion (Pitfall 7), race conditions (Pitfall 7), synchronous batch execution (performance trap), in-memory log accumulation (performance trap).

**Research flag:** Rate limit calibration per provider tier needs validation before large batches. **Flag for `/gsd:research-phase`** — specifically around `p-limit` configuration and per-provider token-per-minute budgets.

### Phase 6: Analysis and Output Quality

**Rationale:** Once batch data is flowing, add features that improve data usability and provide qualitative insight. These are all single-LLM-call additions on top of stable log schema.

**Delivers:** AI-generated post-game summary (single LLM call over full log), per-agent belief state logging (opt-in via flag), log replayer for timeline reconstruction, batch win-rate statistics.

**Addresses:** Post-game AI summary, belief state logging, pluggable player interface formalization for algorithmic baseline.

**Research flag:** Belief state schema design may need research into deception modeling literature. Otherwise standard. **Consider `/gsd:research-phase`** for belief state logging only.

### Phase Ordering Rationale

- Data model precedes engine (not the reverse) because information isolation bugs invalidate all downstream work and have HIGH recovery cost.
- Avalon precedes LLM integration because prompt design requires knowing exactly which information each role receives — you can't write role prompts without the visibility model being concrete.
- Single-game validation precedes batch mode — this is an explicit recommendation from FEATURES.md and supported by pitfall analysis.
- Analysis features come last because they depend on a stable log schema; adding them while the schema is still evolving would require constant rework.

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 3 (LLM Agent Integration):** Role-differentiated prompt engineering for Avalon, per-provider structured output behavior differences, scratchpad pattern implementation in AI SDK v6
- **Phase 5 (Batch Mode):** Per-provider rate limit tiers and token-per-minute budgets; `p-limit` concurrency configuration; cost estimation for batch runs
- **Phase 6 (Analysis):** Belief state schema design if deception modeling is a serious research goal

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1 (Data Model):** TypeScript interfaces and event sourcing — well-documented patterns
- **Phase 2 (Avalon Rules):** Turn-based state machine — established game programming patterns
- **Phase 4 (CLI):** Commander + clack + Zod config — all have clear, current documentation

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified against npm on 2026-03-21; version compatibility matrix confirmed |
| Features | MEDIUM | Based on analysis of existing LLM game frameworks (Avalon-LLM, TextArena, GamingAgent); no production deployment data for this exact use case |
| Architecture | MEDIUM-HIGH | Patterns are well-established (event sourcing, immutable state, dependency injection); adapted from LLM agent framework literature and game loop patterns |
| Pitfalls | MEDIUM | Academic papers (AvalonBench, LLM-Based Agent Society) provide empirical evidence for LLM-specific pitfalls; general pitfalls (concurrency, schema design) are well-documented |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Role prompt effectiveness:** AvalonBench documents LLM failure modes but doesn't prescribe what prompts succeed. Phase 3 planning should include a rapid prompt iteration cycle before batch runs.
- **Provider structured output parity:** AI SDK v6 abstracts providers, but Anthropic's tool-use-based structured output and OpenAI's `response_format` behave differently under edge cases. Needs cross-provider testing early in Phase 3.
- **Avalon role table configuration:** Research covers 5-player Avalon; scaling to 7-10 players adds roles (Lady of the Lake, Oberon) that aren't covered in depth. Phase 2 planning should clarify which role configurations are in scope for v1.
- **Token budget calibration:** Cost projections for batch mode depend heavily on model choice and game length. Phase 5 should start with a cost estimation spike before committing to batch architecture.

## Sources

### Primary (HIGH confidence)
- [ai - npm](https://www.npmjs.com/package/ai) — v6.0.116 verified 2026-03-21
- [@ai-sdk/anthropic - npm](https://www.npmjs.com/package/@ai-sdk/anthropic) — v3.0.58 verified
- [commander - npm](https://www.npmjs.com/package/commander) — v14.0.2, Node 20+ requirement confirmed
- [pino - npm](https://www.npmjs.com/package/pino) — v10.3.1 verified
- [vitest - npm](https://www.npmjs.com/package/vitest) — v4.1.0 verified
- [boardgame.io - npm](https://www.npmjs.com/package/boardgame.io) — v0.50.2, abandoned 2022 confirmed

### Secondary (MEDIUM confidence)
- [AvalonBench (arXiv 2310.05036)](https://arxiv.org/abs/2310.05036) — LLM failure modes in Avalon (role disclosure, poor deduction)
- [LLM-Based Agent Society: Avalon Gameplay (arXiv 2310.14985)](https://arxiv.org/html/2310.14985) — information asymmetry challenges
- [Avalon-LLM GitHub (jonathanmli)](https://github.com/jonathanmli/Avalon-LLM) — existing implementation reference
- [TextArena GitHub](https://github.com/TextArena/TextArena) — 57+ game framework comparison
- [AgentTrace: Structured Logging (arXiv 2602.10133)](https://arxiv.org/html/2602.10133) — log schema design patterns
- [Synthesizing Post-Training Data via Multi-Agent Simulation (arXiv 2410.14251)](https://arxiv.org/html/2410.14251v2) — batch simulation for training data
- [A Turn-Based Game Loop (stuffwithstuff.com)](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/) — established game loop patterns

### Tertiary (LOW confidence)
- [VoltAgent TypeScript AI Agent Framework](https://voltagent.dev/blog/typescript-ai-agent-framework/) — TypeScript agent architecture patterns; needs validation against current AI SDK v6
- [LLM Structured Output in 2026](https://dev.to/pockit_tools/llm-structured-output-in-2026-stop-parsing-json-with-regex-and-do-it-right-34pk) — cross-provider structured output behavior; single source

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
