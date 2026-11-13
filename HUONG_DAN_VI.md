# Auto Sync Voice cho Premiere — 0.4.0 beta — Dựng theo lô

## Cập nhật từ 0.3.1

1. Lưu project và đóng Premiere. Giải nén toàn bộ ZIP vào thư mục mới.
2. Chạy `CAI_DAT.cmd`. Không cần gỡ bản cũ; bộ cài sao lưu extension cũ và dùng lại Python/model nếu backend vẫn hợp lệ. Tệp mặc định tự chuẩn bị cả thư viện GPU; `CAI_DAT_GPU.cmd` dành cho kiểm tra GPU nghiêm ngặt.
3. Mở panel và kiểm tra nhãn **0.4.0 BETA**.
4. Chọn **Cách dựng timeline → Theo lô · tối ưu tốc độ**, phân tích rồi dựng sequence mới.
5. Chờ hoàn tất rồi mới sửa timeline. Kiểm tra hình, motion và caption rồi lưu project.

Bản này import tối đa 32 media mỗi lượt, dựng tối đa 8 clip mỗi lượt, giảm quét các clip cũ và giảm cập nhật giao diện khi ghi keyframe. Ảnh vẫn là clip riêng; giữ zoom/pan, số shot và Caption Track gốc. Không cần cài thêm GPU.

### Ba cách dựng timeline

| Lựa chọn | Khi dùng |
|---|---|
| Theo lô · tối ưu tốc độ | Mặc định để dựng nhanh nhiều ảnh/video |
| Từng clip · như bản 0.3.1 | So sánh với cách dựng nhanh trước đây |
| Tương thích · kiểm tra đầy đủ từng bước | Dựng sequence mới nếu host có vấn đề với chế độ theo lô |

**Không sửa timeline trong khi dựng theo lô.** Tool vẫn kiểm tra clip mới, số clip, khóa track, project/sequence và clip đầu/cuối liên tục. Các clip ở giữa được đối chiếu đầy đủ tại mốc 32, 64, 128... và trước/sau voice, quanh bước tạo caption. Một chỉnh sửa ở giữa timeline có thể chỉ được phát hiện tại lần đối chiếu tiếp theo. Chế độ Tương thích giữ cách kiểm tra đầy đủ từng bước.

Nút **Dừng** có hiệu lực khi Premiere trả quyền điều khiển sau thao tác đang chạy; không thể ngắt ngang một lệnh import native. Khi lỗi/dừng, giữ sequence dở để kiểm tra; muốn thử chế độ khác hãy phân tích và dựng sequence mới. Tool không tự chuyển chế độ để thử chèn lại.

### Đo tốc độ trên máy của bạn

Nhật ký có tổng số giây, số lượt xử lý và thời gian API cho import / chèn / cắt / motion / kiểm tra / caption. Bấm **Mở timeline JSON & phụ đề SRT** để mở thư mục kết quả, trong đó có thêm **`build-profile.json`**. Nếu vẫn chậm, gửi file này cùng phiên bản Premiere để xác định công đoạn tốn thời gian. Thời gian API không bao gồm toàn bộ thời gian chờ giữa các lệnh; không cộng nó rồi coi là tổng thời gian dựng.

Trong mô phỏng 500 ảnh + một voice: 501 → 17 lần import, 501 → 80 lượt xử lý qua panel, 502.002 → 6.000 lượt kiểm tra clip. Đây không phải số đo tốc độ Premiere thật và không bảo đảm tăng tốc theo cùng tỷ lệ.

Nếu cần giảm thêm số clip, đặt **Độ dài shot ảnh = 0**: mỗi ảnh chỉ có một clip. Điều này thay đổi nhịp khởi động/đổi chuyển động so với chia shot 6 giây, nên mặc định của bản mới vẫn giữ 6 giây.

Extension Windows dựng timeline từ voice và ảnh/video theo thứ tự. Chạy trực tiếp trong panel Premiere, tạo sequence mới, giữ mỗi ảnh/video thành clip riêng để chỉnh tiếp.

## Cài đặt

**Bộ cài online tự động:** đọc `BAT_DAU_O_DAY.md`. Giải nén toàn bộ ZIP, đóng Premiere rồi chạy **CAI_DAT.cmd**. Bộ cài tự tìm hoặc tải/cài Python 64-bit, cài backend và thư viện GPU; bạn không cần cài Python thủ công. Lần đầu cần Internet. Cài lại dùng môi trường và thư viện phù hợp đã có.

