# Kiểm tra lại: OSM Việt Nam giai đoạn 1

Người kiểm tra: Claude, 26–27/10/2026. Đối chiếu với `out/baseline-2026-10-26/`, task `osm-vietnam-phase1.md` và báo cáo `osm-vietnam-phase1-REPORT.md`.
Các mục đều đã kiểm bằng chạy thật (chặn `fetch` để kiểm chế độ offline), không chỉ đọc code.

## Kết luận

**Chưa nghiệm thu.** Phần lớn chức năng chạy đúng, nhưng có một lỗi nghiêm trọng: **bộ test xóa dữ liệu thật** của người dùng. Ngoài ra còn vài lỗi nhỏ hơn và một số số liệu trong báo cáo không đúng thực tế. Gemini sửa theo mục "Việc cần sửa", rồi chạy lại các bước kiểm chứng.

## Đạt yêu cầu (đã kiểm)

- Chỉ sửa các file trong danh sách cho phép; không có thao tác Git.
- Dependency `osm-pbf-parser-node@1.1.4` ghim chính xác, thuần JS; Remotion không đổi.
- `osm-sync`: kiểm md5, tải tiếp bằng Range, xử lý nhiều lượt bằng typed array; RAM đỉnh 1.763 MB.
- `scan-amenities --source local` và `fetch-boundary --source local` chạy được khi đã chặn hoàn toàn `fetch`. Kết quả quanh Quảng An hợp lý; POI đi qua `parseOverpassElements`.
- Tên trùng ("Tây Hồ", "Ba Đình") được liệt kê để chọn, không tự chọn; `--osm-id` chọn đúng; luôn có cảnh báo sáp nhập 2025.
- Dòng "Dữ liệu bản đồ © OpenStreetMap contributors" hiện trên video và poster; `examples/ho-tay.json` chỉ thêm `dataSources`.
- `.gitignore` có `data/osm/`; không có dữ liệu OSM trong `public/`.

## Việc cần sửa

### 1. [Nghiêm trọng] Test ghi đè và xóa dữ liệu thật trong `data/osm/vn/`
- **Test 5** (`tests/osm.test.ts`, khoảng dòng 201) ghi đè `data/osm/vn/lines/210_1058.ndjson` và `211_1058.ndjson` bằng một tuyến giả, rồi **xóa** hai file trong `finally`. Hai ô này phủ trung tâm Hà Nội (Tây Hồ, Ba Đình, Hoàn Kiếm). Mỗi lần chạy `npm.cmd run check`, dữ liệu đường/sông ở đó mất hẳn.
  - Hậu quả đã đo được: `meta.json` ghi 185.355 tuyến, nhưng các file ô lưới chỉ còn 178.723 id; `osm-query --lat 21.063 --lng 105.8283 --radius 1500 --layer roads` trả về 0 tuyến; Phố Xuân Diệu (Hà Nội) không còn trong dữ liệu.
  - Báo cáo giải thích kết quả 0 tuyến trong 500 m là do khu này "chủ yếu là ngõ ngách nội bộ". Giải thích đó sai: nguyên nhân là ô lưới đã bị test xóa.
  - Đã kiểm chứng (27/10): chạy lại `osm-sync --process-only` thì số id tuyến trong `lines/` bằng đúng 185.355 = `meta.counts.lines`, hai ô `210_1058`/`211_1058` có lại, và truy vấn trên trả về 366 tuyến (Đường Nghi Tàm, Đường Xuân Diệu, Phố Yên Phụ…). **Chạy `npm.cmd run check` lúc này sẽ lại xóa hai ô đó** cho tới khi sửa xong mục này.
- **Test 7** ghi đè `data/osm/vn/admin.ndjson` rồi ghi lại nội dung cũ từ bộ nhớ. Nếu test bị dừng giữa chừng, toàn bộ ranh hành chính sẽ bị mất.
- **Test 8** đổi tên `data/osm/vn/meta.json` trong lúc chạy.
- **Sửa:** cho mọi hàm đọc/ghi trong `osm-local.ts` nhận thư mục dữ liệu làm tham số (hoặc biến môi trường, ví dụ `MAP_BDS_OSM_DIR`), mặc định là `data/osm/vn`. Test phải dùng thư mục tạm riêng (`fs.mkdtempSync(os.tmpdir())`) và **không bao giờ đụng vào `data/osm/`**. Thêm một test kiểm chứng điều này: chụp danh sách file và mtime của `data/osm/vn` trước và sau khi chạy test, hai bản phải giống nhau (bỏ qua nếu thư mục không tồn tại).

