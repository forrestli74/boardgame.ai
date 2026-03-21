---
phase: 1
slug: data-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `pnpm vitest run src/core` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit && pnpm vitest run src/core`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | FRAME-01 | unit (type-level) | `pnpm tsc --noEmit` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | FRAME-01 | unit | `pnpm vitest run src/core/game.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 0 | FRAME-02 | unit | `pnpm vitest run src/core/player.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 0 | FRAME-03 | unit | `pnpm vitest run src/core/event-bus.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 0 | FRAME-03 | integration | `pnpm vitest run src/logging/recorder.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 0 | DATA-01 | unit | `pnpm vitest run src/core/events.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-07 | 01 | 0 | DATA-01 | unit | `pnpm vitest run src/core/events.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-08 | 01 | 0 | DATA-01 | integration | `pnpm vitest run src/logging/recorder.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-09 | 01 | 0 | DATA-02 | unit | `pnpm vitest run src/core/types.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-10 | 01 | 0 | DATA-03 | unit | `pnpm vitest run src/core/types.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-11 | 01 | 0 | DATA-03 | unit | `pnpm vitest run src/core/types.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config
- [ ] `src/core/events.test.ts` — stubs for DATA-01, FRAME-03
- [ ] `src/core/types.test.ts` — stubs for DATA-02, DATA-03
- [ ] `src/core/game.test.ts` — stubs for FRAME-01
- [ ] `src/core/player.test.ts` — stubs for FRAME-02
- [ ] `src/core/event-bus.test.ts` — stubs for FRAME-03 EventBus
- [ ] `src/logging/recorder.test.ts` — stubs for FRAME-03 Recorder, DATA-01 JSONL
- [ ] `package.json` test scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`
- [ ] Framework install: `pnpm add -D vitest @types/node`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `GameState` not assignable to `PlayerView` | FRAME-01 | Compile-time type check | Run `pnpm tsc --noEmit` — verify type error when passing GameState as PlayerView |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
