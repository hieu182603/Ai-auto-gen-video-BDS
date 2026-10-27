# Dự án còn thiếu gì để làm được video như đối thủ

So sánh 3 video TikTok đối thủ (phân tích chi tiết: `skills/map-bds-geo-reel/references/competitor-breakdown.md`) với khung hình render từ `examples/ho-tay.json` bản dọc ngày 26/10/2026 (frame 150, 450, 800).

## Khác biệt gốc

Đối thủ: **bản đồ là nhân vật chính**, đồ họa vẽ lên đúng tọa độ, camera bay liên tục, mỗi 2–4s thêm một lớp.
Dự án hiện tại: **slide thông tin đặt trên nền bản đồ**. Scene "Quy mô" là 5 thẻ bento che gần hết khung; scene "Tiện ích" làm tối bản đồ còn ~32% độ sáng rồi đặt danh sách thanh tiến trình; caption dài nằm đúng vùng đáy bị UI TikTok che. Timeline cố định 5 cảnh theo tỉ lệ 20/25/20/20/15%, mặc định 60s.

Muốn đẹp như đối thủ cần đổi cả **dữ liệu**, **engine bản đồ** và **ngữ pháp dựng**, không chỉ thêm hiệu ứng.

## Đã có và dùng lại được

| Có sẵn | Ghi chú |
|---|---|
| `boundaryPolygon` + `Boundary3D.tsx` | Polygon thửa đất; cần glow dày hơn và vẽ dần |
| `fetch-boundary` (OSM Nominatim) | Ranh hành chính cho mẫu C |
| `routes` + `fetch-route` (OSRM) | Polyline + km + phút; chưa vẽ dạng nét đứt chạy dần |
| `scan-amenities` (Overpass) | Có tọa độ khi quét nhưng **không lưu vào JSON** |
| `fetch-map` + `Map3DScene` zoom 3 bậc (z4 → z12 → z17) | Nền cho zoom bậc thang |
| `streetVideo` + overlay "drone tracking" | Khung cố định, chưa track theo cảnh |
| Thư viện SFX `public/audio/sfx/` (27 file) | **Chưa được dùng trong `Video.tsx`** |
| TTS 3 nhà cung cấp, `badge` 8 kiểu, font tiếng Việt | Giữ nguyên |

## Còn thiếu — xếp theo ưu tiên

### P0 · Sửa trước tiên (tính trung thực dữ liệu)

0. ✅ **Đã sửa (26/10/2026): `scan-amenities` không còn bịa tiện ích.** Trước đây lệnh này chèn 4 tiện ích cố định khi OSM rỗng hoặc mất mạng, và tự đặt tên chung cho phần tử không tên. Giờ lệnh báo lỗi và giữ nguyên file; phần tử không tên hoặc không có tọa độ bị bỏ. Prompt `script:ai` chỉ lấy tiện ích mà bài đăng ghi rõ. Lưu ý: tiện ích trong `examples/ho-tay.json` vẫn là dữ liệu giả định của bản demo.
   ✅ **Dữ liệu OpenStreetMap Việt Nam local — Giai đoạn 1 (26/10/2026)**: Lệnh `osm-sync` tải file Geofabrik (~332 MB) và xử lý thành dữ liệu local (`data/osm/vn/`) đọc tức thì; `scan-amenities` và `fetch-boundary` hỗ trợ cờ `--source auto|local|online` chạy offline không cần mạng; trích xuất đường và sông ngòi có tên (`lines/`) theo ô lưới 0.1° cho nhãn bản đồ; ghi nhận nguồn ODbL "© OpenStreetMap contributors" trên video và poster.

### P0 · Bắt buộc để có "look" đối thủ

1. ✅ **Tiện ích có tọa độ** (đã làm). `amenities[]` nhận thêm `lat`/`lng` (phải có đủ cả hai), `category`, `image` (file trong `public/`, được `validateAssets` kiểm tra). `scan-amenities` và `auto` ghi tọa độ OSM vào JSON. `distanceM` từ lệnh quét là khoảng cách đường chim bay. Giới hạn vẫn là 6 mục vì cảnh tiện ích hiện tại chưa bố trí được nhiều hơn; sẽ nâng khi làm mẫu C.
2. ✅ **Module chiếu tọa độ** (đã làm): `src/geo.ts` gồm Web Mercator, `staticImageFrame`, `projectToImage` / `imageToLatLng`, `toLocalMeters`, `distanceMeters`, `frameGroundSize`. `fetch-map` ghi `media.geo.{spaceImage,cityImage,aerialImage}` (vùng bao phủ, phép chiếu, kích thước pixel). Ảnh Mapbox/Google dùng phép chiếu mercator, ảnh ESRI dùng equirectangular. `Boundary3D` dùng chung `toLocalMeters`. Đã kiểm chứng trên ảnh Mapbox thật: viền thửa và điểm Hồ Tây rơi đúng vị trí.
   ✅ **Ảnh khớp ranh thửa** (26/10/2026): khi có `media.geo.aerialImage`, tầng thửa đất của `Map3DScene` và mặt phẳng ảnh của cảnh "Quy mô" (`House.tsx`) được đặt theo `groundPlaneForFrame`, tức kích thước mặt đất thật và tâm ảnh tính từ gps; test kiểm tra mỗi đỉnh ranh rơi đúng pixel (±0,5 px). Không có `media.geo` thì dùng kích thước minh họa cũ. Tầng vũ trụ/thành phố cố ý giữ tỉ lệ theo `span` để camera zoom bậc thang không đổi.
   Cùng đợt đã sửa lỗi ảnh vệ tinh không phải ảnh demo Hồ Tây (tức mọi ảnh do `fetch-map` tải) và mô hình GLB không hiện khi render: texture nạp sau lần vẽ đầu nhưng `ThreeCanvas` chạy `frameloop: "never"`. Nay dùng `useSatelliteTexture`: giữ `delayRender`, `advance()` lại canvas và tạo lại vật liệu khi texture về.
   Hệ quả: ở đúng tỉ lệ, ảnh z17 (~0,26 m/px) mờ khi camera đứng gần; chạy `fetch-map --zoom 18` hoặc `19` sẽ nét hơn. Xem P1.7.
