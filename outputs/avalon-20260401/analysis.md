# Avalon Game Log Analysis — 2026-04-01

20 games, 5 players. Alice+Charlie use v2 (role-agnostic strategy), Bob+Diana+Eve use v1 (evil-only strategy).

## Summary Results

| Player  | Persona | Win Rate | Notes                        |
|---------|---------|----------|------------------------------|
| Alice   | v2      | 8/20 (40%) | Frequently assassinated as Merlin |
| Bob     | v1      | 12/20 (60%) | Confused in 8/20 games       |
| Charlie | v2      | 10/20 (50%) | Most balanced performance     |
| Diana   | v1      | 8/20 (40%) | Confused in 10/20 games       |
| Eve     | v1      | 12/20 (60%) | Confused in 10/20 games       |

Overall: evil won 9/20 games (45%). By three-fails: 5. By assassination: 4.

## Key Finding: v1 Role Confusion is Massive but Paradoxically Helpful

### The Problem

v1 players (Bob, Diana, Eve) are instructed: "You are a master manipulator playing on the evil team." When assigned good roles (Merlin, Percival, Loyal Servant), they consistently believe they ARE evil and must sabotage good:

- Bob confused in **8/20** games (e.g., "Role: Merlin (evil)" in 0001-002)
- Diana confused in **10/20** games (e.g., "Playing as evil. Disguised as loyal-servant" in 0001-002)
- Eve confused in **10/20** games (e.g., "My role is Percival, but I am acting as an evil player" in 0001-002)

In game 0001-002, ALL THREE v1 players had good roles but played as evil. Bob (Merlin) actively sabotaged quests, failing 2 of 3 quest votes. Diana (Loyal Servant) failed 1 quest on the decisive Quest 4.

### The Paradox: Why Confusion Helps v1 Win Rates

Despite this catastrophic confusion, Bob and Eve each win 60%. Several mechanisms explain this:

1. **Confused v1 players mostly vote SUCCESS anyway.** Across 23 confused instances, v1 players cast only 4 fail votes vs 38 success votes. Their "build trust early, fail later" strategy means they succeed on most quests even when confused, because they think they need to "build credibility" as fake good players first.

2. **When they DO sabotage, it counts as evil winning.** In 0001-002, Bob (confused Merlin) sabotaged quests, causing evil to win by three-fails. The scoring system credits evil-team winners. Since confused v1 players effectively become extra evil operatives, this inflates the evil win count, and the actual evil players (Alice/Charlie in that game) benefit from the chaos.

3. **The confusion creates realistic "evil behavior."** A v1 player who genuinely believes they're evil produces organic deception — indistinguishable from an actual evil player. This makes it harder for v2 good players to identify the REAL evil team, since they're surrounded by 3-5 players who all behave suspiciously.

## v2 Merlin Behavior: Good Strategy, Poor Execution Under Pressure

v2 Merlins (Alice) follow the persona guidance well:
- **Never propose perfect teams:** Alice in 0003-001 deliberately included Bob (evil) on her Quest 3 team "to provide cover."
- **Vote imperfectly:** Alice in 0001-001 approved a team with Bob (evil) saying "approving despite Bob being evil allows me to observe."
- **Let others lead:** Alice frequently makes neutral opening statements and defers to the leader.

**However, v2 Merlins collapse under late-game pressure.** When quests reach 2-2, Alice consistently proposes all-good teams (0001-001, 0004-001) and rejects all-evil teams. This behavior change is visible and predictable:

- Alice was assassinated in 3/15 assassination-eligible games where she was Merlin.
- In 0003-001, Bob (assassin) targeted Alice with no specific reasoning — just "I must make a guess" — and hit. Alice's early-neutral-then-late-aggressive pattern was detectable.

## Discussion Quality

| Metric              | v2 (Alice+Charlie) | v1 (Bob+Diana+Eve) |
|---------------------|---------------------|---------------------|
| Empty statements    | 4                   | 1                   |
| Generic statements  | 54                  | 95                  |
| Specific statements | 95                  | 135                 |

Both persona types produce mostly generic discussion. Neither consistently makes the kind of targeted observations the v2 persona demands ("Alice rejected the last two teams that included Bob"). Instead, most statements are variants of:
- "Let's make sure we get a good team"
- "I trust [leader] to put forward a strong team"
- "That last failure was concerning"

v2 players have slightly MORE empty statements (Alice sometimes says nothing as Merlin to avoid revealing herself), but otherwise the discussion quality gap is minimal.

## Assassination Accuracy

- v1 assassins: 3/8 successful (37.5%)
- v2 assassins: 2/7 successful (28.6%)

