import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'cep'/'backend'))
from planner import align, cache_key, make_plan, numbering_warnings, quantize, read_timed, scan_media, split_text


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.media = self.root/'media'
        self.media.mkdir()
        self.audio = self.root/'voice.wav'
        self.audio.write_bytes(b'audio')

    def tearDown(self):
        self.temp.cleanup()

    def request(self, mode='equal', names=('001.png','002.png')):
        for name in names:
            (self.media/name).write_bytes(b'media')
        return dict(audio=str(self.audio),mediaDir=str(self.media),mode=mode,fps=30)

    def test_large_filename_is_bounded(self):
        self.assertTrue(numbering_warnings([Path('9999999999999999999999_image.png')]))

    def test_natural_order(self):
        self.request(names=('10.png','2.png','1.png'))
        self.assertEqual([p.name for p in scan_media(self.media)],['1.png','2.png','10.png'])

    def test_japanese_punctuation_and_closers(self):
        self.assertEqual(split_text('朝です。\n「元気ですか？」はい！'),['朝です。','「元気ですか？」','はい！'])

    def test_line_mode(self):
        self.assertEqual(split_text('A. B.\n\nC。','lines'),['A. B.','C。'])

    def test_decimal(self):
        self.assertEqual(split_text('3.14です。次。'),['3.14です。','次。'])

    def test_mismatch_blocks_before_whisper(self):
        request=self.request('transcript');request['transcriptText']='一。'
        def never(*args): raise AssertionError('Whisper must not run')
        with self.assertRaisesRegex(ValueError,'1 câu/cảnh'):
            make_plan(request,lambda p:{'duration':3},never)

    def test_unrelated_voice_is_rejected(self):
        words=[dict(text='train',start=0,end=1),dict(text='ticket',start=1,end=2)]
        with self.assertRaisesRegex(ValueError,'chỉ khớp'):
            align(['猫。','花。'],words,2)

    def test_alignment_midpoint(self):
        cuts,scores,warnings=align(['朝です。','夜です。'],[
            dict(text='朝です',start=.1,end=.9),dict(text='夜です',start=1.5,end=2.3)],2.5)
        self.assertEqual(cuts,[0,1.2,2.5]);self.assertEqual(scores,[1,1]);self.assertFalse(warnings)

    def test_quantization_short_scenes_and_tail(self):
        frames,adjusted=quantize([0,.001,.002,1.001],30,1.001)
        self.assertEqual(frames,[0,1,2,31]);self.assertTrue(adjusted)

    def test_too_many_scenes(self):
        with self.assertRaises(ValueError):quantize([0,.001,.002,.003],30,.003)

    def test_video_loop_and_cut_no_gaps(self):
        request=self.request(names=('001.mp4','002.png'))
        plan=make_plan(request,lambda p:{'duration':10.01 if p==self.audio else 1.2},lambda *args:[])
        clips=plan['clips'];cursor=0
        for clip in clips:
            self.assertEqual(clip['startFrame'],cursor);cursor=clip['endFrame']
            if clip['kind']=='video':self.assertLessEqual(clip['endFrame']-clip['startFrame'],36)
        self.assertEqual(cursor,301);self.assertTrue(plan['warnings'])

    def test_srt_uses_timestamp_without_whisper(self):
        source=self.root/'script.srt'
        source.write_text('1\n00:00:00,200 --> 00:00:01,000\n朝。\n\n2\n00:00:02,000 --> 00:00:03,000\n夜。',encoding='utf-8')
        request=self.request('timed');request['transcriptPath']=str(source)
        def never(*args):raise AssertionError('Whisper must not run')
        plan=make_plan(request,lambda p:{'duration':3},never)
        self.assertEqual(plan['scenes'][0]['endFrame'],45)
        self.assertEqual([(c['start'],c['end']) for c in plan['subtitleCues']],[(.2,1),(2,3)])

    def test_json_timestamp(self):
        source=self.root/'s.json';source.write_text(json.dumps({'scenes':[{'sourceText':'朝。','audio_start':0,'audio_end':2}]}))
        self.assertEqual(read_timed(source)[0]['end'],2)

    def test_overlap_rejected(self):
        source=self.root/'s.json';source.write_text(json.dumps([dict(text='a',start=0,end=2),dict(text='b',start=1,end=3)]))
        with self.assertRaises(ValueError):read_timed(source)

    def test_timestamp_past_audio(self):
        source=self.root/'s.json';source.write_text(json.dumps([dict(text='a',start=0,end=2),dict(text='b',start=3,end=4)]))
        request=self.request('timed');request['transcriptPath']=str(source)
        with self.assertRaisesRegex(ValueError,'vượt quá'):make_plan(request,lambda p:{'duration':3},lambda *a:[])

    def test_cache_keys_include_audio_model_and_language(self):
        original=cache_key(self.audio,'small','ja')
        self.assertNotEqual(original,cache_key(self.audio,'small','vi'))
        self.assertNotEqual(original,cache_key(self.audio,'medium','ja'))
        self.audio.write_bytes(b'changed');self.assertNotEqual(original,cache_key(self.audio,'small','ja'))

    def test_media_fingerprint_precedes_transcription(self):
        request=self.request('transcript');request['transcriptText']='朝。夜。'
        def transcribe(*args):
            (self.media/'001.png').write_bytes(b'changed bytes')
            return [dict(text='朝',start=0,end=1),dict(text='夜',start=2,end=3)]
        plan=make_plan(request,lambda p:{'duration':3},transcribe)
        self.assertEqual(plan['fingerprints'][1]['size'],5)

    def test_timestamp_file_is_not_silently_retranscribed(self):
        request=self.request('transcript');source=self.root/'s.srt';source.write_text('test')
        request['transcriptPath']=str(source)
        with self.assertRaisesRegex(ValueError,'giữ mốc'):make_plan(request,lambda p:{'duration':3},lambda *a:[])

    def test_auto_motion_cycles_across_images_and_video_loops(self):
        request=self.request(names=('001.png','002.mp4','003.png'))
        request.update(motion='auto',imageShotSeconds=0)
        plan=make_plan(request,lambda p:{'duration':18 if p==self.audio else 1},lambda *a:[])
        self.assertEqual([c['motion'] for c in plan['clips']],['zoom_in','zoom_out','pan_left_right','pan_right_left','pan_top_bottom','pan_bottom_top','zoom_in','zoom_out'])
        self.assertEqual(plan['scenes'][1]['shotCount'],6)
        self.assertEqual(plan['totalFrames'],540)

    def test_six_second_still_shots_are_balanced_and_keep_caption_whole(self):
        request=self.request('timed',names=('001.png',))
        source=self.root/'s.json';source.write_text(json.dumps([dict(text='Long sentence',start=1,end=18)]))
        request.update(motion='auto',imageShotSeconds=6,transcriptPath=str(source))
        plan=make_plan(request,lambda p:{'duration':20},lambda *a:[])
        self.assertEqual([(c['startFrame'],c['endFrame']) for c in plan['clips']],[(0,200),(200,400),(400,600)])
        self.assertEqual(plan['scenes'][0]['motions'],['zoom_in','zoom_out','pan_left_right'])
        self.assertEqual(plan['subtitleCues'],[dict(text='Long sentence',start=1,end=18)])

    def test_fixed_motion_and_off_keep_same_shot_layout(self):
        request=self.request(names=('001.png',))
        request.update(motion='pan_bottom_top',imageShotSeconds=6)
        plan=make_plan(request,lambda p:{'duration':12},lambda *a:[])
        self.assertEqual([c['motion'] for c in plan['clips']],['pan_bottom_top']*2)
        request['motion']='none'
        plan=make_plan(request,lambda p:{'duration':12},lambda *a:[])
        self.assertEqual([c['motion'] for c in plan['clips']],['none']*2)
        request['imageShotSeconds']=0
        self.assertEqual(len(make_plan(request,lambda p:{'duration':12},lambda *a:[])['clips']),1)

    def test_frame_aligned_shots_are_contiguous_for_all_supported_fps(self):
        request=self.request(names=('001.png',));request.update(motion='auto',imageShotSeconds=6)
        for fps in (24,25,30,60):
            request['fps']=fps
            plan=make_plan(request,lambda p:{'duration':25.123},lambda *a:[])
            self.assertEqual(len(plan['clips']),4)
            cursor=0
            for c in plan['clips']:
                self.assertEqual(c['startFrame'],cursor);self.assertGreater(c['endFrame'],cursor);cursor=c['endFrame']
            self.assertEqual(cursor,plan['totalFrames'])

    def test_one_frame_motion_is_disabled(self):
        request=self.request(names=('001.png',));request.update(motion='auto',imageShotSeconds=6)
        plan=make_plan(request,lambda p:{'duration':1/30},lambda *a:[])
        self.assertEqual(plan['clips'][0]['motion'],'none')

    def test_invalid_motion_settings_and_large_shot_expansion_are_bounded(self):
        request=self.request(names=('001.png',))
        for change in [dict(motion='bad'),dict(imageShotSeconds=-1),dict(imageShotSeconds=.5),dict(imageShotSeconds=61),dict(imageShotSeconds='nan')]:
            with self.subTest(change=change),self.assertRaises(ValueError):
                make_plan(dict(request,**change),lambda p:{'duration':20},lambda *a:[])
        request.update(motion='auto',imageShotSeconds=1)
        with self.assertRaisesRegex(ValueError,'10.000'):
            make_plan(request,lambda p:{'duration':20000},lambda *a:[])

    def test_legacy_zoom_request_does_not_silently_split_images(self):
        request=self.request(names=('001.png',));request['zoom']=True
        plan=make_plan(request,lambda p:{'duration':20},lambda *a:[])
        self.assertEqual(len(plan['clips']),1)
        self.assertEqual(plan['clips'][0]['motion'],'zoom_in')


if __name__=='__main__':unittest.main()
