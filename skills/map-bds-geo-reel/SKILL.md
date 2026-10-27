---
name: map-bds-geo-reel
description: Dựng video dọc TikTok/Reels/Shorts 15–60 giây kiểu "bản đồ là nhân vật chính" cho bất động sản: zoom bậc thang từ tỉnh xuống thửa đất, polygon ranh đất phát sáng, đường nét đứt có số km tới tiện ích, pin + nhãn, khối lô đất 3D có kích thước, hook chữ to và kết bằng bằng chứng thật. Dùng khi người dùng muốn video BĐS "đẹp như các kênh edit BĐS trên TikTok", video GeoLayers/CapCut map, video vị trí/tiện ích/mặt bằng dự án, hoặc khi chỉnh sửa scene bản đồ trong project Map BĐS. Dùng cùng skill map-bds-video (pipeline CLI) và remotion-motion-graphics (quy tắc chuyển động).
---

# Map BĐS · Geo Reel (video dọc kiểu TikTok)

Project: `E:\Ai-auto-gen-video-BDS`. Phân tích đối thủ gốc: [references/competitor-breakdown.md](references/competitor-breakdown.md). Danh sách tính năng còn thiếu và thứ tự làm: [docs/COMPETITOR-GAP.md](../../docs/COMPETITOR-GAP.md).

Pipeline chạy lệnh (prepare, fetch-*, tts, render) theo skill `map-bds-video`. Skill này quy định **video trông như thế nào** và **cần dữ liệu gì**.

## Nguyên tắc cốt lõi

1. **Bản đồ chiếm toàn khung từ đầu đến cuối.** Không đặt thẻ bento/khung chữ lớn che bản đồ; không làm tối bản đồ quá `brightness(0.6)`.
2. **Mọi thông tin gắn tọa độ** và thuộc một trong ba loại: polygon (ranh, thửa, mặt bằng), polyline (đường đi, mũi tên nét đứt), point (pin + nhãn). Nếu không có tọa độ thật thì không vẽ lên bản đồ; chỉ hiển thị dạng chữ và ghi "theo thông tin người đăng".
3. **Một beat = 2–4 giây = thêm đúng một lớp thông tin.** Camera không bao giờ đứng yên quá 1 beat.
4. **Vẽ dần, không bật tức thì**: viền polygon chạy quanh (stroke-dashoffset theo frame), nét đứt chạy từ A→B, vòng bán kính quét, khối 3D đùn từ mặt đất lên.
5. **Hook ở frame 0**, khung cuối gần giống khung đầu để video loop mượt.
6. **Trung thực**: chỉ vẽ ranh từ `boundaryPolygon` người dùng cung cấp hoặc OSM (ranh hành chính). Mặt bằng/khối 3D là minh họa và phải có nhãn nhỏ "MINH HỌA". Không gọi ảnh sơ đồ là ảnh vệ tinh; giữ attribution của nguồn ảnh bản đồ. Không tự bịa khoảng cách, tên tiện ích, pháp lý.

## Chọn mẫu kịch bản

| Mẫu | Khi nào dùng | Thời lượng |
|---|---|---|
| **A · Mặt bằng dự án** | Dự án phân lô / khu đô thị có ảnh mặt bằng quy hoạch | 15–20s |
| **B · Tiện ích quanh lô** | Một lô đất/nhà, cần bán vị trí + tiện ích | 20–30s |
| **C · Lô đất đầy đủ** | Có flycam, sổ đỏ, nhiều tiện ích, ranh hành chính | 45–60s |

