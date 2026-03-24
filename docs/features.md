# Features

## MVP (v1)

| Feature | Priority | Phase |
|---------|----------|-------|
| Complete Avalon rules engine | P1 | 2 |
| Per-player hidden role state with visibility rules | P1 | 2 |
| LLM player with configurable model/provider | P1 | 3 |
| Structured JSONL log with reasoning traces | P1 | 1 (done) |
| Post-game outcome record | P1 | 1 (done) |
| CLI to run a single game | P1 | 4 |
| Reproducible config via seed | P1 | 1 (done) |
| Role-specific prompt components | P1 | 3 |
| Simplified discussion phase | P1 | 3 |

## Post-Validation (v1.x)

| Feature | Priority |
|---------|----------|
| Batch mode with parallel execution | P2 |
| Per-agent persona injection | P2 |
| AI-generated post-game summary | P2 |
| LLM token/cost tracking | P2 |

## Future (v2+)

| Feature | Priority | Why Deferred |
|---------|----------|-------------|
| Game-agnostic engine abstraction | P3 | Extract after a second game; premature without two examples |
| Multi-round discussion | P3 | Defer until base Avalon validated |
| Human player wiring | P3 | Blocks batch throughput; no validated use case |
| Belief state logging | P3 | Add when deception analysis begins |

## Anti-Features (Intentionally Excluded)

| Feature | Why Excluded |
|---------|-------------|
| Real-time web UI | Diverts from core data generation; build a replay viewer later |
| Human player in batch mode | Breaks parallelism and throughput |
| Built-in RL training loop | Training is a separate concern; export logs for external frameworks |
| Automatic prompt optimization | Breaks reproducibility required for valid training data |
| Persistent agent memory across games | Non-stationarity breaks statistical independence |

## Competitor Comparison

| Feature | Avalon-LLM | TextArena | Our Approach |
|---------|-----------|-----------|-------------|
| Social deduction | Yes (Avalon only) | No | Avalon first, game-agnostic interface |
| Batch execution | No | Online arena | Parallel async batch |
| Reasoning traces | Not a focus | Not a focus | First-class per-decision field |
| Training data orientation | Secondary | Secondary (eval-first) | Primary — schema designed for fine-tuning |
| Extensible to new games | No | Yes (57+ games) | Yes, via Game interface |
