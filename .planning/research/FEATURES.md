# Feature Research

**Domain:** AI board game agent framework (social deduction focus, LLM players, training data generation)
**Researched:** 2026-03-21
**Confidence:** MEDIUM — based on WebSearch across existing research frameworks; no Context7 match for this niche domain

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any researcher or engineer setting up an LLM game simulation framework expects to exist. Missing these means the framework is not usable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Complete Avalon rules engine | Avalon is the stated game; without full rules (team proposal, vote, quest, Merlin/assassin) the framework is broken | HIGH | All phases: nominate, vote on team, quest result, Merlin guess. Must correctly resolve game-end conditions |
| Per-player hidden role state | Social deduction depends on information asymmetry; each agent sees only what their role permits | MEDIUM | Role → visible actions: Merlin sees evil, Percival sees Merlin+Morgana, etc. Must not leak private state across agents |
| LLM player that accepts any model | If agents are wired to one model, the framework is not useful for comparative research | MEDIUM | Provider-agnostic: OpenAI, Anthropic, Gemini, local via OpenAI-compatible API. Model name passed at config time |
| Structured game log (machine-readable) | Downstream training pipelines require deterministic schema; ad-hoc text logs block data use | MEDIUM | JSON-L per event: {turn, phase, player, action, payload}. Reasoning field in each entry |
| Reasoning trace per decision | The stated core value is "full reasoning visibility"; without this the logs have no training value | MEDIUM | Each agent action should include the chain-of-thought or scratchpad that produced it |
| CLI to configure and run a game | Users must be able to start a game without writing framework internals code | LOW | Args: --players, --models, --roles, --output-dir. Sensible defaults |
| Post-game outcome record | Win/loss by faction, per-player role, Merlin-assassin result — must be in the log | LOW | Required to compute win rates across batch runs |
| Reproducible runs via seed/config file | Research requires reproducibility; stochastic runs without seeds can't be compared | LOW | Config YAML/JSON capturing all parameters including random seed for role assignment |

### Differentiators (Competitive Advantage)

Features that existing frameworks (Avalon-LLM, TextArena, GAMA-Bench) do not provide out of the box, or provide poorly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Batch mode with parallel game execution | Training data quality scales with volume; generating 1000 games serially takes days, parallel takes hours | HIGH | Async orchestrator spawning N concurrent games. Rate-limit-aware for LLM API quotas. Progress tracking per batch |
| Per-agent persona injection | Same model playing different personas (aggressive, deceptive, naive) produces training distribution diversity | LOW | Persona string injected into system prompt before game rules. Configurable per player slot |
| AI-generated post-game summary | Provides human-readable narrative of how the game unfolded, useful for qualitative inspection of agent behavior | MEDIUM | Single LLM call after game end, given the full log. Structured: key moments, deception instances, who influenced whom |
| Game-agnostic engine interface | Avalon today; Werewolf, One Night, Secret Hitler later. Researchers want to swap games without rewriting agent code | HIGH | Abstract GameState, PlayerAction, GameEvent types. Avalon is an implementation of this interface, not a special case |
| Pluggable player interface | Enables ablation: compare LLM vs. rule-based vs. random baseline in the same game | MEDIUM | Player protocol: receive_observation(state) → action. LLM, algorithmic, and human players all implement same interface |
| Per-phase belief state logging | For social deduction research, what matters is not just actions but what each agent believed about others at each turn | MEDIUM | Agent optionally exposes belief_state dict per turn. Logged alongside action. Key for deception research |
| LLM token usage and cost tracking per game | Batch runs can get expensive; researchers need to estimate and control costs before running large batches | LOW | Sum tokens per model per game, output in log footer. Warn if projected batch cost exceeds threshold |
| Configurable discussion phases | Avalon variants differ in how much free-form discussion is allowed; framework should support 0, 1, or N discussion rounds per phase | MEDIUM | Discussion round = structured message exchange before action vote. Round count configurable per phase type |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time web UI / visual game board | "It would be easier to watch games live" | Diverts effort from core data generation; adds auth, websockets, frontend stack — wrong layer for MVP | Post-game replay from structured JSON log. Build a viewer later if demand is validated |
| Human player support in batch mode | "Let a human play to generate gold-standard data" | Human-in-the-loop breaks parallelism and throughput; makes batch generation impossible | Keep human player interface in the protocol (extensible), but don't wire it up. Generate gold-standard data with strong LLMs instead |
| Built-in RL training loop | "Train agents directly in the framework" | RL training is a separate concern (environment vs. trainer). Coupling them makes both worse and creates a monolith | Export structured logs in a format that plugs into standard RL frameworks (Gymnasium-compatible observation/action). Let training happen externally |
| Automatic prompt optimization | "Improve agent prompts automatically" | Non-deterministic prompt evolution breaks reproducibility, which is required for training data | Fix prompts per experimental run. Use persona config to vary behavior intentionally |
| Persistent agent memory across games | "Agents should learn from past games" | Cross-game state creates non-stationarity and makes game outcomes non-independent — breaks statistical validity of batch data | Each game is stateless for agents. Memory within a single game (belief tracking) is fine and expected |
| Multi-game tournament brackets | "Run a league and rank models" | Tournament logic adds scheduling complexity before core game execution is stable | Win-rate statistics from batch runs achieve same goal without bespoke tournament infrastructure |