Both are close to random (33% baseline for 3 good players). Neither persona produces meaningfully better Merlin identification. v1 assassins have a slight edge because their persona explicitly instructs tracking "who the good team protects."

## Quest Sabotage Patterns

No double-fails were observed in any game — both personas successfully follow the "never double-fail" guidance. The v2 persona's explicit warning against double-fails is effective.

When v1 players are genuinely evil, they execute well: building trust early, then failing Quest 3+. Example: Bob as Assassin in 0001-001 succeeded Quests 0-1, then strategically positioned for later fails.

**Critical bug:** v1 players sometimes say "I will fail this quest" in their reasoning/memory but then vote `success: true` in their action. This happened in:
- 0001-001: Bob (assassin) planned to fail Quest 4 but voted success
- 0003-001: Bob (assassin) wrote "I plan to fail the quest" but voted success on Quest 3

This reasoning-action disconnect suggests the LLM's action generation sometimes defaults to "success" despite contrary reasoning, possibly because the v1 persona's "build trust" instruction creates a strong prior toward success votes.

## Why v1 Still Outperforms v2

1. **v1's confusion is accidentally strategic.** When v1 players get good roles and play as evil, they create chaos that benefits the actual evil team. The game effectively has 3-5 "evil-minded" players instead of 2, overwhelming the v2 good players' ability to identify real threats.

2. **v2's role-agnostic strategy doesn't translate to stronger play.** The v2 persona provides excellent strategic advice (never propose perfect teams, vote imperfectly, don't double-fail), but the LLM follows it only loosely. Under pressure (late-game, 2-2 score), v2 Merlins revert to obvious "save the team" behavior that exposes them.

3. **v2 Merlins are too cautious early, too obvious late.** The "let others lead" instruction makes v2 Merlins passive in rounds 1-2 (sometimes producing empty statements), but then they become visibly protective in rounds 3-4. This creates a detectable behavioral signature.

4. **v1's simplicity is a strength.** The v1 persona gives one clear directive: "you are evil, act good." This is easy for the LLM to follow consistently. The v2 persona's nuanced, role-dependent instructions create more cognitive load and more inconsistency.

5. **Scoring mechanics favor v1.** With 3 v1 players and 2 v2, there are more v1 players who can end up on the winning evil team. Additionally, confused v1 players who sabotage good's chances create "phantom evil" that benefits the actual evil side.

## Specific Weaknesses in v2 Strategy

1. **Late-game Merlin exposure.** v2 Merlins consistently propose all-good teams when the score is 2-2, abandoning the "never propose perfect teams" rule precisely when it matters most.
2. **Passive early game.** v2 players make fewer specific observations in early rounds, missing the window to build information and influence.
3. **No counter-strategy for confused opponents.** v2 assumes opponents play their roles correctly. When facing v1 players who are confused about their alignment, v2's deduction logic breaks down.
4. **Empty statements as Merlin.** Alice occasionally says nothing (3 empty statements), which is itself a tell — a Loyal Servant or Percival would always have something to say.

## Suggestions for v3 Strategy

1. **Add an explicit alignment check.** The persona should begin: "Read your role assignment carefully. If you are Merlin, Percival, or Loyal Servant, you are GOOD. If you are Assassin, Morgana, or Minion, you are EVIL. Your goal is determined by your alignment, not this persona." This would have prevented all 23 confusion instances.

2. **Maintain cover under pressure.** Add a rule: "ESPECIALLY when the score is 2-2, do NOT propose an all-good team. Include one evil player even if it risks the quest. Getting assassinated loses the game just as surely as losing quests."

3. **Always speak.** Never produce empty statements. Even a brief "I agree with the leader's choice" is better than silence, which narrows suspicion.

4. **Front-load observations.** Instead of generic early statements, require early observations: track who proposed what, who approved what, and reference specific actions by name. This makes the player appear engaged and analytical from round 1.

5. **Add paranoia about confused opponents.** Include guidance: "Not all players may understand their role correctly. If someone seems to be sabotaging their own team, consider that they may be confused rather than deceptive."

6. **Fix the reasoning-action disconnect.** The v1 persona shows a pattern where reasoning says "fail" but action says "success." The v3 persona should include: "Your action MUST match your stated intention. If you decide to fail a quest, your action must be `success: false`."

7. **Reduce Merlin's behavioral shift.** The biggest v2 weakness is Merlin's visible transition from passive to active. v3 should instruct: "Maintain the SAME level of engagement throughout the game. If you start quiet, stay quiet. If you start analytical, stay analytical."
