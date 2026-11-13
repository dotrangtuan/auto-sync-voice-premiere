"""Frame-aligned narration planner; no Premiere dependency. Python 3.10+."""
from __future__ import annotations

import bisect
import hashlib
import html
import json
import math
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

IMAGES = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}
VIDEOS = {'.mp4', '.mov', '.m4v', '.avi', '.mxf', '.webm', '.mkv'}
NUMBER = re.compile(r'^(?:(?:img|image|scene|shot|video|clip)[_ -]*)?(\d+)(?=$|[_. -])', re.I)
# Cycle and ~6-second still-shot expansion adapted from SyncVideo-Audio (MIT).
# See PROVENANCE.md and licenses/SyncVideo-Audio-MIT.txt.
MOTION_CYCLE = ('zoom_in', 'zoom_out', 'pan_left_right', 'pan_right_left',
                'pan_top_bottom', 'pan_bottom_top')


def motion_options(request):
    mode = request.get('motion', 'zoom_in' if request.get('zoom') else 'none')
    if mode not in ('none', 'auto', *MOTION_CYCLE):
        raise ValueError('Kiểu chuyển động không hợp lệ.')
    # Legacy callers without the new field keep their original scene layout.
    seconds = float(request.get('imageShotSeconds', 6 if 'motion' in request else 0))
    if not math.isfinite(seconds) or not (seconds == 0 or 1 <= seconds <= 60):
        raise ValueError('Độ dài shot ảnh phải từ 1 đến 60 giây, hoặc 0 để không chia.')
    return mode, seconds


def natural_key(path):
    return tuple((0, int(x)) if x.isdigit() else (1, x.casefold())
                 for x in re.split(r'(\d+)', Path(path).name) if x)


def scan_media(folder):
    root = Path(folder)
    if not root.is_dir():
        raise ValueError('Thư mục ảnh/video không tồn tại.')
    paths = sorted((p.resolve() for p in root.iterdir()
                    if p.is_file() and p.suffix.lower() in IMAGES | VIDEOS), key=natural_key)
    if not paths or len(paths) > 10000:
        raise ValueError('Cần từ 1 đến 10.000 ảnh/video trong thư mục.')
    return paths


def numbering_warnings(paths):
    """Bounded by file count, never by the magnitude of a filename number."""
    matches = [NUMBER.match(Path(p).stem) for p in paths]
    if not all(matches):
        return ['Có file không có số thứ tự; hãy kiểm tra thứ tự trong bảng.']
    nums = [int(m.group(1)) for m in matches]
    warnings = []
    if len(set(nums)) != len(nums):
        warnings.append('Có số thứ tự trùng nhau trong tên media.')
    if nums != list(range(1, len(nums) + 1)):
        warnings.append('Số trong tên file không liên tục từ 001; kiểm tra bảng ghép trước khi dựng.')
    return warnings


def split_text(text, mode='sentences'):
    # Also accept common [mm:ss] transcript exports; they are text-only in this mode.
    text = re.sub(r'\[\d+:\d{2}(?::\d{2})?(?:\.\d+)?\]', '', text)
    if mode == 'lines':
        result = [x.strip() for x in text.splitlines() if x.strip()]
    else:
        text = re.sub(r'\s+', ' ', text).strip()
        result, start, i = [], 0, 0
        ends = '.!?…。｡．！？'
        closers = '\"\u0027”’»」』】〉》〕〗〙〛)]}'
        while i < len(text):
            decimal = text[i] == '.' and i > 0 and i + 1 < len(text) and text[i-1].isdigit() and text[i+1].isdigit()
            if text[i] not in ends or decimal:
                i += 1
                continue
            i += 1
            while i < len(text) and text[i] in ends:
                i += 1
            while i < len(text) and text[i] in closers:
                i += 1
            if text[start:i].strip():
                result.append(text[start:i].strip())
            start = i
        if text[start:].strip():
            result.append(text[start:].strip())
    if not result:
        raise ValueError('Transcript trống.')
    return result


