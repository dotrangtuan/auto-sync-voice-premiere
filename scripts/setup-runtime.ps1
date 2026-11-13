# Loaded by install.ps1; defining these helpers does not install anything.
function Get-AsvPythonPath {
    param([string]$Executable, [string]$Check, [string[]]$PrefixArgs = @())
    if (-not $Executable) { return $null }
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $Result = @(& $Executable @PrefixArgs $Check --python-path --quiet 2>$null)
        if ($LASTEXITCODE -eq 0 -and $Result.Count -eq 1 -and (Test-Path -LiteralPath ([string]$Result[0]) -PathType Leaf)) {
            return [string]$Result[0]
        }
    } catch {
        return $null
    } finally { $ErrorActionPreference = $PreviousPreference }
    return $null
}

function Find-AsvPython {
    param([string]$DataRoot, [string]$Check)
    $Candidate = Get-AsvPythonPath (Join-Path $DataRoot 'python-base\python.exe') $Check
    if ($Candidate) { return $Candidate }
    $Launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($Launcher) {
        foreach ($Version in @('-3.12','-3.11','-3.13','-3.10')) {
            $Candidate = Get-AsvPythonPath $Launcher.Source $Check @($Version)
            if ($Candidate) { return $Candidate }
        }
    }
    # Discover registered Python even when PATH and the launcher are absent.
    foreach ($Hive in @('HKCU:', 'HKLM:')) {
        foreach ($Version in @('3.12','3.11','3.13','3.10')) {
            $Key = Get-Item -LiteralPath ($Hive + '\Software\Python\PythonCore\' + $Version + '\InstallPath') -ErrorAction SilentlyContinue
            if ($Key) {
                $Directory = [string]$Key.GetValue('')
                if ($Directory) {
                    $Candidate = Get-AsvPythonPath (Join-Path $Directory 'python.exe') $Check
                    if ($Candidate) { return $Candidate }
                }
            }
        }
    }
    $Command = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($Command -and $Command.Source -notlike '*WindowsApps*') {
        return Get-AsvPythonPath $Command.Source $Check
    }
    return $null
}

function Test-AsvPythonInstaller {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    # Python.org Windows x64 installer 3.12.10, verified when this package was built.
    $Expected = '67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb'
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Expected) { return $false }
    $Signature = Get-AuthenticodeSignature -LiteralPath $Path
    return ($Signature.Status -eq 'Valid' -and $Signature.SignerCertificate.Subject -match '(^|,\s*)CN=Python Software Foundation(,|$)')
}

function Get-AsvPythonInstaller {
    param([string]$DataRoot)
    $Downloads = Join-Path $DataRoot 'downloads'
    New-Item -ItemType Directory -Path $Downloads -Force | Out-Null
    $Installer = Join-Path $Downloads 'python-3.12.10-amd64.exe'
    if (Test-AsvPythonInstaller $Installer) { return $Installer }
    $Partial = $Installer + '.part'
    $PreviousProgress = $ProgressPreference
    try {
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        for ($Attempt = 1; $Attempt -le 3; $Attempt++) {
            try {
                Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile $Partial -TimeoutSec 300
                if (-not (Test-AsvPythonInstaller $Partial)) { throw 'Bo cai Python khong qua kiem tra SHA256/chu ky Python Software Foundation.' }
                Move-Item -LiteralPath $Partial -Destination $Installer -Force
                return $Installer
            } catch {
                if ($Attempt -eq 3) { throw ('Khong tai/xac minh duoc Python. Kiem tra Internet va ngay gio Windows, roi chay lai. ' + $_.Exception.Message) }
            }
        }
    } finally { $ProgressPreference = $PreviousProgress }
}

function Install-AsvBasePython {
    param([string]$Installer, [string]$DataRoot, [string]$Check)
    if (-not (Test-AsvPythonInstaller $Installer)) { throw 'Khong chay bo cai Python chua duoc xac minh.' }
    $Target = Join-Path $DataRoot 'python-base'
    $SetupLog = Join-Path $DataRoot 'python-setup.log'
    $Arguments = @('/quiet', 'InstallAllUsers=0', ('TargetDir="' + $Target + '"'),
        'PrependPath=0', 'Include_launcher=0', 'InstallLauncherAllUsers=0',
        'Include_pip=1', 'Include_test=0', 'Include_doc=0', 'Include_tcltk=0',
        'Include_dev=0', 'Shortcuts=0', 'AssociateFiles=0', '/log', ('"' + $SetupLog + '"'))
    $Process = Start-Process -FilePath $Installer -ArgumentList $Arguments -WindowStyle Hidden -Wait -PassThru
    if ($Process.ExitCode -notin @(0,3010)) {
        throw ('Cai Python that bai (ma ' + $Process.ExitCode + '). Xem ' + $SetupLog)
    }
    $Candidate = Get-AsvPythonPath (Join-Path $Target 'python.exe') $Check
    if (-not $Candidate) { $Candidate = Find-AsvPython $DataRoot $Check }
    if (-not $Candidate) {
        throw ('Python chua san sang. Thu khoi dong lai Windows roi chay lai bo cai. Xem ' + $SetupLog)
    }
    return $Candidate
}
