# Provenance

This project was prepared for the user from the supplied `Auto-Queue-Windows-1.8.21-sourceCode.zip`.

Reused/adapted integration ideas: CEP/ExtendScript bridge, `qe.project.newSequence` with a sequence preset, `Track.overwriteClip`, tick-based trim and readback, staged import/placement, sequence fingerprint checks, and current-user CEP installation.

`cep/presets/base.sqpreset` is adapted from the user's supplied `cep/desktop/presets/mau hoat hinh.sqpreset` with the display name changed to Auto Sync Voice; at runtime the panel creates a job-specific preset with the selected dimensions, FPS, and 48 kHz audio. Other editing-mode settings remain.

`cep/host.jsx` adapts the supplied project's integration pattern. Original third-party rights in supplied material are not changed by this package; this document does not grant a new license to that material.

The planner is a new implementation informed by the previously reviewed SyncVideo-Audio architecture. Its design retains ordered media and transcript/word matching, adds direct timestamp mode and bounded numbering validation, and uses natural-speed video loops rather than variable-speed video fitting.

Version 0.2.0 replaces the former ASS/PNG caption renderer with a new UTF-8 SRT writer and a native Premiere Caption Track. The previous font assets and imageio-ffmpeg caption dependency are removed from this distribution. The legacy SyncVideo-Audio MIT notice is retained for provenance.

The native host integration follows the API usage demonstrated in Adobe's PProPanel `importSrtAddToCaptionTrack`: import an SRT project item, then call `sequence.createCaptionTrack(item, 0)`. Implementation here adds staged import, capability checks, single-call failure handling and replay protection. Reference: https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx .

Dependencies are installed from their upstream distributions by `install.ps1` and retain their own licenses. Models and Python runtimes are not included in this ZIP.

Upstream references:

- Auto Queue source supplied by user, version 1.8.21.
- https://github.com/yudgunH/SyncVideo-Audio/tree/dc77cfb635bfb4734527e18ca3d0af20400b9798
- https://github.com/Adobe-CEP/Samples/tree/master/PProPanel
- https://github.com/SYSTRAN/faster-whisper
- https://github.com/OpenNMT/CTranslate2
- https://github.com/PyAV-Org/PyAV

GPU requirements depend on the installed CTranslate2 version. `CAI_DAT_GPU.cmd` installs pinned NVIDIA CUDA 12/cuDNN 9 wheels into the app venv and runs DLL/device/float16 checks. The worker registers their DLL directories within its own process. CPU mode is supported. Native caption import is independent of the Whisper device selection.


## Motion update — 0.3.0

The six-preset cycle, balanced still-image shot splitting (default 6 seconds), and native motion constants are adapted from `planner.py` and `capcut_keyframes.py` in SyncVideo-Audio at commit `dc77cfb635bfb4734527e18ca3d0af20400b9798`, checked from the repository supplied by the user. Copyright (c) 2026 YudgnuH (Nguyễn Duy Hưng); MIT notice is preserved in `licenses/SyncVideo-Audio-MIT.txt`.

Original native values: zoom 0.08, pan 0.025, overscan 0.06, two linear keyframes. This implementation translates them into Premiere's built-in Motion Scale and normalized Position; Y direction is converted, and endpoint time uses the last visible source frame. Relative fitted scale is retained; there is no automatic source crop-fill. The upstream FFmpeg renderer uses different perspective/easing and is not ported. Upstream video speed adjustment is also not ported.

Sources:
- https://github.com/yudgunH/SyncVideo-Audio/blob/dc77cfb635bfb4734527e18ca3d0af20400b9798/src/syncvideo_audio/capcut_keyframes.py
- https://github.com/yudgunH/SyncVideo-Audio/blob/dc77cfb635bfb4734527e18ca3d0af20400b9798/src/syncvideo_audio/planner.py
- https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx (ComponentParam keyframe operations and linear interpolation constant)
