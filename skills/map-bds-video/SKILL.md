---
name: map-bds-video
description: Tự động hóa toàn diện quy trình biên tập và kết xuất video marketing bất động sản điện ảnh chất lượng cao (Map BĐS) từ bài đăng tin thô của môi giới hoặc tệp JSON. Tự động định vị GPS, tải ảnh vệ tinh độ nét cao, truy vấn ranh giới hành chính OSM, tính toán lộ trình OSRM, quét tiện ích radar, ghép mô hình 3D (.glb) phù hợp từ kho 16 models, áp dụng 8 hiệu ứng chữ & biển rao BĐS điện ảnh, hòa âm 132 SFX, và render video Remotion.
---

# Quy Trình Tự Động Biên Tập Video Bất Động Sản Điện Ảnh (Map BĐS)

Thư mục dự án: `E:\Ai-auto-gen-video-BDS`.
Công cụ chạy hoàn toàn **local trên máy**, điều khiển qua dòng lệnh CLI, không cần phụ thuộc cloud hay backend web.

---

## 🚀 QUY TRÌNH 6 BƯỚC TỰ ĐỘNG HÓA TỪ A ĐẾN Z

### BƯỚC 1: TRÍCH XUẤT THÔNG TIN BĐS (ZERO-API PARSING)
Khi người dùng đưa vào một đoạn tin đăng bán nhà/đất thô (từ Zalo, Facebook, tin nhắn môi giới), Agent tự động phân tích và tạo file JSON chuẩn theo mẫu sau (lưu tại `examples/<slug-bds>.json`):

```json
{
  "id": "biet-thu-tay-ho-28ty",
  "title": "Biệt Thự Sân Vườn Quảng An · Tây Hồ",
  "address": "Phường Quảng An, Quận Tây Hồ, Hà Nội",
  "gps": { "lat": 21.0625, "lng": 105.8153 },
  "specs": {
    "areaM2": 100,
    "widthM": 5.0,
    "lengthM": 20.0,
    "stories": 3
  },
  "branding": {
    "name": "BẤT ĐỘNG SẢN TRIỆU ĐÔ",
    "slogan": "AN CƯ THỊNH VƯỢNG · ĐẦU TƯ SINH LỜI"
  },
  "badge": {
    "text": "BIỆT THỰ VEN HỒ TÂY",
    "price": "28 TỶ VNĐ",
    "status": "SỔ ĐỎ CHÍNH CHỦ",
    "style": "two_legs"
  },
  "contact": {
    "name": "Chuyên Viên BĐS Cao Cấp",
    "phone": "0988.123.456",
    "cta": "Liên hệ ngay để xem thực địa & nhận trọn bộ hồ sơ pháp lý"
  },
  "video": {
    "format": "landscape",
    "durationSeconds": 60,
    "fps": 24
  },
  "media": {
    "model3d": "models/biet-thu-mai-thai.glb"
  },
  "amenities": []
}
```

---

### BƯỚC 2: TỰ ĐỘNG LẤY TƯ LIỆU BẢN ĐỒ & RANH ĐẤT
Sử dụng các lệnh CLI local đã tích hợp sẵn:

0. **Đồng bộ dữ liệu OpenStreetMap Việt Nam local (khuyến nghị chạy 1 lần để dùng offline tốc độ cao)**:
   ```powershell
   npm.cmd run video -- osm-sync
   ```
   Tải trọn bộ dữ liệu OSM Việt Nam từ Geofabrik và xử lý thành database local (`data/osm/vn/`), giúp quét tiện ích và ranh giới tức thì mà không cần mạng Internet.

1. **Lấy ảnh vệ tinh độ phân giải cao**:
   Tự động tải tile vệ tinh Mapbox độ nét cao bám sát tọa độ GPS vào `public/media/`:
   ```powershell
   npm.cmd run video -- fetch-map --input examples/<slug-bds>.json
   ```

2. **Lấy ranh giới hành chính tự động (OpenStreetMap Local / Nominatim)**:
   ```powershell
   npm.cmd run video -- fetch-boundary --input examples/<slug-bds>.json --query "Phường Quảng An, Tây Hồ, Hà Nội" [--source auto|local|online] [--osm-id 12345]
   ```

3. **Tính lộ trình xe chạy kết nối (OSRM Engine)**:
   ```powershell
   npm.cmd run video -- fetch-route --input examples/<slug-bds>.json --to "Sân bay Quốc tế Nội Bài"
   ```

4. **Quét radar tiện ích thực tế lân cận (OSM Local Radar / Overpass)**:
   ```powershell
   npm.cmd run video -- scan-amenities --input examples/<slug-bds>.json --radius 2000 [--source auto|local|online]
   ```

*(Hoặc dùng lệnh all-in-one: `npm.cmd run auto -- --input examples/<slug-bds>.json --boundary "..." --to "..." --scan`)*

---

### BƯỚC 3: GHÉP MÔ HÌNH 3D PHÙ HỢP TỪ KHO 16 MODELS
Hệ thống đã tích hợp sẵn 16 mô hình 3D trong `public/models/`. Hãy áp dụng quy tắc ghép thông minh:

