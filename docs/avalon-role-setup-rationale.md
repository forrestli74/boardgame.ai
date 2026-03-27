# Avalon Role Setup Rationale

Research into community-recommended role setups for The Resistance: Avalon, to inform our default configurations per player count.

## Sources

- [Official Rulebook PDF](https://avalon.fun/pdfs/rules.pdf) — Don Eskridge
- [BoardGameGeek — Best roles set for each player's quantity](https://boardgamegeek.com/thread/2695071/best-roles-set-for-each-player-s-quantity)
- [BoardGameGeek — Which characters go together](https://boardgamegeek.com/thread/1044332/which-characters-go-together-and-which-number-play)
- [BoardGameGeek — Which characters to use with group size](https://boardgamegeek.com/thread/1170702/which-resistance-avalon-characters-to-use-with-gro)
- [Avalon-game.com — Rules & Roles](https://avalon-game.com/wiki/rules/)
- [What's Eric Playing — Avalon Role Recommendations](https://whatsericplaying.com/2015/08/10/8-the-resistance-avalon/)
- [Board Game Business — Strategic Analysis](https://boardgame.business/the-resistance-avalon-strategic-analysis/)

## Core Pairing: Merlin + Assassin

Always included. This is what distinguishes Avalon from base Resistance — Merlin has perfect information about Evil (with exceptions), but risks assassination if discovered. The Assassin provides Evil a last-chance win condition that prevents Merlin from being too openly helpful.

## Percival + Morgana (the first addition)

These two are universally recommended as the first optional roles to add:

- **Without Morgana**, Percival knows exactly who Merlin is. This makes protecting Merlin trivial and removes tension.
- **Without Percival**, Morgana has no special ability at all — she only "appears as Merlin to Percival."
- Together, they create a compelling sub-game: Percival sees two thumbs-up but doesn't know which is the real Merlin. Morgana can try to steer Percival wrong.

This pairing is recommended at **all player counts** (5-10) for experienced groups.

## Mordred (added at 7+)

Mordred is hidden from Merlin. The impact depends heavily on Evil team size:

- **5-6 players (2 Evil):** Mordred means Merlin sees only 1 of 2 Evil players — effectively halving Merlin's information. Too punishing for Good.
- **7+ players (3+ Evil):** Mordred means Merlin sees 2 of 3 Evil — still useful information but not overwhelming. Fair trade-off.

The official rulebook hints at this by noting: "For games of 5, be sure to add either Mordred **or** Morgana when playing with Percival" — implying you shouldn't stack both at low counts.

## Oberon (added at 10, sometimes 7)

Oberon is a double-edged sword for Evil: he's an Evil player who doesn't coordinate with the team.

- **5-6 players (2 Evil):** Oberon would mean Evil players can't coordinate at all. Unplayable.
- **7 players (3 Evil):** Borderline. Two Evil can still coordinate, but losing a third hurts. Some experienced groups use it.
- **8-9 players (3 Evil):** Less common — same 3 Evil, and Mordred+Morgana already fill the special slots.
- **10 players (4 Evil):** The sweet spot. Three Evil still coordinate; Oberon adds chaos. Merlin can see Oberon (since Oberon isn't Mordred), giving Good more info but at the cost of Evil being less predictable.

## Why Not All Special Roles at Once?

Stacking Mordred + Morgana + Oberon at lower counts creates conflicting pressures:
- Mordred + Morgana = strong Evil deception
- Oberon = weak Evil coordination

At 7-9 players with only 3 Evil, using all three means every Evil player is "special" with no generic Minion. The Assassin (needed for assassination) would be the only Evil player who both knows the other Evil AND is visible to Merlin. This makes games chaotic rather than strategic.

At 10 players with 4 Evil, there's room: Mordred + Morgana + Oberon + Assassin covers all 4 Evil slots cleanly.

## Lady of the Lake (optional module, 7+)

Provides investigation power to Good — the holder examines one player's loyalty after quests 2, 3, and 4. Recommended at 7+ where the larger player pool makes deduction harder. The rulebook itself says it's "best saved for games of 7 or more people."

## Player-Count-Specific Notes

### 5 Players (3 Good / 2 Evil)

The most constrained setup. Only 2 Evil slots, so at most one special Evil role. The assassination is very swingy — Evil has a 1/3 chance of guessing Merlin (often effectively higher since Merlin's behavior leaks information). Merlin+Percival vs Assassin+Morgana is the standard experienced setup.

### 6 Players (4 Good / 2 Evil)

Same constraints as 5p (only 2 Evil). Identical role recommendations. Some groups add Lady of the Lake here for variety.

### 7 Players (4 Good / 3 Evil)

Widely considered the sweet spot where the game starts to shine. Three Evil enables Mordred as the third special role. The Mordred+Morgana+Assassin Evil lineup is the community gold standard.

### 8 Players (5 Good / 3 Evil)

Same Evil composition as 7p. The extra Good player is a generic Servant. Plays very well with the standard Mordred+Morgana+Assassin lineup.

### 9 Players (6 Good / 3 Evil)

Good has a 2:1 numerical advantage. Many Good players are generic Servants with no special information, which can feel passive. Some groups address this with expansion roles (Tristan/Isolde) or Lady of the Lake.

### 10 Players (6 Good / 4 Evil)

The only count with 4 Evil, making the full Mordred+Morgana+Oberon+Assassin lineup possible and popular. Maximum complexity and deception.

## Decisions for Implementation

Based on this research, our implementation should:

1. **Always include Merlin + Assassin** as required roles.
2. **Use the experienced setup by default** (Percival+Morgana at all counts, Mordred at 7+, Oberon at 10). Beginner setup (Merlin+Assassin only) available as an option.
3. **Allow custom role selection** so players can choose their own combination.
4. **Lady of the Lake** should be an optional module, not on by default.
5. **Expansion roles** (Tristan, Isolde, Lancelot) are out of scope for base implementation.