## Feature Dependencies

```
CLI interface
    └──requires──> Game engine (Avalon implementation)
                       └──requires──> Hidden role state management
                       └──requires──> Phase sequencer (nominate → vote → quest → end)
                       └──requires──> Player interface protocol

Player interface protocol
    └──requires──> LLM player implementation
                       └──requires──> Provider-agnostic LLM client
                       └──requires──> Persona injection

Structured game log
    └──requires──> Game engine (emits events)
    └──requires──> Reasoning trace capture (per player decision)
    └──enhances──> Post-game AI summary (consumes log)
    └──enhances──> Batch statistics (win rates, token costs)

Batch mode
    └──requires──> CLI interface (parameterized config)
    └──requires──> Structured game log (output per game)
    └──enhances──> LLM token/cost tracking (essential at scale)

Game-agnostic engine interface
    └──enhances──> Game engine (Avalon becomes one implementation)
    └──enhances──> Pluggable player interface (decouples from game specifics)

Per-agent belief state logging
    └──requires──> Player interface protocol (agent must expose belief_state)
    └──enhances──> Structured game log (adds belief_state field per action event)
```

### Dependency Notes

- **Batch mode requires CLI:** Batch config must be expressible as a file passed to CLI, not interactive input.
- **Reasoning trace requires player protocol:** The protocol must include a reasoning field in the returned action object, not just the action decision. LLM players populate it; algorithmic players can leave it null.
- **Game-agnostic interface enhances extensibility but is not required for Avalon MVP:** Design it as an abstraction layer from day one to avoid costly refactoring, but Avalon drives the interface shape.
- **Belief state logging conflicts with performance:** Full per-turn belief state serialization adds latency per decision. Make it opt-in via flag.

## MVP Definition

### Launch With (v1)

- [ ] Complete Avalon rules engine — without this, nothing else matters
- [ ] Hidden role state with correct visibility rules (Merlin sees evil, etc.) — foundational to game correctness
- [ ] LLM player with configurable model and persona — the primary agent type
- [ ] Provider-agnostic LLM client (OpenAI + Anthropic minimum) — required to test across models
- [ ] Structured JSON-L game log with reasoning traces — the output that justifies the project
- [ ] Post-game outcome record (faction winner, per-player role, Merlin guess result) — required for batch analysis
- [ ] CLI to run a single game with model/role config — minimum usable interface
- [ ] Reproducible config (seed + YAML/JSON params) — required for research validity

### Add After Validation (v1.x)

- [ ] Batch mode with parallel execution — add once single-game output quality is confirmed
- [ ] LLM token/cost tracking — add alongside batch mode; irrelevant for single games
- [ ] AI-generated post-game summary — add once log schema is stable
- [ ] Per-agent belief state logging — add when first analysis of deception behavior begins
- [ ] Pluggable player interface formalized — add when algorithmic baseline player is needed for ablation

### Future Consideration (v2+)

