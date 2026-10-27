# Task: Dữ liệu OpenStreetMap Việt Nam chạy local — Giai đoạn 1

Người thực hiện: Gemini. Người kiểm tra lại: Claude (so với bản chụp `out/baseline-2026-10-26/`).
Ngày giao: 26/10/2026.

## 0. Đọc trước khi làm

1. `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/PROJECT.md`, `docs/COMPETITOR-GAP.md`.
2. Code liên quan: `scripts/amenities.ts` (đặc biệt `parseOverpassElements`, `toPropertyAmenity`), `scripts/boundary.ts`, `scripts/cli.ts`, `scripts/project.ts`, `src/schema.ts`, `src/geo.ts`, `src/Video.tsx` (dòng footer có `p.media.attribution`, khoảng dòng 650), `src/Poster.tsx`, `tests/geo.test.ts`.
3. Chạy `npm.cmd run check` trước khi sửa và ghi kết quả vào báo cáo. Hiện tại phải là **11 pass / 0 fail**.

### Quy tắc bắt buộc
- **Không dùng Git**: không `git add`, `commit`, `branch`, `stash`, `checkout`, `reset`. Người dùng đang chạy thử trên máy, chưa commit.
- Windows PowerShell: dùng `npm.cmd` / `npx.cmd`, không dùng `npm`.
- Không sửa file ngoài danh sách ở mục 7, trừ khi ghi rõ lý do trong báo cáo.
- **Không bịa dữ liệu**: không tên tiện ích mặc định, không khoảng cách ước lượng, không fallback "mẫu". Không có dữ liệu thì trả về rỗng hoặc báo lỗi rõ ràng (xem lỗi đã sửa trong `scripts/amenities.ts`).
- Mạng chỉ dùng trong lệnh `osm-sync`. `render`, `scan-amenities --source local` và `fetch-boundary --source local` phải chạy được khi tắt mạng.
- Mọi dependency mới phải ghim **phiên bản chính xác** (không `^`/`~`), cập nhật `package-lock.json`, và **không cần build native** trên Windows (không node-gyp). Không đổi phiên bản Remotion.
- Không đưa file `.pbf` hay dữ liệu đã xử lý vào bundle Remotion hoặc `public/`.

## 1. Mục tiêu

1. Lệnh `osm-sync` tải file OSM Việt Nam của Geofabrik và xử lý sẵn thành các file nhỏ đọc nhanh.
2. `scan-amenities` và `fetch-boundary` đọc dữ liệu local trước, chỉ gọi API công cộng (Overpass/Nominatim) khi chưa có dữ liệu local hoặc khi người dùng yêu cầu.
3. Có dữ liệu **đường và sông/hồ có tên** (dạng đường thẳng gấp khúc, polyline), truy vấn được theo vùng. Dùng sau này cho nhãn tên đường/sông trên bản đồ (P0.3); giai đoạn này chỉ cần truy vấn được và có test.
4. Video và poster ghi nguồn **"© OpenStreetMap contributors"** khi có dùng dữ liệu OSM (giấy phép ODbL bắt buộc).

**Ngoài phạm vi** (không làm, chỉ ghi nhận nếu gặp):
- Chạy máy chủ Overpass/Nominatim/OSRM local hoặc Docker. `fetch-route` giữ nguyên.
- Vẽ nhãn đường/sông lên video.
- Vấn đề `fetch-boundary` ghi ranh hành chính vào `boundaryPolygon`, trong khi trường này đang được vẽ như ranh *thửa đất*. **Giữ nguyên hành vi này**, chỉ thêm nguồn dữ liệu local.

## 2. Thư mục dữ liệu

```
data/osm/
  vietnam-latest.osm.pbf          # file gốc tải về (~332 MB)
  vn/
    meta.json                     # nguồn, thời điểm, md5, số lượng, phiên bản schema
    pois.ndjson                   # tiện ích (mỗi dòng 1 JSON)
    admin.ndjson                  # ranh hành chính
    lines/<latKey>_<lngKey>.ndjson # đường + sông theo ô lưới 0,1°
```

