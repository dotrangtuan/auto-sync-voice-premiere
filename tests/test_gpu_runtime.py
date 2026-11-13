import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'cep'/'backend'))
import gpu_runtime as gpu


class GpuRuntimeTests(unittest.TestCase):
    def test_wheel_record_discovers_dlls_in_bin_and_lib_and_skips_absent_files(self):
        with tempfile.TemporaryDirectory(prefix='GPU tiếng Việt ') as tmp:
            root = Path(tmp)
            entries = ['nvidia/cublas/bin/a.dll', 'nvidia/cublas/lib/b.DLL', 'missing.dll', 'README.txt']
            for entry in entries[:2]:
                p = root/entry
                p.parent.mkdir(parents=True, exist_ok=True)
                p.touch()
            dist = SimpleNamespace(files=entries, locate_file=lambda p: root/p)
            def distribution(name):
                if name == 'nvidia-cublas-cu12':
                    return dist
                raise gpu.metadata.PackageNotFoundError(name)
            with patch.object(gpu.metadata, 'distribution', side_effect=distribution):
                self.assertEqual(gpu.dll_directories(), [root/'nvidia/cublas/bin', root/'nvidia/cublas/lib'])

    def test_dll_directories_retained_and_path_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            handle = object()
            with patch.object(gpu.sys, 'platform', 'win32'), \
                 patch.object(gpu, 'dll_directories', return_value=[directory]), \
                 patch.object(gpu, '_directory_handles', {}), \
                 patch.object(gpu.os, 'add_dll_directory', create=True, return_value=handle) as add, \
                 patch.dict(os.environ, {'PATH': 'old-path'}):
                gpu.prepare_cuda_dlls()
                gpu.prepare_cuda_dlls()
                add.assert_called_once_with(str(directory))
                self.assertIs(gpu._directory_handles[str(directory)], handle)
                self.assertEqual(os.environ['PATH'], str(directory)+os.pathsep+'old-path')

    def test_private_dll_paths_and_split_cudnn_are_loaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            names = ['cublas64_12.dll', 'cublasLt64_12.dll', 'cudnn64_9.dll', 'cudnn_ops64_9.dll']
            for name in names:
                (root/name).touch()
            with patch.object(gpu.sys, 'platform', 'win32'), \
                 patch.object(gpu, 'prepare_cuda_dlls', return_value=[root]), \
                 patch.object(gpu, '_libraries', {}), \
                 patch.object(gpu.ctypes, 'WinDLL', create=True) as loader:
                gpu.check_cuda_libraries()
                self.assertEqual({call.args[0] for call in loader.call_args_list}, {str(root/n) for n in names})
                gpu.check_cuda_libraries()
                self.assertEqual(loader.call_count, 4)

    def test_missing_library_reports_exact_name(self):
        with patch.object(gpu.sys, 'platform', 'win32'), \
             patch.object(gpu, 'prepare_cuda_dlls', return_value=[]), \
             patch.object(gpu, '_libraries', {}), \
             patch.object(gpu.ctypes, 'WinDLL', create=True, side_effect=OSError('missing dependency')):
            with self.assertRaisesRegex(OSError, 'cublasLt64_12.dll.*missing dependency'):
                gpu.check_cuda_libraries()

    def test_gpu_diagnostic_checks_device_and_float16(self):
        ct = SimpleNamespace(get_cuda_device_count=Mock(return_value=1),
                             get_supported_compute_types=Mock(return_value={'float16', 'float32'}))
        with patch.dict(sys.modules, {'ctranslate2': ct}), \
             patch.object(gpu, 'prepare_cuda_dlls'), patch.object(gpu, 'check_cuda_libraries'):
            self.assertEqual(gpu.check_gpu(), (1, ['float16', 'float32']))
            ct.get_cuda_device_count.return_value = 0
            with self.assertRaisesRegex(RuntimeError, 'Khong tim thay GPU'):
                gpu.check_gpu()
            ct.get_cuda_device_count.return_value = 1
            ct.get_supported_compute_types.return_value = {'float32'}
            with self.assertRaisesRegex(RuntimeError, 'float16'):
                gpu.check_gpu()


if __name__ == '__main__':
    unittest.main()
