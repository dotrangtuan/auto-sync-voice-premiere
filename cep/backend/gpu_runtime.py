"""Locate NVIDIA pip DLLs in this interpreter; never modify Windows global PATH."""
import ctypes
from importlib import metadata
import os
from pathlib import Path
import sys

PACKAGES = ('nvidia-cuda-runtime-cu12', 'nvidia-cuda-nvrtc-cu12', 'nvidia-cublas-cu12', 'nvidia-cudnn-cu12')
_directory_handles = {}
_libraries = {}


def dll_directories():
    """Use wheel RECORD paths, so bin/lib layout changes are supported."""
    result = []
    for package in PACKAGES:
        try:
            distribution = metadata.distribution(package)
        except metadata.PackageNotFoundError:
            continue
        for entry in distribution.files or ():
            if str(entry).lower().endswith('.dll'):
                path = Path(distribution.locate_file(entry)).resolve()
                if path.is_file() and path.parent not in result:
                    result.append(path.parent)
    return result


def prepare_cuda_dlls():
    if sys.platform != 'win32':
        return []
    directories = dll_directories()
    for directory in directories:
        key = str(directory)
        if key not in _directory_handles:
            # Keep handles alive: closing them removes the search directory.
            _directory_handles[key] = os.add_dll_directory(key)
    # CTranslate2/cuDNN also use native LoadLibrary, which consults PATH.
    old = os.environ.get('PATH', '').split(os.pathsep)
    owned = {os.path.normcase(str(p)) for p in directories}
    os.environ['PATH'] = os.pathsep.join(
        [str(p) for p in directories] + [p for p in old if os.path.normcase(p) not in owned])
    return directories


def check_cuda_libraries():
    if sys.platform != 'win32':
        return
    directories = prepare_cuda_dlls()
    names = ('cublasLt64_12.dll', 'cublas64_12.dll', 'cudnn64_9.dll')
    # Probe split cuDNN libraries too; a top-level cudnn DLL alone is insufficient.
    split = sorted({p.name for d in directories for p in d.glob('cudnn*_9.dll')})
    for name in dict.fromkeys((*names, *split)):
        if name in _libraries:
            continue
        location = next((str(d/name) for d in directories if (d/name).is_file()), name)
        try:
            _libraries[name] = ctypes.WinDLL(location)
        except OSError as error:
            raise OSError(f'Cannot load {name}: {error}') from error


def check_gpu():
    prepare_cuda_dlls()
    import ctranslate2
    count = ctranslate2.get_cuda_device_count()
    if count < 1:
        raise RuntimeError('Khong tim thay GPU NVIDIA. Kiem tra driver NVIDIA va khoi dong lai Windows.')
    check_cuda_libraries()
    supported = ctranslate2.get_supported_compute_types('cuda', 0)
    if 'float16' not in supported:
        raise RuntimeError('GPU khong ho tro float16 cho cau hinh Whisper nay: ' + ', '.join(sorted(supported)))
    return count, sorted(supported)
