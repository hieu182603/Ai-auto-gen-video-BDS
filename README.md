# Map BĐS

Công cụ **chạy local, điều khiển bằng JSON/CLI/skill**, tạo video giới thiệu bất động sản bằng Remotion + React + Three.js. Không cần xây giao diện web, Redis hay thuê cloud để bắt đầu.

## Chạy ngay trên Windows PowerShell

Đã cài dependencies trong máy hiện tại. Nếu chuyển máy, cài Node.js 22+ rồi chạy `npm.cmd ci`.

```powershell
Set-Location 'E:\Ai-auto-gen-video-BDS'
npm.cmd run demo
```

Lệnh demo render video **60 giây, 960 × 540**, dùng dữ liệu Hồ Tây giả định, không gọi API AI/bản đồ. Lần đầu Remotion có thể tải Chromium. File được lưu trong thư mục riêng `out/<id>-<format>-<job>/`.

```powershell
# Render nhanh để kiểm tra toàn bộ 5 cảnh
npm.cmd run video -- render --input examples/ho-tay.json --draft --seconds 12

# Full HD ngang; bỏ --draft để xuất đủ độ phân giải
npm.cmd run video -- render --input examples/ho-tay.json

# Full HD dọc
npm.cmd run video -- render --input examples/ho-tay.json --format portrait

# Hai tác vụ chạy cùng lúc, mỗi tác vụ mặc định dùng 2 browser tabs
npm.cmd run video -- batch --input examples/batch.json --jobs 2 --draft

# Chỉ chuẩn bị dữ liệu, caption, kịch bản; không render
npm.cmd run video -- prepare --input examples/ho-tay.json

# Xuất một ảnh, kiểm tra đầu vào, hoặc xem cấu hình
npm.cmd run video -- still --input examples/ho-tay.json --frame 500
npm.cmd run video -- validate --input examples/ho-tay.json
npm.cmd run video -- doctor
npm.cmd run check
```

Trên PowerShell của máy này dùng **`npm.cmd`** để tránh npm.ps1 làm mất tham số `--input`, `--draft`. macOS/Linux dùng `npm` tương ứng.

## Đầu vào và đầu ra

Sao chép `examples/ho-tay.json` thành file riêng và thay bằng dữ liệu đã kiểm chứng. Các số đo dùng số, không dùng chuỗi `"100m2"`.

- `gps`: tọa độ vĩ độ / kinh độ của BĐS.
- `boundaryPolygon`: (Tùy chọn) Mảng tọa độ các đỉnh ranh đất theo GIS / Sổ đỏ (ví dụ: `[{"lat": 21.0625, "lng": 105.8153}, ...]`). Hệ thống tự động chuyển đổi sang không gian 3D và vẽ khung viền phát sáng bám địa hình kèm các cọc mốc địa chính tại các góc. Chỉ nhập ranh thửa đất thật; lệnh `fetch-boundary` không ghi vào trường này.
- `adminBoundary`: (Tùy chọn) Ranh phường/xã/tỉnh `{name, adminLevel?, osmId?, polygon}` do `fetch-boundary` ghi từ OpenStreetMap (`polygon` 3–300 đỉnh, không lặp điểm đầu ở cuối). Đây không phải ranh thửa đất; hiện chưa được vẽ lên video.
- `specs`: `areaM2`, `widthM`, `lengthM`, `stories`.
- `amenities`: tối đa 6 tiện ích `{name, distanceM}`; có thể thêm `lat`/`lng` (cần đủ cả hai), `category` (`education`/`health`/`shopping`/`leisure`/`other`) và `image` (ảnh trong `public/`). Lệnh `scan-amenities` điền tự động từ OpenStreetMap kèm tọa độ; `distanceM` khi quét là đường chim bay. Nếu không tìm thấy hoặc mất mạng, lệnh báo lỗi và giữ nguyên file, không tự điền tiện ích mẫu.
- `media.geo`: do `fetch-map` ghi, mô tả vùng bao phủ và phép chiếu của từng ảnh vệ tinh để chiếu tọa độ lên ảnh (`src/geo.ts`). Không cần nhập tay.
- `video`: `format` là `landscape`/`portrait`, `durationSeconds` từ 12–120, `fps` là 24/30.
- `contact`: tên, lời mời liên hệ; số điện thoại tùy chọn.
- `disclaimer`: nhãn về tính chất thông tin. Mẫu mặc định nêu rõ giả định/phối cảnh.

