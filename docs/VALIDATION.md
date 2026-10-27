# Kết quả kiểm tra setup — 19/10/2026

- Node.js 22.11.0; dependencies đã cài và khóa bằng package-lock.json. npm install báo 0 vulnerabilities tại thời điểm cài.
- `npm.cmd run check`: TypeScript thành công, 4/4 tests thành công.
- Skill nguồn và bản cài Codex: trình quick_validate báo hợp lệ.
- Batch hai tác vụ đồng thời hoàn tất: `out/ho-tay-demo-landscape-803fbce3/video.mp4` (960×540) và `out/ho-tay-demo-portrait-4124328b/video.mp4` (540×960), H.264, mỗi video đúng 60 giây theo ffprobe. Đây là bản draft, không có giọng đọc.
- Đã kiểm tra ảnh đại diện và contact sheet cả hai tỷ lệ: đủ năm cảnh, chữ tiếng Việt dùng Noto Serif local, không tràn bố cục với input mẫu.
- Fixture panorama SVG 2048×1024 và tone WAV local đã render qua toàn bộ pipeline thành `out/qa-panorama-landscape-d409bb43/video.mp4`, 12 giây; đây là dữ liệu kiểm thử kỹ thuật, không phải ảnh bất động sản. Không cần API key.
- `.env`, tư liệu sinh ra và `out/` được Git bỏ qua. Repository local đã khởi tạo; chưa tạo commit hay remote.

Chưa kiểm thử Gemini TTS bằng API thật (chưa có key), tư liệu khách hàng, bản đồ thật, địa điểm/ranh đất thật, hay tải 100 video/tháng. Video demo chỉ minh họa khả năng vận hành bộ khung. Cảnh panorama nhận đầu vào đã có; không tạo panorama từ ảnh thường.

Three.js qua React Three Fiber hiện in cảnh báo deprecation `THREE.Clock`; không làm thất bại kiểm tra/render. Chuyển động của project dùng frame Remotion, không dùng Clock.