- Thêm `data/osm/` vào `.gitignore`.
- Ghi vào file tạm (`*.part` hoặc thư mục `vn.tmp/`) rồi đổi tên khi xong, để chạy hỏng giữa chừng không để lại dữ liệu dở dang.
- `meta.json` tối thiểu gồm: `{schemaVersion: 1, source: "https://download.geofabrik.de/asia/vietnam-latest.osm.pbf", sourceLastModified, md5, downloadedAt, processedAt, counts: {pois, admin, lines}, license: "ODbL 1.0", attribution: "© OpenStreetMap contributors"}`.

## 3. Lệnh `osm-sync`

```powershell
npm.cmd run video -- osm-sync            # tải (nếu cần) + xử lý
npm.cmd run video -- osm-sync --process-only   # chỉ xử lý lại file .pbf đã có
```

### 3.1 Tải
- URL: `https://download.geofabrik.de/asia/vietnam-latest.osm.pbf` (redirect 307 sang mirror, phải theo redirect). Thử ngày 26/10/2026: `Content-Length: 331590326`.
- Kiểm tra md5 với file `https://download.geofabrik.de/asia/vietnam-latest.osm.pbf.md5`. Nếu không tải được file md5 thì báo lỗi, không bỏ qua bước kiểm tra.
- Bỏ qua bước tải nếu file đã có, md5 khớp, và `Last-Modified` không mới hơn bản đã có.
- Stream xuống đĩa (không đọc cả file vào RAM). In tiến độ theo %.
- Gửi header `User-Agent: MapBDS-OsmSync/1.0`.

### 3.2 Xử lý `.pbf`
Chọn một thư viện đọc PBF thuần JavaScript (không native). Ghi tên, phiên bản và lý do chọn vào báo cáo. **Tách 2 lớp**:
- (a) lớp đọc PBF → luồng entity `{type: 'node'|'way'|'relation', id, tags, lat?, lon?, refs?, members?}`;
- (b) lớp xử lý entity → các file đầu ra, là **hàm thuần** nhận iterable entity. Test viết cho lớp (b) bằng dữ liệu giả lập, **không** cần file `.pbf` thật.

**Giới hạn bộ nhớ**: Việt Nam có hàng chục triệu node. Không dùng `Map`/object JS cho toàn bộ node. Làm nhiều lượt (multi-pass):
1. Lượt 1: duyệt relation + way, chọn đối tượng cần giữ (mục 3.3), thu thập id các way/node cần tọa độ.
2. Lượt 2+: chỉ lấy tọa độ cho các node cần thiết, lưu bằng mảng typed array đã sắp xếp (ví dụ `Float64Array` id + `Float32Array`/`Float64Array` lat/lng, tra bằng tìm kiếm nhị phân) hoặc cách tương đương.
- Mục tiêu: RAM đỉnh **< 4 GB**. Ghi RAM đỉnh và thời gian chạy thật vào báo cáo (`process.memoryUsage().rss` lấy mẫu định kỳ).

### 3.3 Chọn đối tượng

**POI (`pois.ndjson`)**: chỉ giữ đối tượng **có tag `name`** và khớp **chính xác** (không dùng regex) một trong:
- `amenity` ∈ {school, kindergarten, hospital, clinic, marketplace, pharmacy}
- `shop` ∈ {supermarket, convenience, mall}
- `leisure` ∈ {park, playground}
- `natural` = water

Node lấy tọa độ trực tiếp. Way lấy **tâm hình bao (bbox center)** của các node, tương đương `out center` của Overpass. Relation POI: bỏ qua ở giai đoạn này và ghi số lượng đã bỏ qua vào `meta.json`.
Mỗi dòng có **dạng giống phần tử Overpass** để dùng lại `parseOverpassElements`:
```json
{"type":"node","id":123,"lat":21.06,"lon":105.82,"tags":{"name":"Trường A","amenity":"school"}}
{"type":"way","id":456,"center":{"lat":21.07,"lon":105.83},"tags":{"name":"Công viên B","leisure":"park"}}
```
Chỉ giữ các tag: `name`, `name:vi`, `name:en`, `amenity`, `shop`, `leisure`, `natural`.

