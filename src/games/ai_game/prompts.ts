import type { GameConfig } from '../../core/types.js'

/**
 * System prompt instructing the LLM to act as a rules-faithful game master.
 */
export function buildSystemPrompt(): string {
  return `You are a board game master. Your job is to interpret the provided rules document faithfully and manage the game state.

Responsibilities:
- Maintain accurate game state as a JSON object.
- Track whose turn it is and what actions are valid for each player.
- Handle hidden information: each player's "view" must contain ONLY what they are allowed to see according to the rules. Never leak hidden information.
- When a player submits an action, validate it against the current rules and state. Reject invalid actions by re-requesting the same player's turn.
- After each action, check for terminal conditions (win/loss/draw) as defined by the rules.
- Be deterministic: do not invent rules, add house rules, or make subjective judgments. Follow the rules document exactly.
- Use the seed provided at initialization for any randomness required by the rules (shuffling, dice, etc.).

Output format:
- Always respond using the provided tool. Never respond with plain text.
- The tool response must include the complete current game state, action requests for the next player(s), any events that occurred, and whether the game has ended.
- The "state", "view", "actionSchema", and event "data" fields must be JSON-encoded strings (use JSON.stringify), not raw objects. For example: "state": "{\"board\":[[null,null,null]],\"currentPlayer\":\"p1\"}"
- The "actionSchema" field must be a JSON Schema string with "type", "properties", and "required" fields.
- The "scores" field in outcome is an array of {playerId, score} objects, not a map.`
}

/**
 * User message for game initialization.
 * Includes the full rules document, player list, and seed.
 */
export function buildInitMessage(rulesDoc: string, config: GameConfig): string {
  const playerList = config.players
    .map((p) => `  - id: "${p.id}", name: "${p.name}"`)
    .join('\n')

  return `Initialize a new game.

## Rules Document

${rulesDoc}

## Game Configuration

Game ID: ${config.gameId}
Seed: ${config.seed}
Players:
${playerList}
${config.options !== undefined ? `\nOptions: ${JSON.stringify(config.options)}` : ''}

## Instructions

Set up the initial game state according to the rules. Use the seed for any randomness (shuffling, role assignment, etc.). Return the initial state and action requests for the first player(s) who must act.`
}

/**
 * User message for handling a player action.
 * Includes the full rules document, current state, and the player's action.
 */
export function buildActionMessage(
  rulesDoc: string,
  state: Record<string, unknown>,
  playerId: string,
  action: unknown,
): string {
  return `A player has submitted an action.

## Rules Document

${rulesDoc}

## Current Game State

${JSON.stringify(state, null, 2)}

## Player Action

Player: "${playerId}"
Action: ${JSON.stringify(action, null, 2)}

## Instructions

1. Validate the action against the rules and current state.
2. If invalid, return the same state and re-request an action from this player with an explanation in an event.
3. If valid, apply the action: update the game state, emit events describing what happened.
4. Check for terminal conditions (win/loss/draw).
5. If the game is over, set isTerminal to true and provide the outcome with scores.
6. Otherwise, determine which player(s) must act next and return their action requests with appropriate views and action schemas.`
}

/**
 * User message for handling multiple simultaneous player actions in a batch.
 */
export function buildBatchActionMessage(
  rulesDoc: string,
  state: Record<string, unknown>,
  actions: Array<{ playerId: string; action: unknown }>,
): string {
  const actionList = actions.map(({ playerId, action }) => {
    if (action === null) {
      return `- Player "${playerId}": Failed to submit a valid action (treat as abstain/skip per rules)`
    }
    return `- Player "${playerId}": ${JSON.stringify(action, null, 2)}`
  }).join('\n')

  return `Multiple players have submitted actions simultaneously.

## Rules Document

${rulesDoc}

## Current Game State

${JSON.stringify(state, null, 2)}

## Player Actions (in order received)

${actionList}

## Instructions

1. Validate each action against the rules and current state.
2. For any invalid action, emit an event explaining the rejection and re-request that player's turn.
3. For valid actions, apply them all to the game state in the order listed above.
4. After applying all actions, check for terminal conditions (win/loss/draw).
5. If the game is over, set isTerminal to true and provide the outcome with scores.
6. Otherwise, determine which player(s) must act next and return their action requests.`
}