**CAI_DAT_CPU.cmd** dành cho người chỉ dùng CPU. **CAI_DAT_GPU.cmd** kiểm tra GPU nghiêm ngặt và chỉ cập nhật panel nếu kiểm tra đạt. Tệp mặc định **CAI_DAT.cmd** vẫn cài panel nếu thư viện đã cài nhưng thiết bị/driver GPU chưa sẵn sàng; trong trường hợp đó hãy chọn CPU.

Lần đầu tải khoảng 1–2 GB cho thư viện nhận dạng/GPU, chưa gồm model Whisper. Model tải khi nhận dạng lần đầu. Bộ cài không cập nhật driver NVIDIA. Thư viện CUDA/cuBLAS/cuDNN nằm trong Python riêng, không cần tự sửa PATH hệ thống.

Mở Premiere → **Window → Extensions (Legacy)** hoặc **Extensions → Auto Sync Voice**. Để trống **Python riêng**. Khi GPU được kiểm tra thành công, chọn **Tự chọn GPU / CPU** hoặc **NVIDIA GPU**. Bộ kiểm tra xác nhận DLL, driver và float16; chưa chạy suy luận Whisper thực tế.

Extension có ID `com.autosyncvoice.premiere`. Bộ cài bật `PlayerDebugMode` cho CEP của tài khoản hiện tại. Manifest khai báo host 14.0–26.99; đây không phải xác nhận đã kiểm thử tất cả các phiên bản Premiere.

## Quy trình sử dụng

1. Tạo/mở một project Premiere và lưu project.
2. Mở panel Auto Sync Voice.
3. Chọn voice và thư mục media. Nên đặt tên `001.png`, `002.png`, `003.mp4`... Không để bản nháp hoặc ảnh dư trong cùng thư mục. Tool chỉ đọc file trực tiếp trong thư mục, không quét thư mục con.
4. Chọn độ phân giải và FPS (24/25/30/60).
5. Chọn cách căn thời gian bên dưới.
6. Bấm **1. Phân tích**, kiểm tra bảng media/câu/thời gian. Khi có cảnh báo, nghe và kiểm tra các cảnh liên quan trước khi đánh dấu đã kiểm tra.
7. Chọn cách dựng timeline, bấm **2. Dựng timeline**. Không sửa timeline hoặc đổi sequence trong lúc đang dựng.
8. Kiểm tra chuyển cảnh ở vài vị trí đầu, giữa, cuối; lưu project bằng Ctrl+S.

Tool tạo sequence mới có tên riêng nếu trùng, ảnh/video trên **V1**, phụ đề trên **Caption Track gốc** nếu bật, voice trên **A1**. Không dựng đè vào sequence cũ. Mỗi lần hoàn tất chỉ được dựng một lần từ bảng hiện tại; muốn dựng lại, bấm Phân tích để tạo kế hoạch mới.

## Caption Track gốc của Premiere

- Bật **Tạo Caption Track gốc của Premiere**; mặc định bật. Chế độ chia đều không có text nên không tạo track.
- Tool ghi một file `timeline.srt` UTF-8, import vào bin của job và tạo một Subtitle track sau khi hình và voice đã hoàn tất. Không render PNG, không dùng V2 cho caption, không cần FFmpeg/libass/font đi kèm để tạo chữ.
- Sửa nội dung trong **Window → Text → Captions**; chỉnh thời điểm bằng cách kéo/cắt caption trên timeline. Chọn caption và chỉnh font, cỡ chữ, màu, vị trí trong Properties hoặc Essential Graphics tùy bản Premiere. Chọn font có hỗ trợ ngôn ngữ của nội dung.
- SRT chỉ mang nội dung và thời gian. Tool không tự áp dụng font, cỡ chữ hay vị trí; các ô cỡ chữ/cách đáy của bản PNG đã được bỏ. Với câu dài, chỉnh xuống dòng/cỡ chữ trong Premiere trước khi xuất.
- **SRT/JSON:** caption giữ start/end gốc, làm tròn tới mili giây khi ghi SRT. Khoảng nghỉ không bị kéo dài thành caption. Hình vẫn nối liên tục theo mốc cảnh; bảng hiển thị mốc cảnh, phần xem trước hiển thị mốc caption đầu tiên. Premiere có thể lượng tử hóa thời điểm theo frame khi import.
- **Transcript + Whisper:** caption dùng mốc cảnh đã căn theo Whisper. Bản này chưa có forced alignment hoặc karaoke theo từng từ.
- Phần xem trước chỉ hiển thị nội dung/thời gian, không mô phỏng style trong Premiere.
- **Khi xuất video:** mở phần **Captions**, chọn **Burn Captions Into Video** nếu muốn chữ nằm trong hình; chọn sidecar nếu muốn file phụ đề riêng và định dạng xuất hỗ trợ. Tạo Caption Track không tự bật burn-in ở hộp thoại Export.
- Giữ `timeline.srt` cùng project và media để tiện import lại/chuyển máy. Không có thư mục PNG caption mới.
- Host kiểm tra `createCaptionTrack` trước khi import hình/voice. Nếu phiên bản Premiere không có API này, tool báo lỗi kèm đường dẫn SRT; có thể tắt tùy chọn, dựng hình/voice rồi import SRT thủ công. Sequence trống vừa tạo có thể được giữ lại để kiểm tra.
- Nếu API trả lỗi hoặc không xác nhận thành công, tool giữ timeline đang dở và không tự gọi lại để tránh tạo trùng track. Kiểm tra thực tế trước khi tạo lại.

