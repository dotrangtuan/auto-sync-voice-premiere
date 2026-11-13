# 0.4.0 design decisions

Chosen: native batch orchestration, bounded bulk imports, incremental expected geometry ledger with mandatory final audits, one requested Motion UI refresh per clip, plus per-stage profiling. These use the same editable native clips, Motion values and caption creation path as the existing package. No audio alignment, shot-count, sequence dimensions or media resolution changes were introduced.

Considered: generating a whole FCP XML sequence offline and importing it once. This can remove per-clip scripting calls, but introduces a new interchange path requiring target-Premiere checks for still-image fitting, motion conversion and captions. It was not shipped unverified as the default or as a misleading guaranteed speedup. The chosen implementation reduces known script overhead while retaining the already used native representation.

Considered: CUDA for sequence editing. The current GPU code accelerates Whisper inference; it does not execute CEP DOM mutations. No extra CUDA installation was added for timeline operations.

Research references consulted 2026-11-06 (no Adobe source copied):
- Adobe PProPanel sample: https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx — array-based media import and native parameter API examples.
- Adobe import/conversion limitations: https://helpx.adobe.com/premiere/desktop/organize-media/import-files/migrate-from-final-cut-pro-x.html
- Adobe XML export limitations: https://helpx.adobe.com/premiere/desktop/render-and-export/export-files/export-a-project-as-a-final-cut-pro-xml-file.html

Limits: native insertion remains sequential, not parallel; native import/keyframe latency may dominate on the user's machine. Batch mode detects interior edits at full audits instead of immediately. Performance figures in TEST_RESULTS.md are mock operation counts only. If real speed remains poor, use build-profile.json to locate host costs rather than promising a hardware speedup.
