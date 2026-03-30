/**
 * System prompt instructing the LLM to act as a rules-faithful game master.
 */
export function buildSystemPrompt(): string {
  return `You are a board game master. Your job is to interpret the provided rules document faithfully and manage the game state.

Responsibilities:
- Maintain accurate game state as a JSON object.
- Track whose turn it is and what actions are valid for each player.
- Handle hidden information: each player's "prompt" must only reference what they are allowed to see according to the rules. Never leak hidden information.
- When a player submits an action, validate it against the current rules and state. Reject invalid actions by re-requesting the same player's turn.
- After each action, check for terminal conditions (win/loss/draw) as defined by the rules.
- Be deterministic: do not invent rules, add house rules, or make subjective judgments. Follow the rules document exactly.
- Use the seed provided at initialization for any randomness required by the rules (shuffling, dice, etc.).

Output format:
- Always respond using the provided tool. Never respond with plain text.
- The tool response must include the complete current game state, action requests for the next player(s), any events that occurred, and whether the game has ended.
- The "state" and event "data" fields must be JSON-encoded strings (use JSON.stringify).
- Each request has a "playerId" and a "prompt" field. The prompt is a natural language question or instruction for that player, describing what they see and what action they need to take. Include all relevant game state visible to that player in the prompt text.
- Players will respond with a plain text answer to your prompt. Design prompts so the expected response format is clear (e.g. "Choose a team of 2 players from: alice, bob, charlie, diana, eve").
- The "scores" field in outcome is an array of {playerId, score} objects, not a map.
- Scoring convention: winners receive score 1, losers receive score 0.`
}

export interface InitMessageOptions {
  rulesDoc: string
  gameId: string
  seed: number
  playerIds: string[]
  options?: unknown
}

/**
 * User message for game initialization.
 * Includes the full rules document, player list, and seed.
 */
export function buildInitMessage(opts: InitMessageOptions): string {
  const playerList = opts.playerIds
    .map((id) => `  - id: "${id}"`)
    .join('\n')

  return `Initialize a new game.

## Rules Document

${opts.rulesDoc}

## Game Configuration

Game ID: ${opts.gameId}
Seed: ${opts.seed}
Players:
${playerList}
${opts.options !== undefined ? `\nOptions: ${JSON.stringify(opts.options)}` : ''}

## Instructions

Set up the initial game state according to the rules. Use the seed for any randomness (shuffling, role assignment, etc.). Return the initial state and prompts for the first player(s) who must act.`
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
Response: ${typeof action === 'string' ? action : JSON.stringify(action, null, 2)}

## Instructions

1. Interpret the player's response in the context of what was asked.
2. If the response doesn't make sense or is invalid, return the same state and re-prompt this player with a clearer question.
3. If valid, apply the action: update the game state, emit events describing what happened.
4. Check for terminal conditions (win/loss/draw).
5. If the game is over, set isTerminal to true and provide the outcome with scores.
6. Otherwise, determine which player(s) must act next and return their prompts.`
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
    const response = typeof action === 'string' ? action : JSON.stringify(action, null, 2)
    return `- Player "${playerId}": ${response}`
  }).join('\n')

  return `Multiple players have submitted actions simultaneously.

## Rules Document

${rulesDoc}

## Current Game State

${JSON.stringify(state, null, 2)}

## Player Responses (in order received)

${actionList}

## Instructions

1. Interpret each player's response in context.
2. For any invalid response, emit an event explaining the rejection and re-prompt that player.
3. For valid responses, apply them all to the game state in the order listed above.
4. After applying all actions, check for terminal conditions (win/loss/draw).
5. If the game is over, set isTerminal to true and provide the outcome with scores.
6. Otherwise, determine which player(s) must act next and return their prompts.`
}
