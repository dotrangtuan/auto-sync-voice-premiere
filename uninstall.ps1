$ErrorActionPreference = 'Stop'
try {
    if (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Dong Premiere truoc khi go.' }
    $Target = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.autosyncvoice.premiere'
    if (Test-Path -LiteralPath $Target) {
        if ((Get-Item -LiteralPath $Target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Khong go thu muc dang la lien ket.' }
        Remove-Item -LiteralPath $Target -Recurse -Force
    }
    Write-Host 'Da go panel Auto Sync Voice. Python, model va ket qua van giu tai %LOCALAPPDATA%\AutoSyncVoice.'
    Write-Host 'PlayerDebugMode duoc giu de khong anh huong Auto Queue va cac extension khac.'
    exit 0
} catch { Write-Host $_.Exception.Message; exit 1 }
