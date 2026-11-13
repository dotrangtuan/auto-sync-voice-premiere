# Pure helper contract tests. No network, installers, registry or extension changes.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $Root 'scripts\setup-runtime.ps1')
$script:Passed = 0
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Case([string]$Name, [scriptblock]$Body) {
    & $Body
    $script:Passed++
    Write-Host ('PASS: ' + $Name)
}
function Throws([scriptblock]$Body, [string]$Pattern) {
    $Caught = $null
    try { & $Body | Out-Null } catch { $Caught = $_.Exception.Message }
    Assert ($Caught -and $Caught -match $Pattern) ('Expected error matching ' + $Pattern + '; got ' + $Caught)
}

Case 'Reject missing installer' {
    Assert (-not (Test-AsvPythonInstaller 'Z:\asv-nonexistent\python.exe')) 'Missing file accepted'
}
Case 'Reject wrong file hash before signature checks' {
    function Test-Path { return $true }
    function Get-FileHash { return @{Hash='wrong'} }
    function Get-AuthenticodeSignature { throw 'Should not reach signature check' }
    Assert (-not (Test-AsvPythonInstaller 'fake.exe')) 'Bad hash accepted'
}
Case 'Reject untrusted publisher' {
    function Test-Path { return $true }
    function Get-FileHash { return @{Hash='67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb'} }
    function Get-AuthenticodeSignature { return @{Status='Valid';SignerCertificate=@{Subject='CN=Other'}} }
    Assert (-not (Test-AsvPythonInstaller 'fake.exe')) 'Bad publisher accepted'
}
Case 'Reject invalid signature' {
    function Test-Path { return $true }
    function Get-FileHash { return @{Hash='67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb'} }
    function Get-AuthenticodeSignature { return @{Status='NotTrusted';SignerCertificate=@{Subject='CN=Python Software Foundation, O=Python Software Foundation'}} }
    Assert (-not (Test-AsvPythonInstaller 'fake.exe')) 'Untrusted signature accepted'
}
Case 'Accept pinned official signed installer' {
    function Test-Path { return $true }
    function Get-FileHash { return @{Hash='67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb'} }
    function Get-AuthenticodeSignature { return @{Status='Valid';SignerCertificate=@{Subject='CN=Python Software Foundation, O=Python Software Foundation'}} }
    Assert (Test-AsvPythonInstaller 'fake.exe') 'Official file rejected'
}
Case 'Reuse cached verified download without network' {
    function New-Item {}
    function Test-AsvPythonInstaller { return $true }
    function Invoke-WebRequest { throw 'Network should not be used' }
    $Result = Get-AsvPythonInstaller 'C:\ASV test'
    Assert ($Result -eq 'C:\ASV test\downloads\python-3.12.10-amd64.exe') 'Wrong cache path'
}
Case 'Download to partial then verify before promoting' {
    $script:Events = @()
    function New-Item {}
    function Test-AsvPythonInstaller { param($Path); $script:Events += ('verify:' + $Path); return $Path.EndsWith('.part') }
    function Invoke-WebRequest { param($Uri,$OutFile,[switch]$UseBasicParsing,$TimeoutSec); $script:Events += 'download'; Assert ($Uri -eq 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe') 'Unexpected origin'; Assert ($OutFile.EndsWith('.part')) 'Not partial' }
    function Move-Item { param($LiteralPath,$Destination,[switch]$Force); $script:Events += 'promote' }
    Get-AsvPythonInstaller 'C:\ASV test' | Out-Null
    Assert ($script:Events.Count -eq 4 -and $script:Events[1] -eq 'download' -and $script:Events[3] -eq 'promote') 'Wrong download ordering'
}
Case 'Network failure retries three times and preserves cached file' {
    $script:Attempts = 0
    function New-Item {}
    function Test-AsvPythonInstaller { return $false }
    function Invoke-WebRequest { $script:Attempts++; throw 'network failed' }
    function Move-Item { throw 'Should not promote failure' }
    Throws { Get-AsvPythonInstaller 'C:\ASV test' } 'Khong tai/xac minh'
    Assert ($script:Attempts -eq 3) 'Wrong retry count'
}
Case 'Failed verification never installs or promotes download' {
    function New-Item {}
    function Test-AsvPythonInstaller { return $false }
    function Invoke-WebRequest {}
    function Move-Item { throw 'Should not promote failure' }
    Throws { Get-AsvPythonInstaller 'C:\ASV test' } 'SHA256'
}
Case 'Install uses private quoted target without PATH or launcher changes' {
    function Test-AsvPythonInstaller { return $true }
    function Start-Process {
        param($FilePath,$ArgumentList,$WindowStyle,[switch]$Wait,[switch]$PassThru)
        Assert ($WindowStyle -eq 'Hidden' -and $Wait -and $PassThru) 'Incorrect process handling'
        Assert ($ArgumentList -contains 'TargetDir="C:\ASV test\python-base"') 'Unquoted target'
        Assert ($ArgumentList -contains 'PrependPath=0' -and $ArgumentList -contains 'Include_launcher=0' -and $ArgumentList -contains 'InstallAllUsers=0') 'Unexpected system changes'
        return @{ExitCode=0}
    }
    function Get-AsvPythonPath { return 'C:\ASV test\python-base\python.exe' }
    Assert ((Install-AsvBasePython 'fake.exe' 'C:\ASV test' 'check.py') -eq 'C:\ASV test\python-base\python.exe') 'Wrong Python path'
}
Case 'Reject unverified installer before launch' {
    function Test-AsvPythonInstaller { return $false }
    function Start-Process { throw 'Must not launch' }
    Throws { Install-AsvBasePython 'fake.exe' 'C:\ASV test' 'check.py' } 'chua duoc xac minh'
}
Case 'Report installer exit failure with log location' {
    function Test-AsvPythonInstaller { return $true }
    function Start-Process { return @{ExitCode=1603} }
    Throws { Install-AsvBasePython 'fake.exe' 'C:\ASV test' 'check.py' } '1603.*python-setup.log'
}
Case 'Accept reboot-required exit only if Python is usable' {
    function Test-AsvPythonInstaller { return $true }
    function Start-Process { return @{ExitCode=3010} }
    function Get-AsvPythonPath { return 'usable-python.exe' }
    Assert ((Install-AsvBasePython 'fake.exe' 'C:\ASV test' 'check.py') -eq 'usable-python.exe') '3010 rejected'
}
Case 'Fail clearly when installer succeeds but Python is unusable' {
    function Test-AsvPythonInstaller { return $true }
    function Start-Process { return @{ExitCode=0} }
    function Get-AsvPythonPath { return $null }
    function Find-AsvPython { return $null }
    Throws { Install-AsvBasePython 'fake.exe' 'C:\ASV test' 'check.py' } 'Python chua san sang'
}
Case 'Discover existing Python after installer target is redirected' {
    function Test-AsvPythonInstaller { return $true }
    function Start-Process { return @{ExitCode=0} }
    function Get-AsvPythonPath { return $null }
    function Find-AsvPython { return 'registered-python.exe' }
    Assert ((Install-AsvBasePython 'fake.exe' 'C:\ASV test' 'check.py') -eq 'registered-python.exe') 'Registry fallback not used'
}
Write-Host ('TOTAL: ' + $script:Passed + ' passed')