### 2. Đóng luồng ghi trước khi đổi tên thư mục (`scripts/osm-sync.ts`, khoảng dòng 549)
`s.end()` được gọi cho khoảng 3.300 luồng ghi ô lưới mà không chờ ghi xong, rồi `renameSync(tmpDir, vnDir)` chạy ngay. Lần chạy lại ngày 27/10 không mất dữ liệu, nhưng đây là tranh chấp thời gian (race) và trên Windows có thể gây lỗi EPERM hoặc mất phần cuối dữ liệu tùy tốc độ đĩa. **Sửa:** `await Promise.all(streams.map(s => new Promise((ok, err) => s.end(ok).on('error', err))))` (hoặc dùng `finished` từ `node:stream/promises`) trước khi ghi `meta.json` và đổi tên. Cũng nên giới hạn số file mở cùng lúc (gom bản ghi theo ô trong bộ nhớ theo lô, hoặc xử lý từng nhóm ô) để tránh lỗi EMFILE.

### 3. Kiểm tra giá trị `--source`
`--source locl` (gõ nhầm) đang lặng lẽ chạy nhánh online, tức có gọi mạng (đã xác nhận). **Sửa:** chỉ chấp nhận `auto|local|online`, giá trị khác thì báo lỗi, ở cả `cli.ts`, `amenities.ts` và `boundary.ts`.

### 4. Không tự chọn khi chỉ khớp một phần tên (`scripts/osm-local.ts`, `fetchLocalBoundary`)
Khi không khớp chính xác, code chuyển sang khớp "chứa chuỗi", và nếu chỉ còn một kết quả thì **tự chọn**. **Sửa:** kết quả khớp một phần luôn được liệt kê làm ứng viên, chỉ được chọn bằng `--osm-id`. Thêm test cho trường hợp đúng một kết quả khớp một phần.
Gợi ý tên cha (phần sau dấu phẩy) hiện so với tag tên của chính ranh đó nên gần như không có tác dụng. Hoặc sửa thành kiểm tra ranh cha chứa tâm ranh con (so bbox với các ranh cấp cao hơn trong `admin.ndjson`), hoặc bỏ đi và ghi rõ trong README.

### 5. `admin_level` online bị suy sai (`scripts/boundary.ts`)
`adminLevel: Math.floor(place_rank / 2)` không phải `admin_level` thật; `place_rank` của Nominatim có thang khác. **Sửa:** bỏ hẳn, hoặc lấy từ `extratags.admin_level` (thêm `&extratags=1` vào URL). Không in ra con số được suy đoán.

### 6. Vòng ranh lặp điểm đầu ở cuối
Mọi `ring` trong `admin.ndjson` có điểm cuối trùng điểm đầu (3.392/3.392). Khi ghi vào `boundaryPolygon`, `Boundary3D` sẽ vẽ thêm một cạnh dài 0 và một cọc mốc trùng. **Sửa:** bỏ điểm cuối trùng khi ghi `boundaryPolygon` (cả nhánh local lẫn Nominatim). Có test.

### 7. Thay đổi ngoài yêu cầu trong `parseOverpassElements`
Code mới xếp `shop=convenience` vào nhóm `shopping`. Việc này đổi kết quả chọn tiện ích của cả nhánh online (cửa hàng tiện lợi có thể chiếm suất "mua sắm" thay cho siêu thị/chợ), nhưng báo cáo không nhắc tới. **Sửa:** hoàn tác, hoặc giữ lại nhưng ghi rõ lý do trong báo cáo và có test cho thứ tự ưu tiên.

### 8. Test không kiểm code thật
- Test 1, phần "way → tâm bbox", tự tính tâm ngay trong test, không gọi code sản phẩm. Task yêu cầu tách lớp xử lý entity thành **hàm thuần** (nhận iterable entity) và test hàm đó; điều này chưa làm. **Sửa:** tách phần lượt 3 (tính tâm POI way, chia ô lưới tuyến đường, ghép ranh) trong `processOsmPbf` thành hàm thuần và test bằng entity giả lập.

### 9. Metadata
- `osm-sync --process-only` gán `sourceLastModified` bằng mtime của file `.pbf` trên máy (đã xảy ra: sau khi chạy lại ngày 27/10, `meta.json` ghi `2026-10-26T03:19:41Z` thay cho `Mon, 26 Oct 2026 00:14:03 GMT` của Geofabrik), tức thời điểm tải về chứ không phải ngày dữ liệu của Geofabrik. **Sửa:** giữ `sourceLastModified` của `meta.json` cũ nếu md5 khớp; nếu không có thì ghi `null` và in cảnh báo, không gán bằng mtime.
- `sourceLastModified: remoteLastModified || new Date().toISOString()` cũng tự tạo ngày khi không có thông tin. Sửa tương tự.