Mỗi tác vụ render tạo `video.mp4`, `poster.png`, `poster-magazine.png`, `input.json`, `timeline.json`, `captions.srt`, `narration.txt`, `social-caption.txt`, `status.json`. Lệnh `still` không tạo MP4; `prepare` chỉ tạo các file nội dung. Job có ID riêng nên không ghi đè lần render trước.

## Đồng bộ dữ liệu OpenStreetMap Việt Nam local (`osm-sync`)

Tải và trích xuất toàn bộ dữ liệu OSM Việt Nam từ Geofabrik (~332 MB) về máy để chạy hoàn toàn offline với tốc độ siêu nhanh (không bị nghẽn mạng hay rate limit):

```powershell
# Tải (nếu chưa có hoặc có bản mới hơn) và xử lý dữ liệu
npm.cmd run video -- osm-sync

# Chỉ xử lý lại file .pbf đã tải về trước đó
npm.cmd run video -- osm-sync --process-only

# Bắt buộc tải lại bản mới nhất từ server
npm.cmd run video -- osm-sync --force
```

Dữ liệu xử lý được lưu trữ tại `data/osm/vn/` bao gồm:
- `pois.ndjson`: Danh mục tiện ích (trường học, y tế, mua sắm, công viên, mặt nước) có tên.
- `admin.ndjson`: Ranh giới hành chính cấp tỉnh, huyện, xã (đã ghép vòng ngoài kín và rút gọn Douglas–Peucker <= 300 đỉnh).
- `lines/<latKey>_<lngKey>.ndjson`: Hệ thống đường bộ và sông ngòi có tên được phân ô lưới không gian 0.1°.
- `meta.json`: Metadata về nguồn, thời điểm, mã băm MD5, số lượng phần tử và bản quyền ODbL.

### Truy vấn nhanh dữ liệu bản đồ (`osm-query`)

Kiểm tra tức thì các lớp dữ liệu quanh một tọa độ GPS mà không sửa đổi file:
```powershell
npm.cmd run video -- osm-query --lat 21.063 --lng 105.8283 --radius 1000 --layer roads
npm.cmd run video -- osm-query --lat 21.063 --lng 105.8283 --radius 1000 --layer waterways
npm.cmd run video -- osm-query --lat 21.063 --lng 105.8283 --radius 1000 --layer pois
npm.cmd run video -- osm-query --lat 21.063 --lng 105.8283 --radius 1000 --layer admin
```

## Tự động quét tiện ích lân cận (`scan-amenities`)

Sử dụng OpenStreetMap (ưu tiên dữ liệu local hoặc Overpass radar online) để tự động quét trường học, bệnh viện, chợ, công viên và hồ nước gần nhất theo bán kính:

```powershell
# Tự động chọn nguồn (ưu tiên local nếu đã chạy osm-sync, không thì dùng online)
npm.cmd run video -- scan-amenities --input examples/ho-tay.json --radius 2000

# Bắt buộc dùng dữ liệu local (chạy hoàn toàn offline)
npm.cmd run video -- scan-amenities --input examples/ho-tay.json --radius 2000 --source local

# Bắt buộc quét online qua Overpass API
npm.cmd run video -- scan-amenities --input examples/ho-tay.json --radius 2000 --source online

# Hoặc quét thử theo tọa độ GPS bất kỳ
npm.cmd run amenities -- --lat 21.0625 --lng 105.8153 --radius 1500 [--source local|online]
```

## Ranh đất GIS phát sáng (`boundaryPolygon`)