- [ ] Game-agnostic engine abstraction — wait until a second game is being added; premature abstraction without a second game case will be wrong
- [ ] Discussion phase configurability — defer until Avalon base is validated and variant experiments are needed
- [ ] Human player wiring — defer until there is a validated use case; human-in-the-loop blocks batch throughput

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Avalon rules engine | HIGH | HIGH | P1 |
| Hidden role state management | HIGH | MEDIUM | P1 |
| LLM player (provider-agnostic) | HIGH | MEDIUM | P1 |
| Structured JSON-L game log | HIGH | LOW | P1 |
| Reasoning trace capture | HIGH | LOW | P1 |
| CLI (single game) | HIGH | LOW | P1 |
| Reproducible config (seed + YAML) | HIGH | LOW | P1 |
| Batch mode + parallelism | HIGH | HIGH | P2 |
| Persona injection | MEDIUM | LOW | P2 |
| Post-game AI summary | MEDIUM | LOW | P2 |
| Token/cost tracking | MEDIUM | LOW | P2 |
| Belief state logging | MEDIUM | MEDIUM | P2 |
| Game-agnostic engine interface | LOW | HIGH | P3 |
| Discussion phase configurability | LOW | MEDIUM | P3 |
| Human player wiring | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Avalon-LLM (jonathanmli) | TextArena | GAMEBoT | Our Approach |
|---------|--------------------------|-----------|---------|--------------|
| Social deduction game support | Yes — Avalon only | No dedicated SDG; Avalon not listed | Competitive games, no social deduction | Avalon first, game-agnostic interface for more |
| LLM agent types | LLM + naive bot, limited config | Gym-like interface, model-agnostic | Evaluation only, no agent training | Provider-agnostic + persona config |
| Batch execution | Not documented | Online arena mode, not batch generation | Benchmark runs only | Parallel async batch with progress tracking |
| Structured reasoning trace | Not a focus (benchmark-oriented) | Not a focus | Decomposes reasoning into subproblems for eval | First-class per-decision reasoning field in log |
| Training data orientation | Secondary | Secondary (eval-first) | Eval-only | Primary — log schema designed for fine-tuning |
| Extensible to new games | No | Yes (57+ games) | No | Yes, via game-agnostic engine interface |
| Hidden role visibility rules | Yes (5-player config) | N/A | N/A | Yes, full role table including Percival/Morgana |

## Sources

- [Avalon-LLM GitHub (jonathanmli)](https://github.com/jonathanmli/Avalon-LLM) — existing Avalon LLM benchmark implementation
- [TextArena GitHub](https://github.com/TextArena/TextArena) — 57+ text game framework, Gym-like API
- [Board Game Arena: Framework and Benchmark for LLMs (arXiv 2508.03368)](https://arxiv.org/html/2508.03368v1) — arena-based LLM game evaluation
- [AgentTrace: Structured Logging for Agent Observability (arXiv 2602.10133)](https://arxiv.org/html/2602.10133) — cognitive + operational telemetry schema
- [LLM-Based Agent Society Investigation: Avalon Gameplay (arXiv 2310.14985)](https://arxiv.org/html/2310.14985) — multi-agent Avalon research
- [CSP4SDG: Role Identification in Social Deduction Games (arXiv 2511.06175)](https://arxiv.org/abs/2511.06175) — belief state and constraint modeling
- [GAMEBoT: Transparent LLM Reasoning in Games](https://visual-ai.github.io/gamebot/) — modular reasoning decomposition benchmark
- [GamingAgent Framework ICLR 2026](https://github.com/lmgame-org/GamingAgent) — LLM gaming agent with episode logs and replay
- [Synthesizing Post-Training Data via Multi-Agent Simulation (arXiv 2410.14251)](https://arxiv.org/html/2410.14251v2) — batch simulation for training data generation
- [GAMA-Bench: Multi-Agent Gaming Evaluation](https://openreview.net/forum?id=DI4gW8viB6) — game theory multi-agent LLM evaluation

---
*Feature research for: AI board game agent framework, social deduction (Avalon), LLM agents, training data generation*
*Researched: 2026-03-21*
