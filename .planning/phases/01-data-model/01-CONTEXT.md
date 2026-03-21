# Phase 1: Data Model - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the core type system and event/log schema for the board game AI framework. This phase locks the data model before any game logic or LLM integration is written. Covers: game-agnostic engine interface, pluggable player interface, event-based logging, JSONL log schema, outcome record, and reproducible game config.

</domain>

<decisions>
## Implementation Decisions

### Event Schema Design
- One event per atomic action (fine-grained granularity)
- Single `reasoning` string field per action event — concise justification only
- Full chain-of-thought stays as agent internal memory, not logged in events
- Event schema must be game-agnostic — no Avalon-specific fields in the core types
- Discussion is an action type (same event schema as other actions like vote, propose, quest)

### Player View Boundary
- Compile-time enforcement — `GameState` and `PlayerView` are structurally separate TypeScript types
- Passing `GameState` where `PlayerView` is expected must be a compile error
- Exact fields TBD during implementation — the decision here is the type separation approach, not the specific fields

### Game Config Format
- JSON format (can migrate to YAML later if needed)
- Single seed controls all game setup randomness (role assignment, starting leader, team sizes)
- Seed does NOT control LLM outputs — reproducibility means same game setup, not same game outcome

### Log and Action History Separation
- Event log is strictly for devs — full observability, everything recorded as JSONL output
- Action history is a game-level concern — each game decides how players access past actions
- Games may reuse events to build action history, or implement custom rules
- Visibility/anonymization (e.g., Avalon quest vote anonymity) is handled by game-defined rules, not the framework
- The framework provides a generic visibility mechanism; games configure it with their specific rules

### Claude's Discretion
- EventBus implementation details
- Outcome record exact structure
- PlayerView and GameState exact field definitions (guided by Avalon needs in Phase 2)
- Log file naming and directory conventions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in decisions above and in:

### Project context
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — FRAME-01, FRAME-02, FRAME-03, DATA-01, DATA-02, DATA-03 requirements
- `.planning/ROADMAP.md` — Phase 1 success criteria

### Research
- `.planning/research/ARCHITECTURE.md` — Component boundaries, generic Game/Player interface pattern, EventBus + Recorder pattern
- `.planning/research/PITFALLS.md` — Hidden information leakage prevention, log schema design pitfalls
- `.planning/research/STACK.md` — Zod for schema validation, Pino for logging

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — this phase establishes the foundational patterns

### Integration Points
- Types defined here will be consumed by all subsequent phases (Avalon rules, LLM agents, CLI, batch mode)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-model*
*Context gathered: 2026-03-21*
