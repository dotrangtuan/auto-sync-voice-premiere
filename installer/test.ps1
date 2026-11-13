param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build.ps1') -Python $Python
$Repo = Split-Path -Parent $PSScriptRoot
$Compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$Build = Join-Path $PSScriptRoot '.build'
New-Item -ItemType Directory -Path $Build -Force | Out-Null
$Exe = Join-Path $Repo 'dist\Auto-Sync-Voice-0.4.0-Setup.exe'
$Tests = Join-Path $Build 'SetupTests.exe'
& $Compiler /nologo /target:exe /platform:x64 ('/out:' + $Tests) ('/reference:' + $Exe) /reference:System.dll /reference:System.Core.dll /reference:System.IO.Compression.dll (Join-Path $PSScriptRoot 'SetupTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
Copy-Item -LiteralPath $Exe -Destination $Build -Force
& $Tests (Join-Path $Build ('tests-' + [Guid]::NewGuid().ToString('N')))
if ($LASTEXITCODE -ne 0) { throw 'Setup tests failed.' }