**Đường và sông (`lines/*.ndjson`)**: way **có `name`** và:
- `highway` ∈ {motorway, trunk, primary, secondary, tertiary, residential, unclassified, living_street}
- `waterway` ∈ {river, canal, stream}

Mỗi dòng: `{"id":789,"kind":"road"|"waterway","class":"primary","name":"Đường Âu Cơ","coords":[[lat,lng],...]}`. Tọa độ làm tròn 6 chữ số thập phân. Một way nằm trên nhiều ô lưới thì ghi vào mọi ô mà bbox của nó chạm tới (chấp nhận trùng lặp; hàm truy vấn phải loại trùng theo `id`). Khóa ô: `Math.floor(lat*10)` và `Math.floor(lng*10)`.

**Ranh hành chính (`admin.ndjson`)**: relation có `boundary=administrative`, `admin_level` ∈ {4, 6, 8} và có `name`.
- Ghép **vòng ngoài** (outer ring) từ các way thành viên có role `outer`: nối đầu–cuối các way, đảo chiều khi cần. Bỏ qua vòng trong (inner).
- Nếu ra nhiều vòng ngoài, giữ vòng có **diện tích lớn nhất** (giống hành vi Nominatim hiện tại) và ghi `"parts": <số vòng>`.
- Không ghép được vòng kín thì bỏ relation đó, đếm vào `meta.json` (`adminSkipped`). **Không** tự đóng vòng bằng đoạn thẳng nối bừa.
- Rút gọn bằng **Douglas–Peucker** còn ≤ 300 đỉnh (giới hạn của schema `boundaryPolygon`). Không lấy mẫu cách đều kiểu `simplifyPolygon` hiện tại.
- Mỗi dòng: `{"id":1,"name":"Phường Quảng An","adminLevel":8,"tags":{"name:vi":...,"name:en":...},"bbox":[w,s,e,n],"ring":[[lat,lng],...]}`.

> ⚠️ Từ 1/7/2025 Việt Nam sáp nhập còn 34 tỉnh/thành và bỏ cấp huyện. Dữ liệu OSM có thể còn ranh cũ (cấp 6) hoặc lẫn cũ và mới. **Không lọc bỏ** cấp 6; xử lý theo mục 4.2.

## 4. Tích hợp vào lệnh hiện có

Thêm cờ `--source auto|local|online` (mặc định `auto`) cho `scan-amenities` và `fetch-boundary`:
- `auto`: có `data/osm/vn/meta.json` hợp lệ thì dùng local, không thì online (hành vi cũ).
- `local`: chưa có dữ liệu local thì **báo lỗi**, hướng dẫn chạy `osm-sync`; không tự chuyển sang online.
- `online`: giữ nguyên code cũ.
In ra nguồn đã dùng và ngày dữ liệu (`sourceLastModified`).

### 4.1 `scan-amenities` local
- Đọc `pois.ndjson`, lọc trong bán kính bằng `distanceMeters` từ `src/geo.ts`, rồi **đưa qua `parseOverpassElements`**. Không viết lại logic chọn lọc.
- Kết quả rỗng: hành vi giống hiện tại (báo lỗi, không ghi file).
- Hàm đọc nên có cache trong tiến trình (để `auto-pipeline` không đọc lại nhiều lần).

### 4.2 `fetch-boundary` local
- So khớp `--query` với `name`/`name:vi`: chuẩn hóa NFC, không phân biệt hoa thường, bỏ khoảng trắng thừa. Cho phép query có phần sau dấu phẩy (ví dụ `"Phường Quảng An, Tây Hồ"`): khớp theo phần đầu, và dùng phần sau để ưu tiên nếu tên cha nằm trong tag hoặc bbox (tự quyết cách làm, ghi vào báo cáo).
- **Nhiều kết quả khớp**: không tự chọn. Báo lỗi kèm danh sách ứng viên (tên, `admin_level`, tâm bbox) và gợi ý thêm cờ `--osm-id <id>` để chọn chính xác. Thêm cờ `--osm-id`.
- Luôn in `admin_level` của ranh đã chọn kèm cảnh báo: "Ranh hành chính từ OSM có thể chưa cập nhật theo sáp nhập 1/7/2025 — kiểm tra trước khi dùng."
- Ghi vào `boundaryPolygon` như hành vi hiện tại (xem mục Ngoài phạm vi).