### Mẫu A — Mặt bằng dự án (15–20s)
| Beat | Giây | Hình ảnh | Dữ liệu cần |
|---|---|---|---|
| Hook | 0–1,5 | Vệ tinh rộng, chữ hook 2 tầng (trắng + đỏ/vàng khổng lồ) giữa khung | `hook` |
| Reveal | 1,5–4 | Ảnh mặt bằng ghép đúng 4 góc lên vệ tinh, viền neon xanh dương, camera nghiêng 45° trượt ngang | ảnh mặt bằng + 4 góc tọa độ |
| Highlight | 4–7 | Đổi sang polygon tô xanh lá 40% + viền trắng; nhãn tên dự án | `boundaryPolygon` |
| Connect | 7–12 | Thu nhỏ, 2–4 mũi tên nét đứt mọc ra tới pin tiện ích có nhãn | tiện ích **có tọa độ** |
| Loop | 12–end | Bay về khung hook, chữ hook vào lại | — |

### Mẫu B — Tiện ích quanh lô (20–30s)
| Beat | Giây | Hình ảnh | Dữ liệu cần |
|---|---|---|---|
| Title | 0–3 | Tiêu đề 2 dòng cố định ở 1/4 trên, giữ suốt video; vệ tinh tối tương phản cao | `title` |
| Pin | 3–6 | Pin "VỊ TRÍ ĐẤT" thả xuống; tên đường chữ to xoay theo hướng đường, vệt sáng vàng chạy dọc đường | `gps`, tên + polyline đường |
| Plot | 6–12 | Zoom sát, khối lô 3D đùn lên, cạnh ghi `widthM`/`lengthM`, mặt khối ghi `areaM2` | `specs`, `boundaryPolygon` |
| Landmarks | 12–16 | Tên sông/hồ chữ phát sáng uốn theo dòng | tên + polyline mặt nước |
| Amenities | 16–end | Nét đứt vàng từ pin tới từng thẻ ảnh tiện ích (ảnh thật + nhãn + khoảng cách), mỗi thẻ 1,5–2s | tiện ích có tọa độ + ảnh |

### Mẫu C — Lô đất đầy đủ (45–60s)
| Beat | Giây | Hình ảnh | Dữ liệu cần |
|---|---|---|---|
| Macro | 0–4 | Vệ tinh cả nước/vùng → zoom vào tỉnh, ranh tỉnh glow xanh lá | ranh tỉnh (`fetch-boundary`) |
| District | 4–11 | Ranh huyện/thị xã, nhãn địa danh | ranh huyện |
| Context | 11–16 | (Tùy chọn) ảnh văn bản quy hoạch/bài báo có highlight câu chính | ảnh văn bản **do người dùng cung cấp** |
| Ward | 16–20 | Ranh xã/phường, nhấn khu chứa lô | ranh xã |
| Flycam | 20–28 | Flycam thật, polygon thửa đất track bám cảnh, nhãn diện tích + kích thước, đo khoảng cách ra trục chính | `streetVideo` + điểm track |
| Radius | 28–36 | Vòng bán kính quét quanh pin, nhãn tiện ích đỏ bật lần lượt trong vòng | tiện ích có tọa độ |
| Routes | 36–48 | Nét đứt có ghi km tới quốc lộ / trung tâm; trục chính tô cyan | `routes` (`fetch-route`) |
| Proof | 48–end | Quay lại lô đất, ảnh sổ đỏ/trích lục bật lên nửa dưới + CTA | ảnh pháp lý do chủ cung cấp, `contact` |

Không đủ dữ liệu cho beat nào thì **bỏ beat đó và rút ngắn video**, không lấp bằng thẻ chữ.

## Hệ thống thị giác

- **Khung**: 1080×1920. Vùng an toàn TikTok: chữ quan trọng nằm trong `x 60–900`, `y 220–1500` (đáy ~20% bị caption/nút che, cột phải ~180px bị nút che).
- **Nền**: vệ tinh độ phân giải cao, `brightness 0.7–0.85`, `contrast 1.15–1.25`, `saturate 1.1`. Vignette nhẹ, không phủ gradient đặc.
- **Màu đồ họa** (neon trên nền tối): ranh dự án xanh dương `#2d9bff` glow; thửa đất xanh lá `#39ff88` fill 35–45%; tuyến đường vàng `#ffd23f`; trục chính cyan `#22e1ff`; nhãn tiện ích nền đỏ `#e5252a` chữ trắng; pin chính vàng/đỏ.
- **Glow**: viền 4–8px + 2 lớp `drop-shadow`/bloom (bán kính 8px và 24px).
- **Chữ**: hook 120–160px đậm, viền đen 6–10px hoặc nền đặc; nhãn 32–44px, 2–5 từ; tiêu đề cố định 56–72px. Font đã có trong `src/fonts.ts`, hỗ trợ tiếng Việt.
- **Nét đứt**: dash 24 / gap 16, chạy bằng dashoffset; đầu mũi tên tam giác.