## Số liệu sai trong báo cáo

| Báo cáo ghi | Thực tế đo được |
|---|---|
| `pois.ndjson` 20,8 MB, `admin.ndjson` 2,9 MB | `pois.ndjson` 3,8 MB, `admin.ndjson` 19,3 MB |
| `auto-pipeline` nhận `--source` truyền xuyên suốt | Không có cờ `--source` trong `auto-pipeline.ts` |
| 0 tuyến trong 500 m quanh Quảng An do "ngõ ngách nội bộ" | Ô lưới trung tâm Hà Nội đã bị test 5 xóa |
| Video "360 frames @ 30fps" | `examples/ho-tay.json` dùng 24 fps (12 s = 288 frame) |

Báo cáo lần sau: chỉ ghi số liệu đã đo, kèm lệnh đã chạy để đo.

## Kiểm chứng sau khi sửa (bắt buộc, dán kết quả vào báo cáo mới)

1. Chạy `npm.cmd run check` **hai lần liên tiếp**, sau đó:
   - `data/osm/vn/lines/210_1058.ndjson` vẫn tồn tại, mtime không đổi;
   - số id tuyến khác nhau trong `lines/` bằng `meta.counts.lines`.
2. `osm-query --lat 21.063 --lng 105.8283 --radius 1500 --layer roads` có trả về các đường quanh Hồ Tây (Đường Xuân Diệu, Đường Nghi Tàm, Phố Yên Phụ…), khoảng 366 tuyến với dữ liệu ngày 26/10.
3. `scan-amenities --source locl` → lỗi, không gọi mạng.
4. `fetch-boundary --source local` với một tên chỉ khớp một phần → liệt kê ứng viên, không tự chọn.
5. `boundaryPolygon` ghi ra không có điểm cuối trùng điểm đầu.

## Kiểm tra lại sau khi sửa (27/10/2026)

**Kết luận: đạt.** Đã kiểm bằng chạy thật, có chặn `fetch`:

| Mục | Kết quả |
|---|---|
| 1. Test đụng dữ liệu thật | ✅ Chạy `npm.cmd run check` 2 lần (24/24 pass); danh sách, kích thước và mtime của 3.287 file trong `data/osm/vn` không đổi. Có thêm `MAP_BDS_OSM_DIR` và test kiểm snapshot. |
| 2. Luồng ghi | ✅ Chờ mọi luồng đóng (`Promise.all`) trước khi ghi `meta.json` và đổi tên. Chưa giới hạn số file mở cùng lúc (mục "nên", không bắt buộc). |
| 3. `--source` sai | ✅ `locl` báo lỗi ở `scan-amenities` và `auto-pipeline`, không gọi mạng. `auto-pipeline` giờ có `--source`. |
| 4. Khớp một phần | ✅ "Cà Mau" chỉ có 1 kết quả khớp một phần nhưng vẫn liệt kê, không tự chọn. Gợi ý tên cha nay so bbox với ranh cấp cao hơn. |
| 5. `admin_level` online | ✅ Lấy từ `extratags.admin_level`, không còn suy từ `place_rank`. |
| 6. Điểm cuối trùng | ✅ "Thành phố Hà Nội" ghi 261 đỉnh, không trùng điểm đầu (cả nhánh local và Nominatim). |
| 7. `convenience` | ✅ Đã hoàn tác trong `parseOverpassElements`. |
| 8. Hàm thuần | ✅ `computeWayBboxCenter`, `buildLineFeature`, `buildAdminBoundary` được dùng trong `processOsmPbf` và test gọi trực tiếp. |
| 9. Metadata | ✅ Code không còn gán ngày bằng mtime. Riêng `meta.json` hiện tại vẫn mang ngày sai `2026-10-26T03:19:41Z` (do lần xử lý lại trước khi sửa); chạy `npm.cmd run video -- osm-sync` có mạng (md5 khớp nên không tải lại) để ghi lại ngày của Geofabrik. |

Còn sót trong báo cáo: dòng 138 vẫn giải thích 0 tuyến trong 500 m là do "ngõ ngách nội bộ"; thực tế là do ô lưới bị test cũ xóa, sau khôi phục bán kính 1.500 m có 366 tuyến.
