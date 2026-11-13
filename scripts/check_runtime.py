"""Installer checks in a file: no Python code passed through PowerShell -c."""
import argparse
import importlib
from importlib import metadata
from pathlib import Path
import struct
import sys
import traceback


def check_backend():
    for name in ('faster_whisper', 'av'):
        importlib.import_module(name)


def check_gpu_packages(path):
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        name, expected = line.split('==')
        if metadata.version(name.strip()) != expected.strip():
            raise RuntimeError(f'GPU package needs installation: {name}')


def main(argv=None):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--python-path', action='store_true')
    mode.add_argument('--backend', action='store_true')
    mode.add_argument('--gpu-packages', metavar='REQUIREMENTS')
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args(argv)
    try:
        if not (3, 10) <= sys.version_info[:2] < (3, 14):
            raise RuntimeError('Python 3.10-3.13 is required; Python 3.12 is recommended.')
        if struct.calcsize('P') != 8:
            raise RuntimeError('Python must be 64-bit.')
        if args.python_path:
            print(sys.executable)
        elif args.gpu_packages:
            check_gpu_packages(args.gpu_packages)
            if not args.quiet:
                print('GPU packages OK')
        else:
            check_backend()
            if not args.quiet:
                print('Backend OK')
        return 0
    except Exception as error:
        if not args.quiet:
            # stdout avoids NativeCommandError conversion in Windows PowerShell 5.1.
            print('Runtime check failed: {}: {}'.format(type(error).__name__, error))
            print(traceback.format_exc().rstrip())
        return 1


if __name__ == '__main__':
    sys.exit(main())