## Ba chế độ

### Transcript + Whisper

- Chọn TXT hoặc dán kịch bản. Nếu đã chọn file TXT, nội dung file được ưu tiên hơn ô dán.
- Chọn **Theo dấu kết câu** để tách theo `. ! ? … 。！？`; xuống dòng không tự tạo cảnh.
- Chọn **Mỗi dòng không trống là một cảnh** nếu đã chuẩn bị một câu/đoạn cho mỗi ảnh.
- Số cảnh phải bằng số media. Ví dụ 215 ảnh → đúng 215 cảnh sau khi tách.
- Với tiếng Nhật: chọn ngôn ngữ Nhật, model Small để thử trước. Có thể chọn Medium/Large v3 nhưng sẽ dùng nhiều RAM/VRAM và thời gian hơn.
- Lần đầu tải model cần Internet. Sau khi model có sẵn, xử lý voice trên máy; không gửi audio đến dịch vụ nhận dạng bên ngoài.
- Chạy `CAI_DAT_GPU.cmd` để cài hỗ trợ NVIDIA. Chế độ **NVIDIA GPU** chạy Whisper với CUDA/float16 và báo lỗi nếu GPU không sẵn sàng; không tự chuyển CPU. Chế độ **Tự chọn GPU / CPU** vẫn có thể chuyển CPU nếu gặp lỗi GPU. `CAI_DAT.cmd` chỉ cài phần cơ bản; dùng `CAI_DAT_GPU.cmd` cho máy chạy GPU.

Cơ chế: Whisper lấy timestamp từ/cụm từ → đối chiếu chữ với transcript → tìm ranh giới câu → lấy trung điểm khoảng nghỉ giữa hai câu → làm tròn theo frame → ghép media theo thứ tự. Không phân tích nội dung hình và không tự đổi ảnh cho khớp ý nghĩa.

**Độ khớp chữ không phải độ chính xác của timestamp.** Nếu tổng độ khớp dưới 50%, tool dừng; câu dưới 65% sẽ có cảnh báo. Câu lặp, voice đọc khác kịch bản hoặc Whisper nghe sai vẫn có thể lệch thời gian dù điểm chữ cao. Đây chưa phải forced alignment chuyên dụng. Cần nghe kiểm tra khi dùng cho sản phẩm cuối.

Timestamp nhận dạng được cache theo nội dung audio, model và ngôn ngữ. Đổi ảnh hoặc cách chia câu mà giữ cùng voice/model/ngôn ngữ có thể dùng lại cache.

### Timestamp SRT / JSON có sẵn

- Không chạy Whisper.
- **Một cue SRT tương ứng một media**, không tự gộp cue thành câu. SRT có 500 cue và chỉ 215 ảnh sẽ báo không khớp.
- JSON là array hoặc object có `scenes` / `segments`. Mỗi phần tử dùng `text`, `start`, `end` (đơn vị giây); cũng nhận `sourceText`, `audio_start`, `audio_end`.
- Timestamp phải tăng dần, không chồng lấn và không vượt thời lượng voice.
- Mốc đổi hình chia khoảng nghỉ tại trung điểm, cảnh đầu phủ từ 0 và cảnh cuối phủ đến hết voice. Mốc caption giữ riêng start/end cue gốc. Cue cuối vượt voice không quá 0,1 giây được cắt tại cuối voice và có cảnh báo; vượt hơn sẽ báo lỗi.

Ví dụ:

```json
{
  "scenes": [
    {"text":"朝、あなたはお茶を入れます。","start":0.2,"end":3.0},
    {"text":"突然、電話が鳴ります。","start":3.6,"end":6.8}
  ]
}
```

