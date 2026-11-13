"""UTF-8 SRT for Premiere's native Subtitle track; no raster renderer."""
from __future__ import annotations

import html
import math
import os
from pathlib import Path
import re

from planner import signature


def srt_timestamp(millis):
    hours, rest = divmod(millis, 3600000)
    minutes, rest = divmod(rest, 60000)
    seconds, ms = divmod(rest, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{ms:03}'


def build_srt(cues):
    """Keep cue times (millisecond precision), Unicode and explicit line breaks.

    Empty lines are removed inside cues because they delimit SRT blocks.
    Escape markup so transcript text cannot inject SRT formatting tags.
    Reject sub-millisecond cues that cannot be represented without retiming.
    """
    blocks, previous_end = [], 0
    for index, cue in enumerate(cues, 1):
        start, end = float(cue['start']), float(cue['end'])
        if not math.isfinite(start + end) or start < 0 or end <= start:
            raise ValueError(f'Caption {index}: timestamp không hợp lệ.')
        a, b = round(start*1000), round(end*1000)
        if a < previous_end or b <= a:
            raise ValueError(f'Caption {index}: timestamp chồng lấn hoặc ngắn hơn độ chính xác SRT (1 ms).')
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', str(cue['text']))
        text = '\n'.join(line.strip() for line in text.splitlines() if line.strip())
        if not text:
            raise ValueError(f'Caption {index}: nội dung trống.')
        blocks.append(f'{index}\n{srt_timestamp(a)} --> {srt_timestamp(b)}\n{html.escape(text, quote=False)}')
        previous_end = b
    return '\n\n'.join(blocks) + ('\n' if blocks else '')


def write_captions(plan, request, output):
    """Always export SRT; request an automatic track only when enabled/nonempty."""
    target = Path(output).with_suffix('.srt').resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    cues = plan['subtitleCues']
    content = build_srt(cues)
    temporary = target.with_suffix('.srt.tmp')
    temporary.write_text(content, encoding='utf-8-sig')
    os.replace(temporary, target)
    plan['subtitlePath'] = str(target)
    plan['captionTrack'] = None
    # Accept old saved requests, but never restore PNG rendering.
    enabled = request.get('nativeCaptions', request.get('burnCaptions', False))
    if enabled and cues:
        plan['captionTrack'] = dict(path=str(target), format='subtitle', cueCount=len(cues))
        plan['fingerprints'].append(signature(target))
    elif enabled:
        plan['warnings'].append('Không có nội dung caption trong chế độ chia đều. Chọn Transcript hoặc SRT/JSON để có chữ.')
