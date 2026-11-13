# Validation — 0.4.0 batch timeline build — 2026-11-06

Executed on Linux against package source, with Node 24 and Python. No real Adobe Premiere, Windows installation, or Whisper/GPU inference was available.

| Check | Result |
|---|---|
| Python planner / caption / worker / installer / GPU / recognizer contracts | 48 passed |
| Existing host contracts | 22 passed |
| 0.3.1 fast-build contracts | 14 passed |
| New batch-build contracts | 17 passed |
| Motion, including redraw coalescing and rollback | 25 passed |
| Panel DOM contracts | 6 passed |
| Actual panel + actual JSX with simulated Adobe/Python integration | 5 passed |
| Total automated cases | 137 passed |
| Panel JavaScript syntax and manifest XML | Passed |
| Chromium visual smoke test | Blocked before execution: Playwright Chromium binary unavailable |
| Actual Premiere install/import/render/export and real performance | Not run |

## New coverage

Eight-image one-import/one-processing-call path; delayed/reordered import DOM; delayed insertions; mixed video linked-audio cleanup; repeated image shot deduplication; partial/rejected bulk imports with no resubmission; changed preload/batch requests; Stop during import/insert; project/sequence/track locks/counts and boundary edits; interior changes at checkpoint, before narration, and during narration; native caption failure/uncertainty and idempotent replay; linear geometry-check scaling; one requested UI refresh per motion clip; endpoint parity and failed deferred-write rollback; saved setting migration; default batch UI driving real JSX through simulated CEP; profiling on completion/failure/stop; no silent mode fallback.

## Reproducible operation-count comparison

```sh
node tests/benchmark-batch.js /path/to/0.3.1/cep/host.jsx 500
```

500 unique images plus narration; immediate mocked DOM; no motion or actual media IO. Counters exclude begin/profiling calls. This is not a real Adobe wall-clock benchmark.

| Metric | 0.3.1 fast | 0.4.0 batch |
|---|---:|---:|
| Processing + preload bridge calls | 501 | 80 |
| Native media import calls | 501 | 17 |
| Clip geometry verification visits | 502,002 | 6,000 |
| Media path reads in mock | 1,001 | 1,001 |
| Full ledger audits | Not applicable | 6 |
| Scheduled polling wait (seconds) | 0 | 0 |

Motion tests separately show requested UI refreshes: zoom 5 → 1; pan 9 → 1. Real Premiere may schedule additional redraws internally. No claim is made about render speed or inference speed.

## Verification policy

Batch mode always validates the new clip, counts/locks and project/sequence identity. It checks first/tail clips continuously, and full geometry at geometrically spaced checkpoints (32/64/128/...), before/after narration and around caption creation. It stores the expected completed rows independently. Interior edits can remain unnoticed until the next complete audit, so users must not edit while building. No success is reported before final checks. The legacy per-step audit modes remain available for a new build.

The build timeout is cooperative (~80 ms/32 transitions/8 clips per host call); individual Adobe operations can exceed it. Stop waits for the current native call. Failed/partial native imports and caption calls are never blindly retried. Caption content/style readback remains limited by the existing CEP design.

## Commands

```sh
python -m unittest discover -s tests -v
node --test tests/host.test.js tests/fast-build.test.js tests/batch-build.test.js tests/motion.test.js
npm install --no-save jsdom@26.1.0
node --test tests/ui.dom.test.js tests/ui.batch.test.js
node --check cep/panel.js
```

## Required machine acceptance

Install with Premiere closed; select batch mode. Build the same project/media/shot/motion settings in batch and 0.3.1-style modes into separate new sequences. Compare `build-profile.json` wallSeconds and API costs, then compare visual clip durations, keyframes, caption timings and narration. Test slow media storage and stop, save/reopen and export. Do not describe simulated operation-count reductions as measured real-world speedup.