Hệ thống hỗ trợ nạp mảng tọa độ các đỉnh ranh đất từ sổ đỏ hoặc trích lục địa chính:
```json
{
  "boundaryPolygon": [
    {"lat": 21.06259, "lng": 105.81528},
    {"lat": 21.06259, "lng": 105.81532},
    {"lat": 21.06241, "lng": 105.81532},
    {"lat": 21.06241, "lng": 105.81528}
  ]
}
```
- Trên bản đồ 2D (Scene 1): Vẽ đa giác viền vàng kim Champagne phát sáng.
- Trong không gian 3D (Scene 4): Dựng khung viền neon dạ quang, mặt phẳng tô màu phát sáng trong lòng thửa đất, và cọc mốc địa chính tại 4 góc.

## Hiệu ứng chuyển cảnh Trước - Sau (Before & After Wipe)

Khi BĐS có cả ảnh hiện trạng (`aerialImage` hoặc `propertyImage`) và mô hình 3D (`model3d`), Phân cảnh 4 sẽ tự động kích hoạt thanh trượt Before-After Wipe:
- Thanh chia phát sáng quét ngang màn hình từ trái qua phải.
- Nửa bên trái: **◀ HIỆN TRẠNG ĐẤT NỀN**.
- Nửa bên phải: **QUY HOẠCH HOÀN THIỆN ▶** (mô hình biệt thự 3D).

## Tự động sinh kịch bản BĐS bằng AI (`script:ai`)

Hệ thống tích hợp công cụ AI Copywriting trực tiếp dùng Gemini Flash API để biến các bài đăng thô của môi giới thành file `input.json` chuẩn cấu trúc kèm đầy đủ hook marketing BĐS.

AI chỉ trích xuất dữ kiện có trong bài, không suy đoán tọa độ hay kích thước. Lệnh còn kiểm tra lại: tọa độ `gps`, `specs.areaM2/widthM/lengthM` và khoảng cách tiện ích phải là số có trong bài, nếu không sẽ bị bỏ. Khi thiếu `gps`, `specs`, `contact.name` hoặc trường bắt buộc khác, lệnh **không** tạo file hợp lệ giả mà ghi bản nháp `<output>.draft.json` (mặc định `examples/<id>.draft.json`) với các trường thiếu để `null`, in danh sách trường cần nhập tay và thoát với mã 2. Điền dữ liệu thật, đổi tên bỏ `.draft`, rồi chạy `validate`. Lệnh không tự gán `media.model3d`; dùng `npm.cmd run auto` hoặc nhập tay.

```powershell
# Cách 1: Truyền trực tiếp văn bản qua cờ --text
npm.cmd run script:ai -- --text "Bán gấp biệt thự mặt phố Tây Hồ 100m2 4 tầng ngõ ô tô tránh view hồ giá 28 tỷ sổ đỏ chính chủ lh 0912345678"

# Cách 2: Đọc từ file tin đăng thô .txt
npm.cmd run script:ai -- --input bai-dang-zalo.txt --output examples/tay-ho-28ty.json --format landscape

# Cách 3: Chạy trực tiếp và dán văn bản qua giao diện dòng lệnh tương tác
npm.cmd run script:ai
```

## Tích hợp mô hình nhà 3D (.GLB / .GLTF)

Hệ thống hỗ trợ nạp mô hình kiến trúc 3D dạng file `.glb` / `.gltf` để thay thế cho khối hộp sơ đồ tham số:
1. Bạn chỉ cần thả các file mô hình 3D vào thư mục `assets/models/` (ví dụ `assets/models/biet-thu.glb`).
2. Khi render hoặc chạy kiểm tra, hệ thống tự động đồng bộ sang `public/models/`.
3. Khai báo trong `media`:
   ```json
   {
     "media": {
       "model3d": "models/biet-thu.glb"
     }
   }
   ```
4. Nếu muốn tự sinh lại mô hình 3D biệt thự mẫu có sẵn:
   ```powershell
   npm.cmd run generate-model
   ```
5. Nếu không khai báo `model3d`, hệ thống sẽ tự động dùng mô hình sơ đồ tham số hóa (procedural fallback).

## Thêm tư liệu thật

Chép file vào `public/media/`, sau đó khai báo đường dẫn tương đối:

