# Auto Sync Voice for Adobe Premiere Pro

Dựng timeline có thể chỉnh sửa từ giọng đọc và ảnh/video theo thứ tự. Chạy trên Windows, trong panel CEP của Adobe Premiere Pro.

## Tải và cài đặt

**[Tải Setup.exe — 0.4.0 beta](https://github.com/dotrangtuan/auto-sync-voice-premiere/releases/tag/v0.4.0-setup)**

1. Lưu project và đóng Premiere.
2. Mở `Auto-Sync-Voice-0.4.0-Setup.exe`, bấm **Cài đặt**.
3. Chờ hoàn tất; mở Premiere → Window → Extensions (Legacy) / Extensions → Auto Sync Voice.

Không cần giải nén hoặc cài Python thủ công. Bộ cài online tìm Python phù hợp, tự tải Python 3.12.10 nếu thiếu, rồi cài thư viện Whisper và GPU. Lần đầu có thể tải khoảng 1–2 GB thư viện. Model Whisper tải riêng khi nhận dạng lần đầu; driver NVIDIA không được cài bởi tool. Các thành phần phù hợp đã có được dùng lại.

## Tính năng

- Căn theo transcript + Whisper, timestamp SRT/JSON, hoặc chia đều theo thời lượng voice.
- Tạo sequence mới: V1 chứa ảnh/video, A1 chứa voice và Caption Track chứa phụ đề chỉnh sửa được.
- Sáu kiểu zoom/pan bằng keyframe gốc; chia shot ảnh dài và lặp video ở tốc độ gốc.
- Dựng theo lô để giảm số lần gọi Premiere; có chế độ từng clip và tương thích.
- Whisper chạy trên CPU hoặc GPU NVIDIA; dữ liệu voice được xử lý trên máy.

Xem [hướng dẫn sử dụng](HUONG_DAN_VI.md), [ghi chú tối ưu](OPTIMIZATION_NOTES.md) và [nguồn gốc mã](PROVENANCE.md).

## Mã nguồn và tự đóng gói

`cep/` chứa panel và backend; `scripts/` chứa bộ kiểm tra và chuẩn bị Python; `installer/` chứa giao diện Setup.exe bằng C#.

Trên Windows có Python và .NET Framework compiler:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer\build.ps1
```

Kết quả ở `dist/Auto-Sync-Voice-0.4.0-Setup.exe`. Có thể truyền `-Python` với đường dẫn Python cụ thể. Bộ cài EXE nhúng mã nguồn cần thiết và tải các thư viện khi chạy, không nhúng Python/model/GPU vào EXE.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer\test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests\setup-runtime.test.ps1
$env:PYTHONIOENCODING='utf-8'
python -m unittest discover -s tests -v
```

## Trạng thái beta

Đã kiểm tra giao diện, tính toàn vẹn dữ liệu đóng gói, đầu ra Unicode và xử lý tiến trình thành công/thất bại. Bản EXE chưa được kiểm thử cài mới hoàn chỉnh trên Windows sạch hoặc dựng/render trong Premiere thực tế. Xem [kiểm thử bộ cài](SETUP_TEST_RESULTS.md) và [báo cáo kiểm thử timeline ban đầu](TEST_RESULTS.md).

## Nguồn gốc và giấy phép

Giữ nguyên thông tin nguồn gốc trong [PROVENANCE.md](PROVENANCE.md) và giấy phép MIT của phần mã tham khảo SyncVideo-Audio trong [licenses/](licenses/). Các thư viện tải từ upstream giữ giấy phép riêng. Kho này không gán một giấy phép mới cho toàn bộ mã có nguồn gốc bên thứ ba.