def tokens(text):
    result, buffer = [], ''
    for ch in unicodedata.normalize('NFKC', text).casefold():
        n = ord(ch)
        if (0x3040 <= n <= 0x30ff or 0x3400 <= n <= 0x9fff or
                0xac00 <= n <= 0xd7af or 0xf900 <= n <= 0xfaff):
            if buffer:
                result.append(buffer)
                buffer = ''
            result.append(ch)
        elif ch.isalnum() or unicodedata.category(ch).startswith('M'):
            buffer += ch
        elif buffer:
            result.append(buffer)
            buffer = ''
    if buffer:
        result.append(buffer)
    return result


def align(lines, words, duration):
    reference, boundaries = [], [0]
    for line in lines:
        ts = tokens(line)
        if not ts:
            raise ValueError('Một câu transcript không có chữ hợp lệ.')
        reference.extend(ts)
        boundaries.append(len(reference))
    recognized, times = [], []
    for word in words:
        start, end = float(word['start']), float(word['end'])
        if not math.isfinite(start + end) or start < 0 or end <= start:
            continue
        for token in tokens(word['text']):
            recognized.append(token)
            times.append((start, end))
    if not recognized:
        raise ValueError('Whisper không nhận dạng được lời đọc.')
    mapping = {}
    for block in SequenceMatcher(None, reference, recognized, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            mapping[block.a + k] = block.b + k
    coverage = len(mapping) / len(reference)
    if coverage < 0.5:
        raise ValueError(f'Transcript chỉ khớp {coverage:.0%} với chữ Whisper nhận dạng. Kiểm tra voice, ngôn ngữ và kịch bản; chưa tạo timeline.')
    keys = sorted(mapping)
    cuts = [0.0]
    warnings, scores = [], []
    for i, (lo, hi) in enumerate(zip(boundaries, boundaries[1:])):
        score = sum(k in mapping for k in range(lo, hi)) / (hi-lo)
        scores.append(round(score, 3))
        if score < 0.65:
            warnings.append(f'Câu {i+1}: độ khớp chữ thấp ({score:.0%}), cần nghe kiểm tra.')
    for b in boundaries[1:-1]:
        idx = bisect.bisect_left(keys, b)
        if idx and idx < len(keys):
            left, right = mapping[keys[idx-1]], mapping[keys[idx]]
            cut = (times[left][1] + times[right][0]) / 2
        else:
            cut = duration * b / len(reference)
            warnings.append(f'Mốc câu {len(cuts)+1} được ước lượng do thiếu chữ khớp ở đầu/cuối.')
        cuts.append(cut)
    cuts.append(duration)
    return cuts, scores, warnings


def read_timed(path):
    source = Path(path)
    raw = source.read_text(encoding='utf-8-sig')
    if source.suffix.lower() == '.srt':
        cues = []
        pattern = re.compile(r'(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})')
        for block in re.split(r'\r?\n\s*\r?\n', raw.strip()):
            match = pattern.search(block)
            if not match:
                raise ValueError('SRT có block không chứa timestamp hợp lệ.')
            values = list(map(int, match.groups()))
            def secs(v):
                if v[1] >= 60 or v[2] >= 60:
                    raise ValueError('Phút/giây SRT phải nhỏ hơn 60.')
                return v[0]*3600 + v[1]*60 + v[2] + v[3]/1000
            content = html.unescape(re.sub(r'<[^>]+>', '', block[match.end():].strip()))
            cues.append({'text': content, 'start': secs(values[:4]), 'end': secs(values[4:])})
    else:
        data = json.loads(raw)
        entries = data.get('scenes', data.get('segments')) if isinstance(data, dict) else data
        if not isinstance(entries, list):
            raise ValueError('JSON cần array hoặc object có scenes/segments.')
        cues = []
        for item in entries:
            if not isinstance(item, dict):
                raise ValueError('Mỗi cảnh JSON phải là object.')
            cues.append({'text': str(item.get('text', item.get('sourceText', ''))),
                         'start': float(item.get('start', item.get('audio_start', -1))),
                         'end': float(item.get('end', item.get('audio_end', -1)))})
    if not cues:
        raise ValueError('Không có cảnh trong SRT/JSON.')
    previous = 0.0
    for cue in cues:
        a, b = cue['start'], cue['end']
        if not math.isfinite(a+b) or a < previous or b <= a or not cue['text'].strip():
            raise ValueError('Timestamp phải tăng dần, không chồng lấn và có nội dung.')
        previous = b
    return cues


def quantize(cuts, fps, duration):
    total = math.ceil(duration * fps - 1e-8)
    count = len(cuts)-1
    if total < count:
        raise ValueError('Quá nhiều cảnh: mỗi cảnh phải dài ít nhất một frame.')
    frames, adjusted = [0], False
    for i, value in enumerate(cuts[1:-1], 1):
        target = round(value * fps)
        fixed = max(frames[-1]+1, min(target, total-(count-i)))
        adjusted |= abs(fixed-target) > 1
        frames.append(fixed)
    frames.append(total)
    return frames, adjusted


def signature(path):
    p = Path(path)
    stat = p.stat()
    return {'path': str(p.resolve()), 'size': stat.st_size, 'mtimeNs': stat.st_mtime_ns}


def cache_key(path, model, language):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            digest.update(block)
    digest.update(json.dumps(['asv-1', model, language]).encode())
    return digest.hexdigest()


def make_plan(request, probe, transcribe):
    motion_mode, image_shot_seconds = motion_options(request)
    audio_fingerprint = signature(request['audio'])
    duration = float(probe(Path(request['audio']))['duration'])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Không đọc được thời lượng audio.')
    fps = int(request.get('fps', 30))
    if fps not in (24, 25, 30, 60):
        raise ValueError('FPS hỗ trợ: 24, 25, 30, 60.')
    paths = scan_media(request['mediaDir'])
    # Optional explicit order from the panel is validated against the whole folder.
    if request.get('orderedMedia'):
        ordered = [Path(p).resolve() for p in request['orderedMedia']]
        if len(ordered) != len(set(ordered)) or set(ordered) != set(paths):
            raise ValueError('Danh sách media thay đổi. Quét lại thư mục.')
        paths = ordered
    fingerprints = [audio_fingerprint] + [signature(p) for p in paths]
    mode = request.get('mode', 'transcript')
    subtitle_cues = None
    warnings = numbering_warnings(paths)
    scores = [None]*len(paths)
    if mode == 'equal':
        texts = ['']*len(paths)
        cuts = [duration*i/len(paths) for i in range(len(paths)+1)]
    elif mode == 'timed':
        cues = read_timed(request['transcriptPath'])
        if cues[-1]['end'] > duration + 0.1:
            raise ValueError('Timestamp cuối vượt quá thời lượng voice.')
        subtitle_cues = [dict(text=c['text'], start=c['start'], end=min(c['end'], duration)) for c in cues]
        if any(c['end'] <= c['start'] for c in subtitle_cues):
            raise ValueError('Caption nằm ngoài thời lượng voice.')
        if cues[-1]['end'] > duration:
            warnings.append('Caption cuối đã được cắt tại thời điểm voice kết thúc.')
        texts = [c['text'] for c in cues]
        cuts = [0] + [(a['end']+b['start'])/2 for a,b in zip(cues,cues[1:])] + [duration]
    elif mode == 'transcript':
        text = request.get('transcriptText', '')
        if request.get('transcriptPath'):
            source = Path(request['transcriptPath'])
            if source.suffix.lower() in ('.srt', '.json'):
                raise ValueError('Chọn chế độ Timestamp SRT/JSON để giữ mốc thời gian của file này.')
            text = source.read_text(encoding='utf-8-sig')
        texts = split_text(text, request.get('split', 'sentences'))
        if len(texts) != len(paths):
            raise ValueError(f'Transcript có {len(texts)} câu/cảnh nhưng có {len(paths)} media. Cần đúng một cảnh cho mỗi media.')
        words = transcribe(Path(request['audio']), request)
        cuts, scores, alignment_warnings = align(texts, words, duration)
        warnings.extend(alignment_warnings)
    else:
        raise ValueError('Chế độ không hợp lệ.')
    if len(texts) != len(paths):
        raise ValueError(f'Có {len(texts)} cảnh nhưng {len(paths)} media. Một cue SRT / một object JSON tương ứng một media.')
    frames, adjusted = quantize(cuts, fps, duration)
    if adjusted:
        warnings.append('Một số mốc sát nhau đã được điều chỉnh để mỗi cảnh có ít nhất một frame. Cần nghe kiểm tra.')
    clips, scenes = [], []
    for i, (path, start, end, text) in enumerate(zip(paths, frames, frames[1:], texts)):
        kind = 'image' if path.suffix.lower() in IMAGES else 'video'
        scene = {'index': i+1, 'path': str(path), 'startFrame': start, 'endFrame': end,
                 'text': text, 'confidence': scores[i], 'motions': []}
        scenes.append(scene)
        source_frames = end-start
        if kind == 'video':
            info = probe(path)
            source_frames = math.floor(float(info['duration'])*fps + 1e-8)
            if source_frames < 1:
                raise ValueError(f'Video ngắn hơn một frame: {path.name}')
        if kind == 'image':
            count = max(1, round((end-start)/fps/image_shot_seconds)) if image_shot_seconds else 1
            count = min(count, end-start)
        else:
            count = math.ceil((end-start)/source_frames)
        if len(clips) + count > 10000:
            raise ValueError('Timeline vượt 10.000 đoạn. Tăng độ dài shot ảnh hoặc dùng video nguồn dài hơn.')
        boundaries = ([start + round((end-start)*j/count) for j in range(count)] + [end]
                      if kind == 'image' else [min(end, start+j*source_frames) for j in range(count+1)])
        for cursor, finish in zip(boundaries, boundaries[1:]):
            motion = MOTION_CYCLE[len(clips) % len(MOTION_CYCLE)] if motion_mode == 'auto' else motion_mode
            if finish-cursor < 2:
                motion = 'none'
            scene['motions'].append(motion)
            clips.append({'path': str(path), 'kind': kind, 'sceneIndex': i+1,
                          'startFrame': cursor, 'endFrame': finish, 'sourceStartFrame': 0,
                          'motion': motion})
        scene['shotCount'] = count
        if kind == 'video' and end-start > source_frames:
            warnings.append(f'Cảnh {i+1}: video ngắn hơn lời đọc, sẽ lặp ở tốc độ gốc.')
    if len(clips) > 10000:
        raise ValueError('Timeline vượt 10.000 đoạn. Video nguồn quá ngắn để lặp.')
    if subtitle_cues is None:
        subtitle_cues = [dict(text=s['text'], start=s['startFrame']/fps,
                             end=min(duration, s['endFrame']/fps)) for s in scenes if s['text'].strip()]
    return {'schemaVersion': 3, 'name': str(request.get('name', 'Auto Sync Voice')).strip()[:120] or 'Auto Sync Voice',
            'fps': fps, 'duration': duration, 'totalFrames': frames[-1], 'audio': str(Path(request['audio']).resolve()),
            'mode': mode, 'fit': bool(request.get('fit', True)), 'motion': motion_mode,
            'imageShotSeconds': image_shot_seconds,
            'warnings': warnings, 'scenes': scenes, 'subtitleCues': subtitle_cues,
            'clips': clips, 'fingerprints': fingerprints}
