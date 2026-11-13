import sys
from pathlib import Path
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cep'/'backend'))
import worker


class RecognizerContractTests(unittest.TestCase):
    def test_missing_cuda_dll_gives_gpu_install_instructions_without_cpu_fallback(self):
        faster=ModuleType('faster_whisper');faster.WhisperModel=MockModel=unittest.mock.Mock()
        version=ModuleType('faster_whisper.version');version.__version__='test'
        ct=ModuleType('ctranslate2')
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);audio=root/'voice.wav';audio.write_bytes(b'audio')
            with patch.dict(sys.modules,{'faster_whisper':faster,'faster_whisper.version':version,'ctranslate2':ct}),patch.object(worker,'check_cuda_libraries',side_effect=OSError('cudnn64_9.dll')):
                with self.assertRaisesRegex(ValueError,'CAI_DAT_GPU.cmd.*cudnn64_9.dll'):
                    worker.recognize(audio,dict(dataDir=str(root),device='cuda'))
                MockModel.assert_not_called()

    def test_auto_gpu_failure_falls_back_and_cache_prevents_repeat_inference(self):
        devices=[]
        class Model:
            def __init__(self,name,device,**kwargs):
                devices.append(device)
                if device=='cuda':raise RuntimeError('GPU not available')
            def transcribe(self,path,**kwargs):
                self_args=kwargs
                if not self_args['word_timestamps']:raise AssertionError('missing timestamps')
                segment=SimpleNamespace(end=1,words=[SimpleNamespace(word='朝',start=0,end=1)])
                return iter([segment]),SimpleNamespace(duration=1)
        faster=ModuleType('faster_whisper');faster.WhisperModel=Model
        version=ModuleType('faster_whisper.version');version.__version__='test'
        ct=ModuleType('ctranslate2');ct.get_cuda_device_count=lambda:1
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);audio=root/'voice.wav';audio.write_bytes(b'audio')
            request=dict(dataDir=str(root/'data'),model='small',language='ja',device='auto')
            with patch.dict(sys.modules,{'faster_whisper':faster,'faster_whisper.version':version,'ctranslate2':ct}),patch.object(worker,'emit'),patch.object(worker,'check_cuda_libraries'):
                first=worker.recognize(audio,request)
                second=worker.recognize(audio,request)
            self.assertEqual(devices,['cuda','cpu']);self.assertEqual(first,second)

    def test_explicit_cuda_error_is_not_hidden(self):
        class Model:
            def __init__(self,*a,**k):raise RuntimeError('GPU failure')
        faster=ModuleType('faster_whisper');faster.WhisperModel=Model
        version=ModuleType('faster_whisper.version');version.__version__='test'
        ct=ModuleType('ctranslate2');ct.get_cuda_device_count=lambda:1
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);audio=root/'voice.wav';audio.write_bytes(b'audio')
            with patch.dict(sys.modules,{'faster_whisper':faster,'faster_whisper.version':version,'ctranslate2':ct}),patch.object(worker,'emit'),patch.object(worker,'check_cuda_libraries'):
                with self.assertRaisesRegex(RuntimeError,'GPU failure'):
                    worker.recognize(audio,dict(dataDir=str(root),device='cuda'))


if __name__=='__main__':unittest.main()