### 4.3 Truy vấn đường/sông
Export hàm thuần trong module mới (ví dụ `scripts/osm-local.ts`):
```ts
queryLines(bbox: {west: number; south: number; east: number; north: number}, opts?: {kinds?: Array<'road'|'waterway'>}): LineFeature[]
```
Đọc các ô lưới bbox chạm tới, loại trùng theo `id`, giữ way có ít nhất một điểm trong bbox. Thêm lệnh kiểm tra nhanh:
```powershell
npm.cmd run video -- osm-query --lat 21.063 --lng 105.8283 --radius 500 --layer roads|waterways|pois|admin
```
In ra số lượng và 10 tên đầu tiên. Lệnh này chỉ dùng để kiểm tra, không sửa file JSON nào.

## 5. Ghi nguồn OSM trong video và poster

- `src/schema.ts`: thêm `dataSources: z.array(z.enum(['osm'])).max(5).optional()` ở cấp gốc.
- Các lệnh ghi dữ liệu từ OSM vào JSON phải thêm `'osm'` vào `dataSources` (không trùng lặp): `scan-amenities` (cả local lẫn online), `fetch-boundary` (cả local lẫn online), `fetch-route` (OSRM dùng dữ liệu OSM), `auto-pipeline` khi các bước đó chạy.
- Điều kiện hiển thị: `dataSources` có `'osm'` **hoặc** `routes` không rỗng **hoặc** có ít nhất một tiện ích có `lat`/`lng`. Viết thành một hàm thuần dùng chung (ví dụ `usesOsmData(p)` trong `src/`) và có test.
- Hiển thị dòng **"Dữ liệu bản đồ © OpenStreetMap contributors"** ở footer `src/Video.tsx` (cạnh `p.media.attribution`, giữ cỡ chữ đọc được) và ở `src/Poster.tsx`.
- Cập nhật `examples/ho-tay.json`: thêm `"dataSources": ["osm"]` (file này có `routes` từ OSRM). **Không sửa dữ liệu nào khác** trong file.

## 6. Test bắt buộc (thêm vào `tests/`, dữ liệu giả lập, không cần mạng)

1. Chọn POI: có/không `name`, tag khớp chính xác (`driving_school` **không** được nhận là `school`), way → tâm bbox đúng.
2. Đầu ra POI qua `parseOverpassElements` cho kết quả giống đầu vào Overpass tương đương.
3. Ghép vòng ngoài admin: các way nối đầu–cuối có đảo chiều → vòng kín đúng thứ tự; way thiếu đoạn → bị bỏ và tăng `adminSkipped`; multipolygon 2 vòng → giữ vòng lớn hơn.
4. Douglas–Peucker: đầu ra ≤ 300 đỉnh, giữ điểm đầu/cuối, polygon vuông 4 góc không bị mất góc.
5. Lưới đường: way vắt qua 2 ô → `queryLines` trả về 1 lần; bbox không chạm → rỗng.
6. Tra tọa độ node bằng typed array + tìm kiếm nhị phân: id có, id không có, id lớn hơn 2^31.
7. `fetch-boundary` local: query khớp nhiều kết quả → lỗi kèm danh sách; `--osm-id` chọn đúng.
8. `--source local` khi chưa có dữ liệu → lỗi, không gọi mạng (mock hoặc kiểm tra không có `fetch` nào được gọi).
9. `usesOsmData` cho cả 3 điều kiện và trường hợp false; schema chấp nhận `dataSources: ['osm']` và từ chối giá trị lạ.
10. Mọi test cũ vẫn qua.

## 7. File được phép tạo/sửa

