# Game Loop

## Lifecycle

```
Engine.run(game, players, config)
│
├─ 1. game.init(config)
│     → GameResponse { requests, events }
│     → Record events
│
├─ 2. LOOP:
│  ├─ 2a. Diff requests against pending map, send new ones
│  ├─ 2b. Promise.race(pending) — wait for first response
│  ├─ 2c. Validate: actionSchema.safeParse → retry (3x) → null
│  ├─ 2d. Record player event
│  ├─ 2e. game.handleResponse(playerId, action) → record game events
│  ├─ 2f. game.isTerminal() → break if true
│  └─ 2g. Back to 2a
│
└─ 3. Return game.getOutcome()
```

## Example: 2-Player Guessing Game

From `src/integration.test.ts`:

```
Config: alice + bob, 3 rounds, targets = [7, 3, 9]

Round 1:
  init() → requests for alice & bob (view: {round:1})
  alice guesses 7  → handleResponse("alice", 7) → waiting for bob
  bob guesses 4    → handleResponse("bob", 4)   → round resolves
    event: round-result {target:7, winner:"alice"}

Round 2:
  alice guesses 5  → waiting
  bob guesses 3    → round resolves, winner:"bob"

Round 3:
  alice guesses 8  → waiting
  bob guesses 10   → game terminal, winner:"alice"

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