`001.png` đổi sang `002.png` khoảng giây 3.3. File mẫu trong `examples/` chỉ minh họa cấu trúc; cần dùng timestamp của voice thật.

### Chia đều theo voice

Không cần transcript hay tải model. Ví dụ voice 600 giây, 100 media → khoảng 6 giây mỗi media. Phần lẻ được phân bổ theo frame để không tích lũy sai số.

## Ảnh, video và motion

- Ảnh dài được chia thành các shot có thời lượng gần nhau theo công thức `max(1, round(thời lượng cảnh / độ dài shot))`, mặc định khoảng 6 giây như SyncVideo-Audio. Mốc shot bám frame và phủ kín cảnh. Ví dụ cảnh 20 giây tạo 3 shot khoảng 6,67 giây. Nhập 0 ở **Độ dài shot ảnh** để giữ một clip mỗi ảnh. Việc chia shot không chia lại câu caption.
- **Scale to Frame Size** giữ tỉ lệ và giữ trọn hình; ảnh khác tỉ lệ sequence có thể có khoảng trống hai bên/trên dưới. Chưa có chế độ crop-fill tự động.
- **Tự luân phiên 6 kiểu** theo thứ tự toàn timeline: Zoom in → Zoom out → Trái sang phải → Phải sang trái → Trên xuống dưới → Dưới lên trên → lặp lại. Mỗi shot ảnh hoặc đoạn lặp video nhận kiểu tiếp theo. Có thể chọn một kiểu cố định hoặc **Tắt chuyển động**.
- Zoom dùng Scale từ mức cơ sở đến ×1,08 (zoom in) hoặc ngược lại (zoom out). Pan giữ Scale ×1,06 và đổi Position ±0,025 theo trục tương ứng. Chuyển động áp dụng cho cả ảnh và video.
- Đây là chuyển thể cơ chế keyframe native chỉnh sửa được của SyncVideo-Audio: hai điểm, nội suy tuyến tính. Repo có đường render MP4 dùng easing khác; bản Premiere không mô phỏng đường render đó. Trục Y được đổi sang hệ tọa độ Premiere (chiều dương đi xuống).
- Keyframe đặt ở đầu nguồn và frame hiển thị cuối mỗi clip, chỉnh tiếp trong **Effect Controls → Motion → Scale / Position**. Clip một frame giữ tĩnh. Chuyển động không áp dụng cho voice hoặc Caption Track.
- **Tắt chuyển động** chỉ bỏ keyframe; muốn bỏ cả chia shot, nhập 0 ở độ dài shot ảnh.
- Biên phóng thêm 6% giúp có phần ảnh dư khi pan với nguồn cùng tỷ lệ khung hình. Khi dùng **Scale to Frame Size**, ảnh khác tỷ lệ vẫn có thể có viền; bản này không tự crop-fill, không phân tích chủ thể để chọn hướng. Kiểm tra bố cục và chỉnh Scale nếu cần.
- Host đọc lại giá trị keyframe để kiểm tra. Nếu thiếu API, giá trị không khớp hoặc Premiere từ chối, tool cố khôi phục Scale/Position về trạng thái tĩnh và hiện cảnh báo trong bảng/nhật ký; nếu khôi phục lỗi, cảnh báo yêu cầu kiểm tra Motion thủ công.
- Video giữ tốc độ gốc. Video dài được cắt; video ngắn được lặp để phủ thời lượng cảnh. Bản này vẫn giữ cơ chế video tốc độ gốc của extension; không lấy cơ chế thay đổi tốc độ video của repo tham khảo và chưa thêm transition.
- Âm thanh đi kèm video nguồn được bỏ, chỉ giữ voice trên A1.
- Media hỗ trợ ở phía planner: PNG/JPG/JPEG/WEBP/BMP/TIF/TIFF và MP4/MOV/M4V/AVI/MXF/WEBM/MKV. **Premiere phải hỗ trợ giải mã định dạng thực tế**; nếu không, hãy đổi ảnh sang PNG/JPG hoặc video sang MP4 trước. Không hỗ trợ GIF động ở bản này.

## Kết quả và khả năng chỉnh sửa

- Sequence Premiere với từng clip độc lập trên V1/A1.
- File `timeline.json`: bảng ghép/clip theo frame, `subtitleCues`, `subtitlePath` và `captionTrack` (schemaVersion 3), kiểu `motion` cho từng clip, `shotCount`/`motions` cho mỗi cảnh.
- File `timeline.srt`: timestamp gốc trong chế độ SRT/JSON, mốc cảnh trong chế độ Transcript. Vẫn xuất SRT khi tắt tạo Caption Track; chế độ chia đều tạo file SRT trống.
- `worker.log`: log lỗi backend nếu có.
- Bấm **Mở timeline JSON & phụ đề SRT** để mở thư mục kết quả.

