param([switch]$EnableGpu, [switch]$CpuOnly)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log = Join-Path $Root 'NHAT_KY_CAI_DAT.txt'
$Id = 'com.autosyncvoice.premiere'
function Say($message) { Write-Host $message; Add-Content -LiteralPath $Log -Value $message -Encoding UTF8 }
try {
    Say 'AUTO SYNC VOICE 0.4.0 - SETUP ONLINE (TU CAI PYTHON + GPU)'
    if ($EnableGpu -and $CpuOnly) { throw 'Khong dung dong thoi EnableGpu va CpuOnly.' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Can Windows 64-bit.' }
    if (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) {
        throw 'Hay luu project va dong Premiere truoc khi cai.'
    }
    $Source = Join-Path $Root 'cep'
    $RuntimeCheck = Join-Path $Root 'scripts\check_runtime.py'
    if (-not (Test-Path -LiteralPath (Join-Path $Source 'CSXS\manifest.xml'))) {
        throw 'Hay giai nen TOAN BO ZIP truoc khi chay CAI_DAT.cmd.'
    }
    if (-not (Test-Path -LiteralPath $RuntimeCheck)) { throw 'Thieu scripts\check_runtime.py. Hay giai nen TOAN BO ZIP moi.' }
    . (Join-Path $Root 'scripts\setup-runtime.ps1')
    $Destination = Join-Path $env:APPDATA ('Adobe\CEP\extensions\' + $Id)
    $DataRoot = Join-Path $env:LOCALAPPDATA 'AutoSyncVoice'
    New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
    $Python = Join-Path $DataRoot 'python-env\Scripts\python.exe'
    if (-not (Get-AsvPythonPath $Python $RuntimeCheck)) {
        Say '[1/4] Tim Python 3.10 - 3.13 (khuyen nghi 3.12)...'
        $BasePython = Find-AsvPython $DataRoot $RuntimeCheck
        if (-not $BasePython) {
            Say 'Chua co Python phu hop. Tu tai Python 3.12.10 64-bit tu python.org (khoang 26 MB)...'
            $Installer = Get-AsvPythonInstaller $DataRoot
            Say 'Da xac minh bo cai. Dang cai Python cho tai khoan hien tai...'
            $BasePython = Install-AsvBasePython $Installer $DataRoot $RuntimeCheck
        }
        $EnvironmentDir = Join-Path $DataRoot 'python-env'
        if (Test-Path -LiteralPath $EnvironmentDir) {
            if ((Get-Item -LiteralPath $EnvironmentDir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Moi truong Python la lien ket, khong tu thay the.' }
            $ResolvedEnvironment = (Resolve-Path -LiteralPath $EnvironmentDir).Path
            $ExpectedEnvironment = [IO.Path]::GetFullPath((Join-Path $DataRoot 'python-env'))
            if ($ResolvedEnvironment -ne $ExpectedEnvironment) { throw 'Duong dan Python khong dung thu muc ung dung.' }
            $OldEnvironment = Join-Path $DataRoot ('python-env-backup-' + [Guid]::NewGuid().ToString('N'))
            Say ('Sao luu moi truong Python hong tai ' + $OldEnvironment)
            Move-Item -LiteralPath $ResolvedEnvironment -Destination $OldEnvironment
        }
        & $BasePython -m venv (Join-Path $DataRoot 'python-env')
        if ($LASTEXITCODE -ne 0) { throw 'Khong tao duoc moi truong Python.' }
    } else {
        Say '[1/4] Python da co - dung lai, khong tai lai.'
    }
    Say '[2/4] Kiem tra bo xu ly Python da co...'
    & $Python $RuntimeCheck --backend --quiet
    if ($LASTEXITCODE -eq 0) {
        Say 'Backend OK - dung lai thu vien da cai, khong tai/cai lai.'
    } else {
        Say 'Cai faster-whisper va PyAV. Can Internet; co the mat vai phut...'
        & $Python -m pip install --upgrade pip
        if ($LASTEXITCODE -ne 0) { throw 'Khong cap nhat duoc pip. Kiem tra Internet.' }
        & $Python -m pip install -r (Join-Path $Source 'backend\requirements.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Khong cai duoc dependencies. Kiem tra thong bao pip phia tren.' }
        $BackendOutput = & $Python $RuntimeCheck --backend
        $BackendStatus = $LASTEXITCODE
        foreach ($Line in $BackendOutput) { Say ([string]$Line) }
        if ($BackendStatus -ne 0) { throw 'Kiem tra backend that bai. Nguyen nhan cu the da ghi o tren va trong NHAT_KY_CAI_DAT.txt.' }
    }
    Say '[Caption] Dung Caption Track goc cua Premiere, khong can FFmpeg/ASS hay anh PNG.'
    $GpuReady = $false
    if (-not $CpuOnly) {
        $GpuRequirements = Join-Path $Source 'backend\requirements-gpu.txt'
        & $Python $RuntimeCheck --gpu-packages $GpuRequirements --quiet
        if ($LASTEXITCODE -eq 0) {
            Say '[GPU] Thu vien da du phien ban - dung lai, khong tai lai.'
        } else {
            Say '[GPU] Tu cai CUDA runtime / cuBLAS / cuDNN. Lan dau tai khoang 1.1 GB, can Internet...'
            & $Python -m pip install --only-binary=:all: -r $GpuRequirements
            if ($LASTEXITCODE -ne 0) { throw 'Khong cai duoc thu vien GPU. Kiem tra Internet/dung luong dia roi chay lai CAI_DAT.cmd. Neu chi dung CPU, chay CAI_DAT_CPU.cmd.' }
        }
        Say '[GPU] Kiem tra DLL, driver va float16...'
        $GpuOutput = & $Python (Join-Path $Root 'scripts\check_gpu.py')
        $GpuStatus = $LASTEXITCODE
        foreach ($Line in $GpuOutput) { Say ([string]$Line) }
        $GpuReady = $GpuStatus -eq 0
        if (-not $GpuReady) {
            if ($EnableGpu) { throw 'Kiem tra GPU that bai. Xem chi tiet phia tren va NHAT_KY_CAI_DAT.txt. Chua cap nhat panel.' }
            Say 'CANH BAO: GPU chua san sang. Van cai panel; chon CPU de su dung. Thu vien GPU da cai, driver NVIDIA can duoc cai/cap nhat rieng.'
        }
    } else {
        Say '[GPU] Bo qua theo lua chon chi dung CPU.'
    }
    Say '[3/4] Cai panel rieng Auto Sync Voice...'
    if (Test-Path -LiteralPath $Destination) {
        if ((Get-Item -LiteralPath $Destination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Thu muc extension la lien ket, khong tu thay the.' }
        $Backup = Join-Path $DataRoot ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        New-Item -ItemType Directory -Path $Backup -Force | Out-Null
        Copy-Item -LiteralPath $Destination -Destination $Backup -Recurse
        $ResolvedDestination = (Resolve-Path -LiteralPath $Destination).Path
        $ExpectedDestination = [IO.Path]::GetFullPath((Join-Path $env:APPDATA ('Adobe\CEP\extensions\' + $Id)))
        if ($ResolvedDestination -ne $ExpectedDestination) { throw 'Duong dan extension khong dung thu muc dich.' }
        Remove-Item -LiteralPath $ResolvedDestination -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $Destination -Recurse -Force
    $Config = @{python=$Python; dataDir=$DataRoot} | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $Destination 'runtime.json'), $Config, [Text.UTF8Encoding]::new($false))
    Say '[4/4] Bat CEP PlayerDebugMode cho tai khoan hien tai...'
    foreach ($Version in 9,10,11,12) {
        $Key = 'HKCU:\Software\Adobe\CSXS.' + $Version
        New-Item -Path $Key -Force | Out-Null
        New-ItemProperty -Path $Key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
    }
    Say 'THANH CONG. Mo Premiere -> Window -> Extensions (Legacy) / Extensions -> Auto Sync Voice.'
    Say 'Lan dau dung Whisper se tai model. Chia deu va SRT/JSON khong can tai model.'
    if ($GpuReady) { Say 'GPU san sang. Trong panel chon Tu chon GPU / CPU hoac NVIDIA GPU; de trong o Python rieng.' }
    Say ('Du lieu va cache: ' + $DataRoot)
    exit 0
} catch {
    Say ('LOI: ' + $_.Exception.Message)
    exit 1
}