```json
{
  "media": {
    "aerialImage": "media/khu-vuc.jpg",
    "propertyImage": "media/mat-tien.jpg",
    "streetVideo": "media/duong-vao.mp4",
    "panorama": "media/phong-khach-360.jpg",
    "model3d": "models/sample-villa.glb",
    "music": "media/nhac-nen.mp3",
    "attribution": "Ảnh và video: chủ sở hữu cung cấp"
  }
}
```

Chỉ thêm trường bạn có. Cảnh tư liệu ưu tiên `panorama` → `streetVideo` → `propertyImage` → mô hình 3D minh họa. Clip gốc cần dài ít nhất 20% tổng thời lượng video; âm thanh clip được tắt để không chồng giọng đọc. Nhạc nền lặp với âm lượng thấp, có fade đầu/cuối. Ảnh chụp từ trên cao được pan/zoom nhưng không tự suy ra ranh đất hay dựng lại địa hình.

Panorama phải là **ảnh equirectangular 2:1 đã được chụp/ghép đúng**. Video đầu ra là góc nhìn camera quay trong ảnh, không phải file video spherical 360 có metadata tương tác. Không có chức năng biến vài ảnh thường thành ảnh 360 chính xác. Chỉ dùng tư liệu được phép sử dụng; tên file có dấu và khoảng trắng được hỗ trợ.

Font tiêu đề Noto Serif được đóng gói local để hiển thị tiếng Việt nhất quán; giấy phép SIL OFL đi kèm trong `public/fonts/OFL.txt`. Âm thanh do bạn tự cung cấp cần phù hợp thời lượng video/cảnh; renderer cắt phần vượt cuối timeline. Giọng Gemini do lệnh `tts` tạo được kiểm tra thời lượng trước khi gắn vào cảnh.

## Giọng đọc thuyết minh (TTS)

Dự án hỗ trợ 3 giải pháp giọng đọc tiếng Việt linh hoạt:

1. **CIT Voice Studio (Khuyên dùng — Chạy Offline trên máy, 48 kHz, Miễn phí):**
   - Ứng dụng đã có sẵn trên máy tại `E:\CIT Voice Studio\CIT-Voice-Studio.exe`.
   - Cung cấp 25 giọng đọc AI chất lượng phòng thu: `Minh Đức` (Nam Bắc tin tức), `Hải Đăng` (Nam Bắc tự nhiên), `Mai Anh` (Nữ Bắc tin tức), `Thùy Dung` (Nữ Nam tin tức), v.v.
   - Chỉ cần mở ứng dụng CIT Voice Studio và chạy:
     ```powershell
     npm.cmd run video -- tts --input examples/ho-tay.json
     # Hoặc đổi giọng:
     npm.cmd run video -- tts --input examples/ho-tay.json --voice "Mai Anh"
     ```

2. **Microsoft Edge TTS (Miễn phí online, không cần API Key):**
   - Dùng khi không mở CIT Voice Studio:
     ```powershell
     npm.cmd run video -- tts --input examples/ho-tay.json --provider edge-tts --voice vi-VN-NamMinhNeural
     ```

3. **Gemini 3.8 Flash TTS (Google Cloud):**
   - Cần cấu hình `GEMINI_API_KEY` trong `.env`. Chạy với cờ `--provider gemini-tts`.

Sau khi chạy lệnh `tts`, hệ thống sẽ xuất file cấu hình mới tại `out/tts-<id>-<job>/input.json` đã gắn kèm 5 file audio cho 5 phân cảnh. Dùng file đó để render video hoàn chỉnh:
```powershell
npm.cmd run video -- render --input "out/tts-<id>-<job>/input.json"
```

## Skill cho agent

Skill gốc: `skills/map-bds-video/SKILL.md`. Bản cài Codex: `C:\Users\os\.codex\skills\map-bds-video\SKILL.md`. Ví dụ yêu cầu: “Dùng map-bds-video tạo video dọc từ file thông tin này, trước tiên xuất bản nháp.”