Caption Track cho phép sửa chữ trực tiếp. Panel chưa có trình phát voice/waveform. Xuất MP4 bằng Premiere sau khi kiểm tra timeline và tùy chọn caption trong Export.

## Dừng và xử lý lỗi

- **Dừng** khi phân tích trên Windows kết thúc cây tiến trình Python và bộ giải mã của tác vụ.
- **Dừng** khi dựng sẽ dừng sau lời gọi Premiere hiện tại, không cắt ngang thao tác đang chạy. Sequence đã chèn một phần được giữ lại; không tự xóa media hay tự chạy lại.
- Nếu đóng panel khi đang dựng: mở **Nhật ký & thiết lập → Kết thúc phiên bị gián đoạn**, rồi Phân tích/Dựng lại. Lệnh này chỉ kết thúc phiên, không xóa sequence đang dở.
- Đổi project/sequence hoặc sửa thời gian clip trong lúc dựng sẽ làm tool dừng để tránh tiếp tục chèn sai.
- Media thay đổi sau khi phân tích sẽ yêu cầu phân tích lại.
- Không tìm thấy panel: kiểm tra đã đóng/mở lại Premiere, chạy đúng `CAI_DAT.cmd`, và bản Premiere có hỗ trợ CEP.
- Thiếu Python/av/faster_whisper: chạy lại bộ cài. Nếu import ctranslate2 lỗi DLL, kiểm tra Microsoft Visual C++ Redistributable x64.
- Gửi nhật ký trong panel, `worker.log` và phiên bản Premiere khi báo lỗi. Bộ cài ghi `NHAT_KY_CAI_DAT.txt`; lỗi pip chi tiết hiện trong cửa sổ cài đặt.

Extension được cài tại `%APPDATA%\Adobe\CEP\extensions\com.autosyncvoice.premiere`. Python, model, cache và jobs ở `%LOCALAPPDATA%\AutoSyncVoice`. Để đổi ổ lưu cache/model/jobs, sửa `dataDir` trong `runtime.json` của extension khi Premiere đã đóng; giữ nguyên `python` nếu chưa di chuyển môi trường Python.

`GO_CAI_DAT.cmd` gỡ riêng panel. Môi trường Python, model và kết quả được giữ lại. PlayerDebugMode được giữ vì Auto Queue hoặc extension khác có thể đang dùng.

## Kiểm thử và giới hạn xác nhận

Xem `TEST_RESULTS.md` để biết kết quả chạy trên gói này và các lệnh kiểm tra.

Chưa có Premiere Windows để chạy host thực tế, chưa chạy bộ cài PowerShell hoặc nhận dạng Whisper/GPU thật trong môi trường sửa source. Kiểm thử host dùng giả lập, không chứng minh tương thích mọi phiên bản Premiere. Việc tạo caption dựa vào giá trị trả về của API; bản CEP này không đọc lại từng caption/style từ native track. Hãy thử voice ngắn, 3–5 ảnh, một SRT có khoảng nghỉ, rồi kiểm tra sửa chữ/lưu/mở lại/export thực tế.

## Mã nguồn và kiểm thử lại

Toàn bộ mã nguồn nằm trong gói này; không cần build JavaScript trước khi cài.

```powershell
python -m unittest discover -s tests -v
node --test tests/host.test.js tests/fast-build.test.js tests/batch-build.test.js tests/motion.test.js
```

Test DOM: cài `jsdom` rồi chạy `node --test tests/ui.dom.test.js tests/ui.batch.test.js`. Test UI trong trình duyệt tùy chọn dùng Playwright (mô phỏng CEP/Python): cài Playwright và Chromium rồi chạy `node tests/ui.smoke.js`. Bản 0.4.0 đã chạy test DOM và tích hợp panel/host với jsdom; chưa chạy Chromium hoặc xác nhận hiển thị thực trong CEP. Cần Node mới hỗ trợ `node:test`; Node chỉ cần cho người phát triển chạy test, không cần cài riêng để sử dụng panel.

`cep/host.jsx`: bridge Premiere; `cep/panel.js`: panel và quản lý tác vụ; `cep/backend/planner.py`: lập timeline; `cep/backend/worker.py`: đọc metadata và Whisper; `install.ps1`: bộ cài.