## Quy tắc chuyển động (Remotion)

- Mọi thứ tính từ `useCurrentFrame()` + `fps`; không dùng `Date`, `setTimeout`, hay biến tích lũy trong `useFrame` (yêu cầu của AGENTS.md).
- Camera: `interpolate` với `Easing.inOut(Easing.cubic)` giữa các keyframe beat; zoom bậc thang dùng tỉ lệ log (mỗi bậc ×4–×8) để tốc độ cảm nhận đều.
- Pin: `spring({damping: 12})` rơi từ trên xuống + nảy; nhãn trượt ra sau pin 4–6 frame.
- Polygon: viền vẽ trong 18–24 frame, fill fade sau đó 8 frame.
- Stagger nhãn tiện ích 6–10 frame. Exit nhanh hơn entrance.
- SFX: whoosh khi đổi bậc zoom (`public/audio/sfx/12_Whooshes_and_Dives`), pop khi pin/nhãn xuất hiện (`02_Pops_and_Bubbles`), impact khi hook xuất hiện (`09_Impacts_and_Hits`). Nhạc nền đặt beat 2–4s trùng với cắt beat.

Chi tiết thêm về easing/stagger: skill `remotion-motion-graphics`.

## Quy trình cho agent

1. **Thu dữ liệu & kiểm tra đủ cho mẫu nào** (bảng "Dữ liệu cần" ở trên). Hỏi người dùng những thứ chỉ họ có: ranh thửa đất, flycam, ảnh mặt bằng, ảnh tiện ích, ảnh sổ đỏ, hook.
2. **Tự lấy dữ liệu địa lý** bằng các lệnh có sẵn (đều là thao tác mạng, chạy khi người dùng đồng ý):
   ```powershell
   npm.cmd run video -- fetch-map --input <file>.json
   npm.cmd run video -- fetch-boundary --input <file>.json --query "<xã/huyện/tỉnh>"
   npm.cmd run video -- fetch-route --input <file>.json --to "<điểm đến>"
   npm.cmd run video -- scan-amenities --input <file>.json --radius 2000
   ```
3. **Kiểm tra tính năng renderer** trong [docs/COMPETITOR-GAP.md](../../docs/COMPETITOR-GAP.md). Beat nào cần tính năng chưa có: hoặc triển khai theo mục tương ứng trong tài liệu đó (nếu người dùng yêu cầu code), hoặc bỏ beat.
4. **Render nháp dọc** và **xem khung hình mỗi beat**:
   ```powershell
   npm.cmd run video -- render --input <file>.json --format portrait --draft
   npm.cmd run video -- still --input <file>.json --format portrait --frame <n>
   ```
5. **Checklist QA** trước khi render bản cuối:
   - [ ] Bản đồ chiếm >85% diện tích ở mọi khung; không có khung nào chỉ là thẻ chữ.
   - [ ] Camera có chuyển động trong mọi beat; mỗi beat thêm đúng một lớp.
   - [ ] Chữ nằm trong vùng an toàn, đọc được ở kích thước điện thoại.
   - [ ] Mọi polygon/khoảng cách/tiện ích có nguồn (người dùng hoặc OSM/OSRM); phối cảnh có nhãn "MINH HỌA"; attribution bản đồ còn hiển thị.
   - [ ] Hook có ở frame 0; khung cuối nối được về khung đầu.
   - [ ] `npm.cmd run check` qua.