3. **Lớp vẽ bản đồ (geo overlay layer)** gồm các primitive, đều animate theo frame:
   - `GeoPolygon`: viền chạy dần + glow 2 lớp + fill fade.
   - `GeoDashedLine`: nét đứt chạy A→B, đầu mũi tên, nhãn km giữa tuyến.
   - `GeoPin`: rơi + nảy, nhãn nền đặc trượt ra.
   - `GeoRadius`: vòng tròn quét theo mét thật.
   - `GeoLabel` theo đường cong/hướng (tên đường, tên sông).
   - `PhotoCard`: thẻ ảnh tiện ích nối với pin.
4. **Camera bản đồ theo keyframe** — thay 3 bậc zoom cố định bằng danh sách keyframe `{center, zoom, tilt, bearing, atBeat}` nội suy mượt (log-zoom). Cần thiết cho "bay tới từng tiện ích" và "zoom quốc gia → thửa".
5. **Timeline theo beat / mẫu kịch bản** — thay 5 cảnh tỉ lệ cố định bằng shot list sinh từ mẫu A/B/C trong skill `map-bds-geo-reel`, tự bỏ beat thiếu dữ liệu, cho phép 15–30s. Giữ bất biến "mọi frame được phủ đúng một lần" (test hiện có).
6. **Bố cục dọc cho TikTok** — bỏ thẻ bento/khung caption lớn trong preset geo-reel; tiêu đề cố định 1/4 trên; chữ nằm trong vùng an toàn (không đáy 20%, không cột phải ~180px); phụ đề ngắn hoặc để trong file SRT.

### P1 · Nâng chất lượng hình

7. **Ảnh vệ tinh đủ nét khi zoom sát** — mỗi bậc chỉ là 1 ảnh ≤1280px nên frame 450 bị vỡ/mờ rõ. Cần ghép tile (mosaic) độ phân giải 4–8K cho bậc thửa đất và thêm bậc trung gian (z7, z10, z14) để zoom liền mạch. Kiểm tra quy định nguồn ảnh trước (mục P3).
8. **Hook chữ to + loop** — field `hook` (1–2 dòng, ≤40 ký tự) hiển thị ở frame 0 và cuối video.
9. **Khối lô đất 3D có kích thước** — đùn `boundaryPolygon` thành khối, ghi `widthM`/`lengthM` lên cạnh và `areaM2` lên mặt (mẫu B). Hiện kích thước nằm trong thẻ chữ.
10. **Ghép ảnh mặt bằng quy hoạch lên bản đồ** (mẫu A) — field ví dụ `media.sitePlan` + 4 góc tọa độ, warp phối cảnh lên ảnh vệ tinh.
11. **Gắn SFX theo beat** — whoosh khi đổi bậc zoom, pop khi pin/nhãn xuất hiện, impact khi hook vào; nhạc nền khớp nhịp beat.

### P2 · Bằng chứng thật (phụ thuộc tư liệu chủ sở hữu)

12. **Thẻ ảnh tiện ích** (ảnh do người dùng cung cấp, có attribution).
13. **Ảnh tài liệu bật lên** — sổ đỏ/trích lục, văn bản quy hoạch, có vùng highlight. Field ví dụ `media.documents[] {image, caption, highlight?}`. Chỉ dùng tài liệu người dùng cung cấp; nên che số thửa/tên chủ nếu cần.
14. **Track polygon trên flycam** — tối thiểu: người dùng cung cấp 4 góc pixel ở vài keyframe, nội suy theo frame. Track tự động (optical flow) là việc lớn, để sau.

### P3 · Điều kiện ngoài code

15. **Quyền dùng ảnh vệ tinh trong video thương mại.** `docs/PROJECT.md` đã nêu Google giới hạn video quảng cáo 30s. Điều khoản Mapbox Static Images và ESRI World Imagery cho video bán hàng cũng phải được kiểm tra trước khi đăng. Đối thủ dùng GeoLayers/Google Earth; điều đó không có nghĩa dự án được dùng tự do.
16. **Tư liệu thật cho mỗi BĐS**: ranh thửa đất (từ sổ/trích lục), flycam, ảnh tiện ích, ảnh mặt bằng. Không có thì mẫu C không làm được, dù code đủ.
17. **Hiệu chỉnh trên dữ liệu thật** — hiện mới thử với dữ liệu giả định Hồ Tây.

## Thứ tự triển khai đề xuất

1. P0.1 + P0.2 (schema tiện ích có tọa độ, module chiếu, metadata bbox) + test.
2. P0.3 primitive `GeoPolygon`, `GeoPin`, `GeoDashedLine` + P0.6 bố cục dọc → làm được **mẫu B rút gọn**.
3. P0.4 camera keyframe + P0.5 timeline theo beat → đủ **mẫu B** và phần vệ tinh của **mẫu C**.
4. P1.7 ảnh nét + P1.8 hook + P1.11 SFX → chất lượng ngang đối thủ.
5. P1.9, P1.10, P2 theo tư liệu khách hàng có.

Mỗi bước kiểm tra bằng `npm.cmd run check` và render nháp dọc, sau đó xem khung hình từng beat.