Skill gọi CLI local; không mở webhook, không đăng video và không tải lên dịch vụ bên ngoài. Có thể đưa skill cùng project cho agent khác có quyền chạy Node.js. Chưa cấu hình hay kết nối Antigravity/Claude Code trên máy này.

## Cấu trúc

```text
examples/               JSON mẫu và batch ngang/dọc
src/schema.ts           Kiểm tra input, sinh JSON Schema
src/timeline.ts         Phân cảnh và phụ đề
src/Video.tsx           Bố cục video, media, âm thanh
src/House.tsx           Mô hình khối nhà tham số + camera deterministic
src/Panorama.tsx        Viewer panorama trong video
scripts/cli.ts          Điểm gọi cho người dùng/agent
scripts/project.ts      Chuẩn bị file, kiểm tra media, worker pool
scripts/render.ts       Bundle, Chromium, poster, MP4, trạng thái
scripts/tts.ts          Gemini TTS tùy chọn
skills/map-bds-video/   Skill nguồn
docs/                   Phạm vi, kiến trúc, đối chiếu đoạn chat
tests/                  Kiểm thử các bất biến của pipeline
public/                 Tư liệu local
out/                    Kết quả, được Git bỏ qua
```

## Thư viện Mô hình 3D (.GLB) tích hợp sẵn

Hệ thống đã tích hợp sẵn **16 mô hình 3D BĐS chất lượng cao** trong thư mục `public/models/` (và `assets/models/`), bạn có thể dùng ngay bằng cách khai báo trường `"media": { "model3d": "models/<tên-file>.glb" }`:

| Loại mô hình | File GLB | Mô tả |
| :--- | :--- | :--- |
| **Biệt thự mái Thái** | `models/biet-thu-mai-thai.glb` | Biệt thự sân vườn mái ngói Thái |
| **Dinh thự có hồ bơi** | `models/biet-thu-sang-trong.glb` | Biệt thự nghỉ dưỡng sang trọng có hồ bơi |
| **Biệt thự hiện đại** | `models/biet-thu-hien-dai.glb` | Biệt thự hiện đại không gian mở |
| **Shophouse kinh doanh** | `models/shophouse.glb` | Nhà phố thương mại Shophouse mặt tiền |
| **Nhà phố 4 tầng** | `models/nha-pho-4-tang.glb` | Nhà phố hiện đại 4 tầng |
| **Nhà phố 3 tầng** | `models/nha-pho-3-tang.glb` | Nhà phố gia đình 3 tầng |
| **Chung cư cao tầng** | `models/chung-cu-cao-tang.glb` | Tòa căn hộ chung cư cao cấp |
| **Khu căn hộ phức hợp** | `models/khu-can-ho.glb` | Khu quần thể căn hộ đô thị |
| **Tòa nhà văn phòng** | `models/toa-nha-van-phong.glb` | Trụ sở / văn phòng kính hiện đại |
| **Landmark 81** | `models/landmark-81.glb` | Tòa tháp biểu tượng Landmark 81 TP.HCM |
| **Bitexco Sài Gòn** | `models/bitexco-saigon.glb` | Tháp búp sen Bitexco Financial Tower |
| **Cầu treo dây võng** | `models/cau-treo-day-vong.glb` | Cầu treo kiến trúc giao thông trọng điểm |
| **Đại lộ giao thông** | `models/duong-cao-toc.glb` | Đại lộ có dải phân cách cây xanh |
| **Trường học** | `models/truong-hoc.glb` | Mô hình trường học liên cấp |
| **Ngân hàng** | `models/ngan-hang.glb` | Trụ sở chi nhánh tài chính / ngân hàng |
| **Icon Vị Trí 3D** | `models/icon-vi-tri.glb` | Pin định vị 3D kim loại phát sáng |

---

## 8 Phong cách Hiệu ứng Chữ & Biển Rao BĐS (`badge.style`)

Khai báo trong file JSON thuộc tính `badge` với các phong cách điện ảnh:

```json
"badge": {
  "text": "BIỆT THỰ VEN HỒ TÂY",
  "price": "28 TỶ VNĐ",
  "status": "SỔ ĐỎ CHÍNH CHỦ",
  "style": "two_legs"
}
```

