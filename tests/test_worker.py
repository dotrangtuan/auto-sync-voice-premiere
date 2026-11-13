import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
import zlib

WORKER=Path(__file__).resolve().parents[1]/'cep'/'backend'/'worker.py'


class WorkerIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='asv integration ')
        self.root=Path(self.temp.name)
        self.media=self.root/'Ảnh 日本';self.media.mkdir()
        self.audio=self.root/'voice 日本.wav'
        with wave.open(str(self.audio),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000)
            w.writeframes(b''.join(struct.pack('<h',round(1000*math.sin(i*2*math.pi*440/8000))) for i in range(24000)))
        def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
        for i in range(1,4):
            raw=b''.join(b'\0'+bytes((i*60,80,120))*16 for _ in range(16))
            png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',16,16,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
            (self.media/f'{i:03}.png').write_bytes(png)

    def tearDown(self):self.temp.cleanup()

    def run_job(self,extra):
        request=dict(audio=str(self.audio),mediaDir=str(self.media),fps=30,mode='equal',dataDir=str(self.root/'data'))
        request.update(extra);req=self.root/'request.json';out=self.root/'timeline.json'
        req.write_text(json.dumps(request,ensure_ascii=False),encoding='utf-8')
        result=subprocess.run([sys.executable,str(WORKER),str(req),str(out)],capture_output=True,text=True,encoding='utf-8',timeout=30)
        return result,out

    def test_real_wav_and_png_equal_without_whisper(self):
        result,out=self.run_job({});self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual(data['totalFrames'],90)
        self.assertEqual([s['startFrame'] for s in data['scenes']],[0,30,60])
        events=[json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(events[-1]['type'],'done')

    def test_timed_srt_preserves_unequal_timing_and_writes_captions(self):
        srt=self.root/'原稿.srt'
        srt.write_text('1\n00:00:00,000 --> 00:00:00,400\n朝です。\n\n2\n00:00:00,600 --> 00:00:01,000\n電話です。\n\n3\n00:00:01,400 --> 00:00:02,900\nお茶です。',encoding='utf-8')
        result,out=self.run_job({'mode':'timed','transcriptPath':str(srt)})
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual([s['startFrame'] for s in data['scenes']],[0,15,36])
        self.assertIn('電話です。',out.with_suffix('.srt').read_text(encoding='utf-8-sig'))

    def test_invalid_input_returns_protocol_error_no_manifest(self):
        result,out=self.run_job({'mode':'transcript','transcriptText':'一。'})
        self.assertNotEqual(result.returncode,0);self.assertFalse(out.exists())
        self.assertEqual(json.loads(result.stdout.splitlines()[-1])['type'],'error')

    def test_timed_worker_writes_native_srt_and_fingerprint_without_renderer(self):
        srt=self.root/'日本語 captions.srt'
        srt.write_text('1\n00:00:00,000 --> 00:00:00,400\n朝です。\n\n2\n00:00:00,600 --> 00:00:01,000\n電話です。\n\n3\n00:00:01,400 --> 00:00:02,900\nお茶です。',encoding='utf-8')
        result,out=self.run_job(dict(mode='timed',transcriptPath=str(srt),nativeCaptions=True))
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual(data['captionTrack']['cueCount'],3)
        self.assertEqual(data['captionTrack']['format'],'subtitle')
        self.assertEqual(len(data['fingerprints']),5) # audio + 3 media + SRT
        self.assertEqual([c['start'] for c in data['subtitleCues']],[0,.6,1.4])
        self.assertEqual([c['end'] for c in data['subtitleCues']],[.4,1,2.9])
        self.assertTrue(Path(data['captionTrack']['path']).is_file())
        self.assertIn('00:00:00,600 --> 00:00:01,000', out.with_suffix('.srt').read_text(encoding='utf-8-sig'))
        self.assertFalse((out.parent/'captions').exists())
        self.assertNotIn('captions',data)
        self.assertNotIn('captionAss',data)
        self.assertEqual(json.loads(result.stdout.splitlines()[-1])['type'],'done')

    def test_motion_job_splits_shots_but_keeps_native_caption_cues(self):
        srt=self.root/'motion.srt'
        srt.write_text('1\n00:00:00,100 --> 00:00:00,700\nA\n\n2\n00:00:00,900 --> 00:00:01,400\nB\n\n3\n00:00:01,600 --> 00:00:02,900\nC',encoding='utf-8')
        result,out=self.run_job(dict(mode='timed',transcriptPath=str(srt),nativeCaptions=True,motion='auto',imageShotSeconds=1))
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(out.read_text())
        self.assertEqual(data['schemaVersion'],3)
        self.assertEqual([c['motion'] for c in data['clips']],['zoom_in','zoom_out','pan_left_right','pan_right_left'])
        self.assertEqual(data['captionTrack']['cueCount'],3)
        self.assertEqual([c['start'] for c in data['subtitleCues']],[.1,.9,1.6])
        self.assertEqual(data['clips'][-1]['endFrame'],90)


if __name__=='__main__':unittest.main()
