# The Resistance: Avalon

## Game Overview

Avalon is a social deduction game for 5-10 players. Players are secretly assigned to one of two teams: **Good** (Loyal Servants of Arthur) or **Evil** (Minions of Mordred). The game proceeds through a series of **quests**. Good wins by completing 3 quests successfully; Evil wins by failing 3 quests or by assassinating Merlin at the end.

## Players

Avalon supports 5-10 players. The team sizes and quest configurations depend on player count.

### Team Sizes

| Players | Good | Evil |
|---------|------|------|
| 5       | 3    | 2    |
| 6       | 4    | 2    |
| 7       | 4    | 3    |
| 8       | 5    | 3    |
| 9       | 6    | 3    |
| 10      | 6    | 4    |

### Roles

In a standard 5-player game, assign the following roles:

- **Merlin** (Good) — Knows who the Evil players are.
- **Assassin** (Evil) — If Good wins 3 quests, may attempt to assassinate Merlin.
- **Loyal Servant** (Good) — No special knowledge. Remaining good slots filled with this role.
- **Minion of Mordred** (Evil) — Knows who the other Evil players are (except Merlin). Remaining evil slots filled with this role.

For games with more players, add Loyal Servants and Minions to fill the team sizes above. Always include exactly one Merlin and one Assassin.

### Role Assignment

Use the seed from the game config to deterministically shuffle the player list, then assign roles in order:

1. First good player becomes **Merlin**.
2. Remaining good players become **Loyal Servants**.
3. First evil player becomes **Assassin**.
4. Remaining evil players become **Minions of Mordred**.

To shuffle deterministically with the seed: use a seeded pseudo-random algorithm. Sort players by `hash(seed + playerIndex) mod large_prime` or use a simple seeded LCG. The key requirement is that the same seed always produces the same role assignment.

## Setup

### Quest Configuration

The number of team members required for each quest depends on the player count:

| Players | Quest 1 | Quest 2 | Quest 3 | Quest 4 | Quest 5 |
|---------|---------|---------|---------|---------|---------|
| 5       | 2       | 3       | 2       | 3       | 3       |
| 6       | 2       | 3       | 4       | 3       | 4       |
| 7       | 2       | 3       | 3       | 4*      | 4       |
| 8       | 3       | 4       | 4       | 5*      | 5       |
| 9       | 3       | 4       | 4       | 5*      | 5       |
| 10      | 3       | 4       | 4       | 5*      | 5       |

\* For 7+ players, Quest 4 requires **two** fail votes to fail (instead of the usual one).

### Initial Game State

```json
{
  "phase": "team_proposal",
  "players": [
    { "id": "<player_id>", "name": "<name>", "role": "<role>", "team": "good|evil" }
  ],
  "quests": [
    { "questNumber": 1, "teamSize": 2, "failsRequired": 1, "result": null },
    { "questNumber": 2, "teamSize": 3, "failsRequired": 1, "result": null },
    { "questNumber": 3, "teamSize": 2, "failsRequired": 1, "result": null },
    { "questNumber": 4, "teamSize": 3, "failsRequired": 1, "result": null },
    { "questNumber": 5, "teamSize": 3, "failsRequired": 1, "result": null }
  ],
  "currentQuest": 1,
  "questResults": { "success": 0, "fail": 0 },
  "leader": "<first_player_id>",
  "leaderIndex": 0,
  "proposalRejections": 0,
  "proposedTeam": null,
  "votes": {},
  "questVotes": {},
  "history": []
}
```

At game start, emit a **game_start** event containing player names (but NOT roles) and the quest configuration.

## Game Phases

The game cycles through these phases:

### 1. Team Proposal (`team_proposal`)

The current **leader** proposes a team of players for the current quest.

- Send the leader an action request.
- The leader must propose exactly N players (where N is the `teamSize` for the current quest).
- The proposed players are identified by their player IDs.

**Action Schema:**

```json
{
  "type": "object",
  "properties": {
    "team": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["team"]
}
```

**Validation:**
- `team` must contain exactly `teamSize` player IDs for the current quest.
- All IDs must be valid player IDs in the game.
- No duplicate IDs.

After a valid proposal, emit a **team_proposed** event with the leader and proposed team, then move to `team_vote` phase.

### 2. Team Vote (`team_vote`)

**All players** simultaneously vote to approve or reject the proposed team.

- Send action requests to ALL players at the same time.
- Each player votes "approve" or "reject".

**Action Schema:**

```json
{
  "type": "object",
  "properties": {
    "vote": {
      "type": "string",
      "enum": ["approve", "reject"]
    }
  },
  "required": ["vote"]
}
```

After all votes are collected:

- If a **strict majority** (more than half) approve, the team is approved. Reset `proposalRejections` to 0. Emit a **vote_result** event with all votes and result "approved". Move to `quest_execution` phase.
- Otherwise, the team is rejected. Increment `proposalRejections`. Emit a **vote_result** event with all votes and result "rejected".
  - If `proposalRejections` reaches **5**, Evil wins immediately. Set `isTerminal = true` with Evil victory (score 1 for each evil player, 0 for each good player). This is the "hammer rule."
  - Otherwise, rotate the leader to the next player (by index in the players array, wrapping around) and return to `team_proposal`.

### 3. Quest Execution (`quest_execution`)

