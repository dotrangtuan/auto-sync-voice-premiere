"""One job per subprocess. JSON-line progress, atomic results, local Whisper cache."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import traceback
import wave

from planner import cache_key, make_plan, signature
from gpu_runtime import check_cuda_libraries, prepare_cuda_dlls
from captions import write_captions


def emit(kind, **data):
    print(json.dumps({'type': kind, **data}, ensure_ascii=False), flush=True)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, path)


def probe(path):
    path = Path(path)
    if not path.is_file():
        raise ValueError(f'Không tìm thấy media: {path}')
    if path.suffix.lower() == '.wav':
        try:
            with wave.open(str(path)) as stream:
                return {'duration': stream.getnframes()/stream.getframerate()}
        except (wave.Error, EOFError):
            pass
    executable = shutil.which('ffprobe')
    if executable:
        process = subprocess.run([executable, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)],
                                 capture_output=True, text=True, encoding='utf-8', errors='replace',
                                 timeout=60, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if process.returncode == 0:
            data = json.loads(process.stdout)
            values = [data.get('format', {}).get('duration')]
            values += [s.get('duration') for s in data.get('streams', [])]
            for value in values:
                if value not in (None, 'N/A') and float(value) > 0:
                    return {'duration': float(value)}
    try:
        import av
        with av.open(str(path)) as container:
            if container.duration and container.duration > 0:
                return {'duration': container.duration/av.time_base}
            for stream in container.streams:
                if stream.duration and stream.time_base:
                    return {'duration': float(stream.duration*stream.time_base)}
    except ImportError as error:
        raise ValueError('Thiếu PyAV. Chạy lại CAI_DAT.cmd để cài bộ xử lý.') from error
    raise ValueError(f'Không đọc được duration: {path.name}')


def recognize(path, request):
    prepare_cuda_dlls()
    from faster_whisper import WhisperModel
    import ctranslate2
    from faster_whisper.version import __version__
    data = Path(request['dataDir'])
    before = signature(path)
    model_name = request.get('model', 'small')
    language = request.get('language') or None
    key = cache_key(path, model_name + ':' + __version__, language)
    cache = data/'cache'/(key+'.json')
    if cache.is_file():
        try:
            words = json.loads(cache.read_text(encoding='utf-8'))
            if not isinstance(words, list) or not words or any(not all(k in w for k in ('text','start','end')) for w in words):
                raise ValueError('Invalid cache')
            emit('progress', value=0.72, message='Đã dùng lại timestamp voice từ bộ nhớ đệm.')
            return words
        except (ValueError, TypeError):
            cache.unlink(missing_ok=True)
    desired = request.get('device', 'auto')
    if desired not in ('auto', 'cpu', 'cuda'):
        raise ValueError('Thiết bị Whisper không hợp lệ.')
    device = 'cuda' if desired == 'cuda' else 'cpu'
    if desired == 'auto':
        try:
            device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
        except RuntimeError:
            device = 'cpu'
    if device == 'cuda':
        try:
            check_cuda_libraries()
        except OSError as error:
            if desired == 'cuda':
                raise ValueError('Không nạp được thư viện GPU. Đóng Premiere, chạy CAI_DAT_GPU.cmd trong gói mới rồi mở lại. '
                                 'Nếu dùng Python riêng, cần cài requirements-gpu.txt vào đúng Python đó. Chi tiết: ' + str(error)) from error
            emit('warning', message='Chưa tìm thấy đủ thư viện CUDA/cuDNN; dùng CPU cho lần nhận dạng này.')
            device = 'cpu'
    def run(selected):
        emit('progress', value=0.08, message=f'Đang nạp Whisper {model_name} trên {selected.upper()}; lần đầu cần tải model.')
        model = WhisperModel(model_name, device=selected,
                             compute_type='float16' if selected == 'cuda' else 'int8',
                             cpu_threads=max(1, min(8, os.cpu_count() or 1)),
                             download_root=str(data/'models'))
        segments, info = model.transcribe(str(path), language=language, word_timestamps=True,
                                          vad_filter=False, beam_size=5)
        words = []
        for seg in segments:
            for word in seg.words or []:
                if word.word.strip() and word.end > word.start:
                    words.append({'text': word.word.strip(), 'start': word.start, 'end': word.end})
            emit('progress', value=0.1 + 0.6*min(1, seg.end/max(info.duration, 0.01)),
                 message=f'Whisper: {seg.end:.0f}/{info.duration:.0f} giây ({selected.upper()})')
        return words
    try:
        words = run(device)
    except (RuntimeError, OSError) as error:
        if desired != 'auto' or device != 'cuda':
            raise
        emit('warning', message='GPU chưa sẵn sàng; tự chuyển sang CPU. ' + str(error)[:180])
        words = run('cpu')
    if not words:
        raise ValueError('Không nhận dạng được lời đọc trong voice.')
    if signature(path) != before:
        raise ValueError('Voice đã thay đổi trong lúc nhận dạng. Chưa lưu cache; hãy phân tích lại.')
    atomic_json(cache, words)
    return words


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('request')
    parser.add_argument('output')
    args = parser.parse_args()
    try:
        request = json.loads(Path(args.request).read_text(encoding='utf-8-sig'))
        emit('progress', value=0.02, message='Kiểm tra voice, media và transcript…')
        plan = make_plan(request, probe, recognize)
        write_captions(plan, request, args.output)
        # Detect replacement/deletion while recognition was running.
        for item in plan['fingerprints']:
            if signature(item['path']) != item:
                raise ValueError('Media đã thay đổi trong khi phân tích. Hãy phân tích lại.')
        atomic_json(args.output, plan)
        emit('done', path=str(Path(args.output).resolve()), message='Đã phân tích. Kiểm tra bảng ghép trước khi dựng.')
        return 0
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit('error', message=str(error))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
