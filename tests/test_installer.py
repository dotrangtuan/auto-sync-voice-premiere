import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT/'scripts'/'check_runtime.py'
spec = importlib.util.spec_from_file_location('check_runtime', CHECK)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class InstallerTests(unittest.TestCase):
    def test_python_probe_file_path_with_spaces_and_unicode(self):
        with tempfile.TemporaryDirectory(prefix='asv install ') as folder:
            script = Path(folder)/'kiểm tra 日本.py'
            script.write_bytes(CHECK.read_bytes())
            result = subprocess.run([sys.executable, str(script), '--python-path'],
                                    capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(Path(result.stdout.strip()), Path(sys.executable))

    def test_success_imports_both_modules_and_prints_complete_message(self):
        output = io.StringIO()
        with patch.object(runtime.importlib, 'import_module') as load, contextlib.redirect_stdout(output):
            self.assertEqual(runtime.main(['--backend']), 0)
        self.assertEqual([call.args[0] for call in load.call_args_list], ['faster_whisper', 'av'])
        self.assertEqual(output.getvalue(), 'Backend OK\n')

    def test_real_error_is_reported_without_guessing_cause(self):
        output, stderr = io.StringIO(), io.StringIO()
        with patch.object(runtime.importlib, 'import_module', side_effect=ModuleNotFoundError('test missing av')), contextlib.redirect_stdout(output), contextlib.redirect_stderr(stderr):
            self.assertEqual(runtime.main(['--backend']), 1)
        self.assertIn('ModuleNotFoundError: test missing av', output.getvalue())
        self.assertEqual(stderr.getvalue(), '')
        self.assertNotIn('Visual C++', output.getvalue())

    def test_quiet_probe_is_silent_on_failure(self):
        output = io.StringIO()
        with patch.object(runtime.importlib, 'import_module', side_effect=OSError('missing DLL')), contextlib.redirect_stdout(output):
            self.assertEqual(runtime.main(['--backend','--quiet']), 1)
        self.assertEqual(output.getvalue(), '')

    def test_gpu_packages_accept_exact_installed_versions(self):
        requirement = ROOT/'cep'/'backend'/'requirements-gpu.txt'
        expected = dict(line.split('==') for line in requirement.read_text().splitlines()
                        if line and not line.startswith('#'))
        output = io.StringIO()
        with patch.object(runtime.metadata, 'version', side_effect=expected.__getitem__), contextlib.redirect_stdout(output):
            self.assertEqual(runtime.main(['--gpu-packages', str(requirement)]), 0)
        self.assertEqual(output.getvalue(), 'GPU packages OK\n')

    def test_gpu_packages_need_install_on_missing_or_different_version(self):
        requirement = ROOT/'cep'/'backend'/'requirements-gpu.txt'
        for options in ({'return_value': '0.0'}, {'side_effect': runtime.metadata.PackageNotFoundError('missing')}):
            with self.subTest(options=options), patch.object(runtime.metadata, 'version', **options), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(runtime.main(['--gpu-packages', str(requirement), '--quiet']), 1)


if __name__ == '__main__':
    unittest.main()
