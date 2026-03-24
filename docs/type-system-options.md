# Type System Design

Why the framework types look the way they do.

## Problem: What types does each board game define?

Per board game, three concerns exist:

| Concern | Example (Avalon) | Purpose |
|---------|-----------------|---------|
| **State** | `AvalonState` | All game data including secrets — internal to game class |
| **Player view** | What one player sees | Passed as `unknown` through framework |
| **Action** | `AvalonAction` (union of propose, vote, quest, etc.) | What a player can do |

## Decisions

**No generics in framework types.** The app supports different games at runtime — compile-time generics can't help. Zod schemas handle validation at runtime instead.

**State inside Game.** No `GameState<S>` wrapper or brand tags. Encapsulation enforces the information boundary — internal state never leaves the class, only views go out through `ActionRequest`. Deferred to v2: `clone()` for replay/history, state serialization.

**PlayerView is per-game.** Not a framework type. Each game constructs its own view shape and passes it as `unknown` through `ActionRequest`. The player (LLM) serializes whatever it receives — doesn't need to know the shape at compile time.

**ActionSchema replaces getValidActions.** Some actions have infinite options (propose a team, make a statement). A Zod schema describes constraints without enumerating. Also doubles as the validation layer for player responses.

**GameConfig options validated by game.** Framework has `options?: unknown`. Game provides `optionsSchema` (Zod) for validation. Game-specific config stays out of framework types.

**GameOutcome uses scores, not winner.** `scores: Record<string, number>` covers all cases — faction-based (Avalon), individual (ranking), draws (Chess 0.5/0.5).

**Events are the log.** JSONL is just serialized `GameEvent[]`. No separate `GameLogEntry` schema. Two event sources discriminated by `source: 'player' | 'game'`.

**Two validation layers.** Engine (structural, retry up to 3x) → Game (semantic, default action). Structural failures are infrastructure problems; semantic failures are bad decisions.

## Logging separation

- **Game events** → JSONL file (training data). Player actions and game state transitions.
- **Operational logs** → stderr/Pino (debugging). Network errors, retries, latency.
