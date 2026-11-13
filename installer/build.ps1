param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $Compiler)) { throw 'Windows .NET Framework compiler not found.' }
& $Python (Join-Path $PSScriptRoot 'build_payload.py')
if ($LASTEXITCODE -ne 0) { throw 'Payload build failed.' }
$Dist = Join-Path $Repo 'dist'
New-Item -ItemType Directory -Path $Dist -Force | Out-Null
$Target = Join-Path $Dist 'Auto-Sync-Voice-0.4.0-Setup.exe'
& $Compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:' + $Target) ('/win32manifest:' + (Join-Path $PSScriptRoot 'app.manifest')) ('/resource:' + (Join-Path $PSScriptRoot 'payload.zip') + ',AutoSyncVoice.payload.zip') /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll (Join-Path $PSScriptRoot 'Setup.cs') (Join-Path $PSScriptRoot 'BuildInfo.cs')
if ($LASTEXITCODE -ne 0) { throw 'EXE compilation failed.' }
Get-FileHash -LiteralPath $Target -Algorithm SHA256
