---
phase: 1
slug: data-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
updated: 2026-03-22
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
| 01-01-01 | 01 | 1 | — | setup | `pnpm typecheck` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FRAME-01, DATA-02, DATA-03 | unit | `pnpm vitest run src/core/types.test.ts src/core/game.test.ts src/core/player.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DATA-01 | unit | `pnpm vitest run src/core/events.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | FRAME-01, FRAME-02, FRAME-03 | unit | `pnpm vitest run src/core/engine.test.ts src/core/recorder.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config
- [ ] `src/core/types.test.ts` — stubs for FRAME-01, DATA-02, DATA-03
- [ ] `src/core/events.test.ts` — stubs for DATA-01
- [ ] `src/core/game.test.ts` — stubs for FRAME-01 Game interface
- [ ] `src/core/player.test.ts` — stubs for FRAME-02 Player interface
- [ ] `src/core/engine.test.ts` — stubs for FRAME-01 Engine mediator
- [ ] `src/core/recorder.test.ts` — stubs for FRAME-03 Recorder JSONL
- [ ] `package.json` test scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`
- [ ] Framework install: `pnpm add -D vitest @types/node`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