| Phân Loại BĐS | Mô hình 3D (`media.model3d`) |
| :--- | :--- |
| Biệt thự sân vườn / ven hồ / mái ngói | `models/biet-thu-mai-thai.glb` |
| Dinh thự nghỉ dưỡng / có hồ bơi | `models/biet-thu-sang-trong.glb` |
| Biệt thự hiện đại / compound cao cấp | `models/biet-thu-hien-dai.glb` |
| Shophouse kinh doanh / nhà mặt phố | `models/shophouse.glb` |
| Nhà phố hiện đại 4 tầng | `models/nha-pho-4-tang.glb` |
| Nhà phố gia đình 3 tầng | `models/nha-pho-3-tang.glb` |
| Căn hộ chung cư cao tầng | `models/chung-cu-cao-tang.glb` |
| Quần thể căn hộ đô thị | `models/khu-can-ho.glb` |
| Tòa nhà văn phòng / thương mại | `models/toa-nha-van-phong.glb` |
| Landmark Sài Gòn | `models/landmark-81.glb` |
| Biểu tượng Bitexco TP.HCM | `models/bitexco-saigon.glb` |
| Cầu biểu tượng kiến trúc | `models/cau-treo-day-vong.glb` |
| Đại lộ giao thông | `models/duong-cao-toc.glb` |
| Trường học liên cấp | `models/truong-hoc.glb` |
| Trụ sở ngân hàng | `models/ngan-hang.glb` |
| Pin vị trí kim loại 3D | `models/icon-vi-tri.glb` |

---

### BƯỚC 4: THIẾT KẾ HIỆU ỨNG CHỮ & BIỂN HIỆU (`badge.style`)
Chọn 1 trong 8 phong cách hiệu ứng điện ảnh:

1. **`two_legs`**: Biển cắm cọc 2 chân thép/gỗ cắm sâu xuống đất, dải băng đỏ nổi bật, đung đưa theo gió. *(Tối ưu cho đất nền, nhà phố, thổ cư)*.
2. **`signboard`**: Biển kim loại điện ảnh có 4 đinh tán mạ vàng 4 góc và viền nổi phát sáng. *(Tối ưu cho BĐS phân khu, dự án)*.
3. **`sold_stamp`**: Dấu mộc đỏ **ĐÃ BÁN / SOLD** dập chấn động (Stamp slam animation). *(Tối ưu khi tạo video chúc mừng chốt cọc)*.
4. **`gold24k`**: Chữ Vàng 24K ánh kim quét sáng (Shine sweep) và đổ bóng 3D đa tầng. *(Tối ưu cho biệt thự triệu đô, BĐS cao cấp)*.
5. **`platinum`**: Bạch kim / Chrome sáng bóng phản chiếu ánh bạc.
6. **`bronze`**: Đồng cổ vintage quý tộc hoàng gia.
7. **`emerald`**: Ngọc lục bảo xanh ngọc quyền quý.
8. **`neon`**: Chữ neon xanh điện tử phát sáng nhấp nháy dòng điện.

---

### BƯỚC 5: HÒA ÂM SFX & THUYẾT MINH TIẾNG VIỆT
1. **Thư viện 132 SFX**: Tọa lạc tại `public/audio/sfx/`. Dùng âm thanh `09_Impacts_and_Hits` khi rơi biển/dập dấu, `12_Whooshes_and_Dives` khi chuyển camera, `11_Metal_and_Bells` khi lướt chữ vàng.
2. **Thuyết minh Tiếng Việt**:
   - Sử dụng **CIT Voice Studio** (Offline 48kHz chất lượng phòng thu, giọng Minh Đức/Hải Đăng/Mai Anh/Thùy Dung):
     ```powershell
     npm.cmd run video -- tts --input examples/<slug-bds>.json --voice "Minh Đức"
     ```
   - Hoặc dùng **Edge TTS** (Miễn phí online, không cần API Key):
     ```powershell
     npm.cmd run video -- tts --input examples/<slug-bds>.json --provider edge-tts --voice vi-VN-NamMinhNeural
     ```

---

### BƯỚC 6: XUẤT VIDEO & KIỂM TRA ĐẦU RA

1. **Kiểm tra cú pháp & tính hợp lệ**:
   ```powershell
   npm.cmd run check
   ```

2. **Render bản nháp siêu tốc (12 giây, 960x540)**:
   ```powershell
   npm.cmd run video -- render --input examples/<slug-bds>.json --draft --seconds 12
   ```

3. **Render bản hoàn chỉnh Full HD 1080p**:
   - Video Ngang (16:9 - YouTube, Website):
     ```powershell
     npm.cmd run video -- render --input examples/<slug-bds>.json
     ```
   - Video Dọc (9:16 - TikTok, Shorts, Reels):
     ```powershell
     npm.cmd run video -- render --input examples/<slug-bds>.json --format portrait
     ```

4. **Kiểm tra kết quả**:
   - File video nằm trong: `out/<id>-<format>-<job>/video.mp4`
   - File poster đại diện: `out/<id>-<format>-<job>/poster.png`
   - Phụ đề chuẩn SRT: `out/<id>-<format>-<job>/captions.srt`

---

## ⚠️ NGUYÊN TẮC BẮT BUỘC (AGENTS.MD CONSTRAINTS)
- Luôn sử dụng lệnh **`npm.cmd`** trên Windows PowerShell để tránh npm.ps1 làm mất cờ CLI.
- Không sửa phiên bản Remotion khác `4.0.536`.
- Không bịa đặt kích thước ranh giới sai lệch; luôn lấy số liệu thực từ người dùng hoặc hệ thống GIS.
- Tuyệt đối không lưu secret key hoặc video xuất ra vào git.
