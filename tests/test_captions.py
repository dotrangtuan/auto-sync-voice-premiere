from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'cep'/'backend'))
from captions import build_srt, write_captions
from planner import read_timed


class NativeCaptionTests(unittest.TestCase):
    def test_unicode_multiline_markup_and_gaps_roundtrip(self):
        cues=[dict(text='朝です。\n\nTiếng Việt <b> & test',start=2,end=3),
              dict(text='終わり。',start=7.123,end=8.987)]
        text=build_srt(cues)
        self.assertIn('00:00:02,000 --> 00:00:03,000',text)
        self.assertIn('00:00:07,123 --> 00:00:08,987',text)
        self.assertNotIn('<b>',text)
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'日本 Việt.srt';path.write_text(text,encoding='utf-8-sig')
            result=read_timed(path)
        self.assertEqual(result[0]['text'],'朝です。\nTiếng Việt <b> & test')
        self.assertEqual(result[1],cues[1])

    def test_one_frame_at_60fps_is_not_lost(self):
        text=build_srt([dict(text='一',start=0,end=1/60),dict(text='二',start=1/60,end=2/60)])
        self.assertIn('00:00:00,000 --> 00:00:00,017',text)
        self.assertIn('00:00:00,017 --> 00:00:00,033',text)

    def test_invalid_or_unrepresentable_cues_are_rejected(self):
        for cue in [dict(text='a',start=0,end=0),dict(text='a',start=-1,end=1),
                    dict(text='a',start=0,end=float('nan')),dict(text='a',start=0,end=.0001),
                    dict(text='\x00',start=0,end=1)]:
            with self.subTest(cue=cue),self.assertRaises(ValueError):build_srt([cue])
        with self.assertRaises(ValueError):
            build_srt([dict(text='a',start=0,end=2),dict(text='b',start=1,end=3)])

    def test_track_option_exports_one_srt_and_never_graphics(self):
        with tempfile.TemporaryDirectory(prefix="asv 日本 Việt ' ") as temp:
            plan=dict(subtitleCues=[dict(text='Xin chào',start=1,end=2)],fingerprints=[],warnings=[])
            write_captions(plan,dict(nativeCaptions=True),Path(temp)/'timeline.json')
            track=plan['captionTrack'];self.assertEqual(track['cueCount'],1)
            self.assertEqual(track['format'],'subtitle');self.assertEqual(len(plan['fingerprints']),1)
            self.assertEqual([p.suffix for p in Path(temp).iterdir()],['.srt'])
            self.assertTrue(Path(track['path']).read_bytes().startswith(b'\xef\xbb\xbf'))

    def test_disabled_caption_track_keeps_export_and_empty_mode_skips_track(self):
        with tempfile.TemporaryDirectory() as temp:
            plan=dict(subtitleCues=[dict(text='Hi',start=0,end=1)],fingerprints=[],warnings=[])
            write_captions(plan,dict(nativeCaptions=False,burnCaptions=True),Path(temp)/'timeline.json')
            self.assertIsNone(plan['captionTrack']);self.assertEqual(plan['fingerprints'],[])
            self.assertTrue(Path(plan['subtitlePath']).is_file())
            plan['subtitleCues']=[]
            write_captions(plan,dict(nativeCaptions=True),Path(temp)/'timeline.json')
            self.assertIsNone(plan['captionTrack']);self.assertTrue(plan['warnings'])

    def test_legacy_request_is_migrated_to_native_track(self):
        with tempfile.TemporaryDirectory() as temp:
            plan=dict(subtitleCues=[dict(text='Hi',start=0,end=1)],fingerprints=[],warnings=[])
            write_captions(plan,dict(burnCaptions=True),Path(temp)/'timeline.json')
            self.assertEqual(plan['captionTrack']['format'],'subtitle')

if __name__=='__main__':unittest.main()
