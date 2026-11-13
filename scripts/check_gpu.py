"""Run in a fresh process so native GPU failures cannot kill the installer."""
from pathlib import Path
import sys
import traceback

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'cep'/'backend'))
from gpu_runtime import check_gpu


def main():
    try:
        count, supported = check_gpu()
        print(f'GPU runtime OK: {count} NVIDIA GPU; compute types: {", ".join(supported)}')
        print('DLL/driver check passed. Full Whisper inference will run when you analyze a voice.')
        return 0
    except Exception as error:
        # stdout for Windows PowerShell 5.1 compatibility.
        print(f'GPU check failed: {type(error).__name__}: {error}')
        print(traceback.format_exc().rstrip())
        return 1


if __name__ == '__main__':
    sys.exit(main())
