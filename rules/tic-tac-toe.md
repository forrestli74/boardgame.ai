# Tic-Tac-Toe

## Game Overview

Tic-Tac-Toe is a two-player, turn-based game played on a 3x3 grid. Players alternate placing marks on the board. The first player to get three of their marks in a row (horizontally, vertically, or diagonally) wins. If all cells are filled with no winner, the game is a draw.

## Players

There are exactly 2 players.

- The **first player** listed in the game config is **"X"**.
- The **second player** listed in the game config is **"O"**.

Use each player's ID from the config to identify them throughout the game. The mapping is strictly positional: config `players[0]` is X, config `players[1]` is O.

## Setup

The initial board is a 3x3 grid where every cell is empty (null).

The first player (X) takes the first turn.

### Initial Game State

```json
{
  "board": [
    [null, null, null],
    [null, null, null],
    [null, null, null]
  ],
  "currentPlayer": "<players[0] ID>",
  "moveCount": 0
}
```

At game start, emit a **game_start** event containing the initial state and the list of player IDs.

## Game State

The game state is an object with three fields:

- `board`: A 3x3 array (array of 3 arrays, each containing 3 elements). Each cell is one of:
  - `"X"` — marked by player 1
  - `"O"` — marked by player 2
  - `null` — empty, not yet claimed
- `currentPlayer`: The player ID of the player whose turn it is next.
- `moveCount`: An integer counting the total number of moves made so far (starts at 0, increments by 1 after each valid move).

Row indices are 0 (top) to 2 (bottom). Column indices are 0 (left) to 2 (right). So `board[row][col]` addresses a specific cell.

## Turns

Players alternate turns. Player X (first player) always goes first.

On each turn:

1. Determine the current player from `state.currentPlayer`.
2. Send the current player their **view** (see Player Views below).
3. Receive the player's chosen action.
4. Validate the action (see Valid Actions below). If invalid, reject it and ask again.
5. Place the current player's mark ("X" or "O") in the chosen cell.
6. Increment `moveCount` by 1.
7. Emit a **player_move** event with the player ID, the action (row, col), and the resulting board.
8. Check for a winner or draw (see Winning Conditions and Draw below).
9. If the game is not over, switch `currentPlayer` to the other player and go to step 1.

## Valid Actions

A player's action is a JSON object specifying which cell to mark.

### Action Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "row": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2
    },
    "col": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2
    }
  },
  "required": ["row", "col"]
}
```

### Validation Rules

An action is valid if and only if ALL of the following are true:

1. `row` is an integer in [0, 2].
2. `col` is an integer in [0, 2].
3. `board[row][col]` is `null` (the cell is empty).
4. It is this player's turn (`state.currentPlayer` matches the acting player's ID).

If the action is invalid, do **not** update the state. Inform the player of the error and request a new action.

## Player Views

Tic-Tac-Toe has **no hidden information**. Both players see the full board.

When sending a player their view, provide a JSON object with:

```json
{
  "board": <the full 3x3 board array>,
  "yourMark": "X" or "O",
  "currentPlayer": "<player ID whose turn it is>",
  "moveCount": <number of moves made so far>
}
```

The `yourMark` field tells the player which mark is theirs so they know what symbol they are playing.

## Winning Conditions

A player wins if they have three of their marks in a row in any of these 8 lines:

**Rows (3):**
- `board[0][0], board[0][1], board[0][2]`
- `board[1][0], board[1][1], board[1][2]`
- `board[2][0], board[2][1], board[2][2]`

**Columns (3):**
- `board[0][0], board[1][0], board[2][0]`
- `board[0][1], board[1][1], board[2][1]`
- `board[0][2], board[1][2], board[2][2]`

**Diagonals (2):**
- `board[0][0], board[1][1], board[2][2]`
- `board[0][2], board[1][1], board[2][0]`

Check for a winner after every move. If all three cells in any line contain the same non-null mark, that mark's player wins.

## Draw

If `moveCount` reaches 9 (all cells filled) and no player has won, the game is a draw.

## Scoring

At game end, assign scores to each player:

| Outcome         | Winner | Loser | Both (draw) |
|-----------------|--------|-------|-------------|
| **Score**       | 1      | 0     | 0.5 each    |

## Events

Emit the following events during the game:

1. **game_start** — When the game begins. Include initial state and player IDs.
2. **player_move** — After each valid move. Include the acting player's ID, the action `{ row, col }`, and the updated board.
3. **game_end** — When the game ends. Include the final board, the outcome (`"win"` or `"draw"`), the winner's player ID (if applicable), and the scores for each player.
