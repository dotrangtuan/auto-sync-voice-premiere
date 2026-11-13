from pathlib import Path
import hashlib
import zipfile

here = Path(__file__).resolve().parent
source = here.parent
wrapper = '''$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUNBUFFERED = '1'
& (Join-Path $PSScriptRoot 'install.ps1')
exit $LASTEXITCODE
'''
with zipfile.ZipFile(here/'payload.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for path in sorted(source.rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts:
            continue
        rel = path.relative_to(source)
        if rel.parts[0] not in ('cep','scripts','licenses') and rel.as_posix() not in ('install.ps1','uninstall.ps1','PROVENANCE.md'):
            continue
        if path.suffix == '.pyc':
            continue
        content = path.read_bytes()
        if rel.as_posix() == 'install.ps1':
            text = content.decode('utf-8-sig')
            text = text.replace('Hay giai nen TOAN BO ZIP truoc khi chay CAI_DAT.cmd.', 'Du lieu bo cai bi thieu. Hay tai lai Setup.exe.')
            text = text.replace('Thieu scripts\\check_runtime.py. Hay giai nen TOAN BO ZIP moi.', 'Thieu bo kiem tra Python. Hay tai lai Setup.exe.')
            text = text.replace('Kiem tra Internet/dung luong dia roi chay lai CAI_DAT.cmd. Neu chi dung CPU, chay CAI_DAT_CPU.cmd.', 'Kiem tra Internet/dung luong dia roi bam Thu lai.')
            content = text.encode('utf-8-sig')
        archive.writestr(rel.as_posix(),content)
    archive.writestr('run-setup.ps1',wrapper.encode('utf-8-sig'))
digest = hashlib.sha256((here/'payload.zip').read_bytes()).hexdigest()
(here/'BuildInfo.cs').write_text('namespace AutoSyncVoiceSetup { public static class BuildInfo { public const string PayloadHash = "'+digest+'"; } }',encoding='utf-8')
print('Payload bytes:',(here/'payload.zip').stat().st_size)
