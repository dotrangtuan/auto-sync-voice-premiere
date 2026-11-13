# Online setup validation — 2026-11-12

This edition changes installation only; the Premiere panel/backend editing behavior stays at 0.4.0.

## Executed checks

- 15 PowerShell helper tests passed under Windows PowerShell 5.1: pinned hash, publisher/signature rejection, download reuse, partial-file promotion, three-attempt failure handling, quoted installation paths, process exit handling and interpreter rediscovery. Python installer execution was mocked in these tests.
- 50 Python tests passed under Python 3.12.10 with `PYTHONIOENCODING=utf-8`, matching the environment supplied by the real CEP panel. This includes two new GPU package version tests. Without this environment setting, four existing worker tests fail on this Windows code page; the application panel already supplies it, so no runtime change was required.
- Downloaded the real 3.12.10 x64 installer using the new PowerShell downloader. SHA256 and Authenticode checks passed; publisher: Python Software Foundation. The downloaded executable was not run.
- Existing Python interpreter discovery, backend imports and GPU package checks passed using this machine's installed environment.
- Real GPU diagnostic passed on NVIDIA GeForce RTX 3060: CUDA device, required DLLs and float16 available. This is not a Whisper inference test.
- Ran the default installer into isolated test AppData folders, using a disposable virtual environment linked to the existing dependencies. Actual panel files and runtime.json were written in the test directory. Registry writes and the Premiere process check were mocked; the user's installed extension was not changed.
- Reran in strict GPU mode and CPU-only mode; backup/replacement and dependency reuse succeeded.
- With `CUDA_VISIBLE_DEVICES=-1`, default setup displayed the CPU warning and completed; strict GPU setup exited with failure before panel replacement, as intended.
- PowerShell syntax validation passed. Packaged SHA256 manifest and ZIP CRC checks passed.

## Limits

No clean Windows VM was available. Automatic Python installation on a machine with no Python and first-time dependency installation into an empty environment have not been tested end-to-end. Fresh backend/GPU package downloads use the original package requirements. No Premiere timeline creation, save/export or real Whisper inference was run for this setup edition.

## Reproduce

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\setup-runtime.test.ps1
$env:PYTHONIOENCODING='utf-8'
python -m unittest discover -s tests -v
```

`TEST_RESULTS.md` remains the original author's report for the 0.4.0 timeline implementation; it is not a new execution report for this edition.

## EXE wrapper validation

Nine C# tests passed: embedded payload integrity/extraction, corrupt payload rejection, parent/absolute/alternate-stream path rejection, duplicate entry rejection, existing-file preservation, Unicode output, child failure exit codes and simultaneous stdout/stderr draining. The Vietnamese setup window was rendered and visually inspected. No real installation was performed during wrapper validation.