Các giá trị `style` được hỗ trợ:
1. `two_legs` (Mặc định): **Biển cắm cọc 2 chân** BĐS cắm sâu vào đất, có banner đỏ nổi bật và đung đưa nhẹ theo gió.
2. `signboard`: **Biển kim loại điện ảnh** với đinh tán vàng ở 4 góc và viền nổi phát sáng.
3. `sold_stamp`: **Dấu mộc ĐÃ BÁN / SOLD** dập nổi với hiệu ứng va chạm nảy chấn động (Stamp Slam).
4. `gold24k`: **Chữ Vàng 24K** ánh kim quét sáng đa tầng (Shine sweep).
5. `platinum`: **Bạch kim / Chrome** phản chiếu sắc nét viền nổi.
6. `bronze`: **Đồng cổ hoàng gia** phong cách vintage quý tộc.
7. `emerald`: **Ngọc lục bảo** xanh ngọc sang trọng quyền quý.
8. `neon`: **Neon lộ sáng** viền xanh cyan điện tử nhấp nháy dòng điện.

---

## Tự động lấy Ranh giới Hành chính (`fetch-boundary`)

Lấy đa giác ranh giới hành chính của Phường / Xã / Quận / Huyện / Tỉnh từ OpenStreetMap (dữ liệu local sau `osm-sync`, hoặc Nominatim online) và ghi vào trường `adminBoundary` (`name`, `adminLevel`, `osmId`, `polygon` tối đa 300 đỉnh):

```powershell
# Lấy ranh giới phường và lưu vào file JSON
npm.cmd run video -- fetch-boundary --input examples/ho-tay.json --query "Phường Quảng An, Tây Hồ, Hà Nội" [--source auto|local|online] [--osm-id 12345]
```

- Lệnh **không** đụng `boundaryPolygon`: đó là ranh thửa đất (vẽ kèm cọc mốc ở góc), chỉ nhập từ sổ đỏ / trích lục / đo đạc. Ranh phường không phải ranh lô đất.
- `npm.cmd run auto -- --boundary "..."` cũng ghi vào `adminBoundary`.
- `adminBoundary` hiện mới được lưu và kiểm tra schema, chưa vẽ lên video.
- Ranh OSM có thể chưa cập nhật theo sáp nhập đơn vị hành chính 1/7/2025, cần kiểm tra trước khi dùng.

---

## Tự động tính Tuyến đường kết nối (`fetch-route`)

Tự động tìm kiếm tọa độ điểm đến (qua OSM) và tính toán lộ trình xe chạy thực tế A → B (qua OSRM Engine) kèm khoảng cách (km) và thời gian di chuyển (phút):

```powershell
# Tính lộ trình từ vị trí BĐS đến Sân bay Nội Bài
npm.cmd run video -- fetch-route --input examples/ho-tay.json --to "Sân bay Quốc tế Nội Bài"
```

---

## Nhận diện Thương hiệu & Card Môi giới (`branding`)

Tích hợp tự động logo và slogan thương hiệu:

```json
"branding": {
  "name": "MAP BĐS PREMIER",
  "slogan": "BẤT ĐỘNG SẢN TRIỆU ĐÔ HÀ NỘI"
}
```
- **Cinematic Logo Reveal**: Hiệu ứng mở màn video chuyên nghiệp trong 1.5 giây đầu.
- **Brand Header Bar**: Thanh hiển thị tên thương hiệu & slogan thanh lịch xuyên suốt video.
- **Card Môi giới (Broker Lowerthird)**: Hiển thị chuyên viên phụ trách kèm nút gọi điện thoại hotline nổi bật ở phân cảnh liên hệ.

---

## Flycam AI Drone Tracking Overlay

Khi cung cấp video quay thực địa từ flycam (`streetVideo`), hệ thống tự động gắn lớp phủ **HUD Drone Tracking**:
- Khung tiêu điểm định vị thửa đất nhấp nháy pulsing theo nhịp.
- Radar quét diện tích thực địa và tọa độ GPS chuẩn xác.
