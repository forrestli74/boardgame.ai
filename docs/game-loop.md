# Game Loop

## Lifecycle

```
Engine.run(game, players, config)
│
├─ 1. gen = game.play(config)
│     result = gen.next()          // first yield
│
├─ 2. LOOP (while !result.done):
│  ├─ 2a. Record events from result.value
│  ├─ 2b. Diff requests against pending map, send new ones to players
│  ├─ 2c. Promise.race(pending) — wait for first response
│  ├─ 2d. Validate: actionSchema.safeParse → retry (3x) → null
│  ├─ 2e. Record player event
│  ├─ 2f. result = gen.next({ playerId, action })
│  └─ 2g. Back to 2a
│
└─ 3. result.done === true → return result.value (GameOutcome)
```

## Example: 2-Player Guessing Game

```
Config: alice + bob, 3 rounds, targets = [7, 3, 9]

Round 1:
  gen.next() → first yield: requests for alice & bob (view: {round:1})
  alice guesses 7  → gen.next({playerId:"alice", action:7}) → no-op yield (waiting for bob)
  bob guesses 4    → gen.next({playerId:"bob", action:4})   → round resolves
    event: round-result {target:7, winner:"alice"}

Round 2:
  alice guesses 5  → no-op yield
  bob guesses 3    → round resolves, winner:"bob"

Round 3:
  alice guesses 8  → no-op yield
  bob guesses 10   → generator returns (done=true)

Outcome: { scores: {alice: 2, bob: 1} }
```

## JSONL Output

Each line is valid JSON with a `gameId` field. Two shapes:

```jsonl
{"source":"game","gameId":"g1","data":{"type":"start","players":["alice","bob"]},"timestamp":"..."}
{"source":"player","gameId":"g1","playerId":"alice","data":7,"timestamp":"..."}
{"source":"game","gameId":"g1","data":{"type":"round-result","round":1,"target":7,"winner":"alice"},"timestamp":"..."}
```

Events are the complete game record — no separate log schema.