- Mới: `scripts/osm-sync.ts`, `scripts/osm-local.ts` (hoặc tách nhỏ hơn trong `scripts/osm/`), `tests/osm.test.ts`, `docs/tasks/osm-vietnam-phase1-REPORT.md`.
- Sửa: `scripts/cli.ts`, `scripts/amenities.ts`, `scripts/boundary.ts`, `scripts/route.ts`, `scripts/auto-pipeline.ts`, `src/schema.ts`, `src/Video.tsx`, `src/Poster.tsx`, `examples/ho-tay.json` (chỉ `dataSources`), `.gitignore`, `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md` (thêm lệnh mới), `docs/COMPETITOR-GAP.md` (đánh dấu tiến độ), `skills/map-bds-video/SKILL.md` (thêm bước `osm-sync`).

## 8. Kiểm chứng trước khi báo hoàn tất

Chạy và dán kết quả (rút gọn) vào báo cáo:
1. `npm.cmd run check` → toàn bộ pass.
2. `npm.cmd run video -- osm-sync` trên file thật: thời gian tải, thời gian xử lý, RAM đỉnh, `counts` trong `meta.json`, dung lượng thư mục `data/osm/vn/`.
3. Chạy lại `osm-sync` lần 2 → bỏ qua tải (md5 khớp).
4. Bản sao `examples/ho-tay.json` trong `out/` (không sửa file gốc):
   - `scan-amenities --source local --radius 1500` → in danh sách. Kiểm tra tay 2–3 tên có thật trên bản đồ OSM (ghi URL `https://www.openstreetmap.org/node/<id>` hoặc `/way/<id>`).
   - `fetch-boundary --source local --query "Quảng An"` → ghi lại kết quả hoặc danh sách ứng viên.
5. `osm-query --lat 21.063 --lng 105.8283 --radius 500 --layer roads` và `--layer waterways`.
6. **Tắt mạng** (hoặc chặn `fetch`) rồi chạy lại bước 4 với `--source local` → vẫn chạy.
7. `npm.cmd run video -- render --input examples/ho-tay.json --draft --seconds 12` → thành công. Xuất 1 khung hình có footer và **xem** dòng ghi nguồn OSM có hiển thị không. Lưu ảnh vào `out/`, ghi đường dẫn vào báo cáo.

## 9. Báo cáo `docs/tasks/osm-vietnam-phase1-REPORT.md`

- Danh sách **đầy đủ** file đã tạo/sửa/xóa (tôi sẽ đối chiếu với `out/baseline-2026-10-26/`).
- Thư viện PBF đã chọn: tên, phiên bản, lý do, các phương án đã loại.
- Kết quả từng bước ở mục 8, kèm số liệu thật. **Không** ghi "đã kiểm tra" nếu chưa chạy.
- Những chỗ làm khác task này và lý do.
- Việc chưa làm được, lỗi còn biết, và rủi ro (đặc biệt chất lượng ranh hành chính sau sáp nhập 2025).

## 10. Tiêu chí kiểm tra lại (Claude sẽ dùng)

- [ ] Không có thay đổi ngoài mục 7; không có thao tác Git.
- [ ] `npm.cmd run check` pass; test mới đúng như mục 6 và kiểm được điều cần kiểm (không phải test rỗng).
- [ ] Dependency ghim chính xác, không native, lockfile cập nhật, Remotion không đổi.
- [ ] Bộ nhớ: không có `Map`/object cho toàn bộ node; RAM đỉnh có số liệu thật.
- [ ] Không có dữ liệu bịa hay fallback "mẫu"; lỗi được báo rõ ràng.
- [ ] `--source local` không gọi mạng; `online` giữ nguyên hành vi cũ.
- [ ] POI local đi qua `parseOverpassElements`; khớp tag chính xác.
- [ ] Ghép vòng admin không tự đóng vòng bừa; nhiều kết quả khớp thì không tự chọn; có cảnh báo sáp nhập 2025.
- [ ] Ghi nguồn OSM hiện trên video và poster; `examples/ho-tay.json` chỉ thêm `dataSources`.
- [ ] Ghi file nguyên tử; `data/osm/` bị Git bỏ qua; không có dữ liệu OSM trong `public/`.
- [ ] Báo cáo trung thực, có số liệu.