The approved team members **simultaneously** and **secretly** choose to succeed or fail the quest.

- Send action requests ONLY to the players on the approved team.
- Good players **must** vote "success" (they have no choice).
- Evil players may vote "success" or "fail".

**Action Schema for Good players:**

```json
{
  "type": "object",
  "properties": {
    "questVote": {
      "type": "string",
      "enum": ["success"]
    }
  },
  "required": ["questVote"]
}
```

**Action Schema for Evil players:**

```json
{
  "type": "object",
  "properties": {
    "questVote": {
      "type": "string",
      "enum": ["success", "fail"]
    }
  },
  "required": ["questVote"]
}
```

After all quest votes are collected:

- Count the number of "fail" votes.
- If fails >= `failsRequired` for this quest, the quest **fails**. Otherwise it **succeeds**.
- Record the result in the quest entry. Update `questResults`.
- Emit a **quest_result** event with the quest number, result ("success"/"fail"), and the NUMBER of fail votes (but NOT who voted what — quest votes are secret).

After recording the quest result:

- If `questResults.success` reaches 3: Good has won 3 quests. Move to `assassination` phase.
- If `questResults.fail` reaches 3: Evil wins immediately. Set `isTerminal = true` with Evil victory.
- Otherwise: advance `currentQuest`, rotate leader, reset `proposalRejections` to 0, return to `team_proposal`.

### 4. Assassination (`assassination`)

This phase occurs only if Good has completed 3 successful quests.

The **Assassin** gets one chance to identify Merlin.

- Send an action request ONLY to the Assassin.
- The Assassin names a player they believe is Merlin.

**Action Schema:**

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string"
    }
  },
  "required": ["target"]
}
```

**Validation:**
- `target` must be a valid player ID.
- `target` must not be the Assassin's own ID.

After the Assassin chooses:

- If the target IS Merlin: **Evil wins** despite Good completing 3 quests. Emit an **assassination_result** event with result "success".
- If the target is NOT Merlin: **Good wins**. Emit an **assassination_result** event with result "fail".

Set `isTerminal = true` and provide the outcome.

## Player Views

Each player's view depends on their role. Views must enforce hidden information — never reveal what a player shouldn't know.

### Common View (all players see this)

```json
{
  "yourId": "<this player's ID>",
  "yourRole": "<this player's role>",
  "yourTeam": "good|evil",
  "players": ["<id1>", "<id2>", ...],
  "currentQuest": 1,
  "questResults": { "success": 0, "fail": 0 },
  "questHistory": [
    { "questNumber": 1, "teamSize": 2, "result": "success", "failVotes": 0 }
  ],
  "leader": "<leader_id>",
  "proposalRejections": 0,
  "phase": "team_proposal|team_vote|quest_execution|assassination"
}
```

### Role-Specific Additions

- **Merlin**: Add `"knownEvil": ["<evil_player_id>", ...]` — the IDs of all Evil players.
- **Assassin / Minion of Mordred**: Add `"knownEvil": ["<evil_player_id>", ...]` — the IDs of all Evil players (they know each other).
- **Loyal Servant**: No additional information.

### Phase-Specific Additions

- During `team_vote`: Add `"proposedTeam": ["<id>", ...]` to all views.
- During `quest_execution`: Add `"proposedTeam": ["<id>", ...]` to team member views.
- During `assassination`: Add `"playerList": ["<id>", ...]` (all players except the Assassin) to the Assassin's view.

## Scoring

| Outcome | Good Players | Evil Players |
|---------|-------------|-------------|
| Good wins (3 successes + Merlin survives) | 1 each | 0 each |
| Evil wins (3 fails OR assassination OR hammer) | 0 each | 1 each |

## Events

Emit the following events during the game:

1. **game_start** — When the game begins. Include player names/IDs (not roles) and quest configuration.
2. **team_proposed** — When a leader proposes a team. Include leader ID and proposed team member IDs.
3. **vote_result** — After team vote completes. Include each player's vote and the result ("approved"/"rejected").
4. **quest_result** — After a quest completes. Include quest number, result ("success"/"fail"), and number of fail votes. Do NOT include individual votes.
5. **assassination_attempt** — When the Assassin chooses a target. Include the Assassin's ID and target ID.
6. **assassination_result** — Whether the assassination succeeded. Include result ("success"/"fail").
7. **game_end** — When the game ends. Include winning team, reason (quests/assassination/hammer), final quest results, all player roles (revealed), and scores.

## Leader Rotation

The leader rotates clockwise through the player list. After each team vote (approved or rejected), the leader advances to the next player index, wrapping around:

```
leaderIndex = (leaderIndex + 1) % numPlayers
```

The first leader is determined by the seed: `leaderIndex = seed % numPlayers`.

## Important Rules

1. **Good players cannot fail quests.** Their only quest vote option is "success".
2. **Quest votes are secret.** Only the count of fail votes is revealed, never who voted what.
3. **Team votes are public.** All players see how everyone voted after the vote.
4. **The hammer rule:** If 5 consecutive team proposals are rejected (without any quest being executed), Evil wins immediately.
5. **Proposal rejections reset** to 0 whenever a quest is completed (team was approved and quest executed).
6. **Two-fail quests:** For 7+ players, Quest 4 requires 2 fail votes to fail instead of 1.
