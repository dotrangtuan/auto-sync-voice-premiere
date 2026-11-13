# Auto Sync Voice 0.4.0 — Bộ cài online tự động

## Cài nhanh

1. Giải nén toàn bộ ZIP vào một thư mục mới.
2. Lưu project và đóng Adobe Premiere Pro.
3. Có kết nối Internet, nhấp đúp **CAI_DAT.cmd**, chờ báo **THANH CONG**.
4. Mở Premiere → Window → Extensions (Legacy) / Extensions → Auto Sync Voice.
5. Để trống ô **Python riêng**. Nếu kiểm tra GPU thành công, chọn **Tự chọn GPU / CPU** hoặc **NVIDIA GPU**.

Bạn không cần cài Python thủ công. Bộ cài tìm Python 3.10–3.13 64-bit đang hoạt động; nếu thiếu sẽ tự tải Python 3.12.10 từ python.org, kiểm tra SHA256 và chữ ký Python Software Foundation, rồi cài cho tài khoản hiện tại. Bộ cài không thêm Python vào PATH và không cài Python Launcher.

Python riêng, thư viện và dữ liệu nằm trong `%LOCALAPPDATA%\AutoSyncVoice`. Cài lại dùng môi trường đang hoạt động; các thư viện GPU đúng phiên bản sẽ được bỏ qua, không gọi trình tải lại. Nếu môi trường Python hỏng, bộ cài giữ bản sao lưu rồi tạo lại.

## Dung lượng tải lần đầu

- Python nếu thiếu: khoảng 26 MB.
- Thư viện nhận dạng và GPU: khoảng 1–2 GB tùy các thành phần đã có và phiên bản phụ thuộc.
- Model Whisper tải riêng khi phân tích voice lần đầu; chưa nằm trong ZIP này.
- Chế độ SRT/JSON và chia đều không cần model Whisper.

## Các tệp cài đặt

| Tệp | Chức năng |
|---|---|
| **CAI_DAT.cmd** | Khuyến nghị: tự chuẩn bị Python, backend và thư viện GPU. Nếu kiểm tra GPU không đạt, vẫn cài panel và thông báo dùng CPU. |
| **CAI_DAT_GPU.cmd** | Tự chuẩn bị như trên, nhưng yêu cầu kiểm tra GPU đạt mới cập nhật panel. Dùng khi cần kiểm tra/sửa GPU. |
| **CAI_DAT_CPU.cmd** | Tự chuẩn bị Python và backend, bỏ qua tải/kiểm tra thư viện GPU. Chọn CPU trong panel. |

Thư viện CUDA/cuBLAS/cuDNN được cài vào môi trường riêng của ứng dụng. Driver NVIDIA là thành phần riêng của Windows: bộ cài không tải hoặc thay driver. Máy không có GPU NVIDIA phù hợp vẫn dùng CPU được.

Nếu mạng bị ngắt, kiểm tra kết nối rồi chạy lại cùng tệp cài đặt. Xem `NHAT_KY_CAI_DAT.txt` và thông báo trong cửa sổ. Lỗi bước cài Python có nhật ký bổ sung tại `%LOCALAPPDATA%\AutoSyncVoice\python-setup.log`. Máy bị hạn chế cài phần mềm bởi chính sách quản trị cần được quản trị viên cho phép.

Bản này thay đổi quy trình cài đặt, giữ phiên bản panel và chức năng dựng timeline 0.4.0. Đã kiểm tra tải/xác minh Python thật, nhận diện backend/GPU hiện có và chạy cài panel trong thư mục thử nghiệm. Chưa cài Python trên một Windows hoàn toàn sạch và chưa chạy dựng timeline trong Premiere; xem `SETUP_TEST_RESULTS.md`.

Nguồn kỹ thuật: [Python Windows installer](https://docs.python.org/3.12/using/windows.html#installing-without-ui), [Python 3.12.10](https://www.python.org/downloads/release/python-31210/).
