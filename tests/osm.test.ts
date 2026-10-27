import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync, mkdtempSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sample from '../examples/ho-tay.json';
import {propertySchema, type Property} from '../src/schema';
import {usesOsmData} from '../src/osm';
import {
  isTargetPoi,
  isTargetLine,
  isAdminRelation,
  pickPoiTags,
  computeWayBboxCenter,
  buildLineFeature,
  buildAdminBoundary,
} from '../scripts/osm-sync';
import {
  findNodeCoord,
  simplifyDouglasPeucker,
  stitchOuterRings,
  queryLines,
  fetchLocalBoundary,
  gridKey,
  getGridKeysForBbox,
} from '../scripts/osm-local';
import {parseOverpassElements, updatePropertyAmenities} from '../scripts/amenities';
import {updatePropertyBoundary, validateOsmSource} from '../scripts/boundary';
import {fromRoot} from '../scripts/project';

// Chụp snapshot trạng thái của data/osm/vn trước khi chạy bất kỳ test nào để bảo đảm không bị xóa/ghi đè
const vnDir = fromRoot('data/osm/vn');
function getVnSnapshot(): Map<string, number> | null {
  if (!existsSync(vnDir)) return null;
  const snap = new Map<string, number>();
  const scan = (dir: string, rel = '') => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      const r = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        scan(full, r);
      } else {
        snap.set(r, statSync(full).mtimeMs);
      }
    }
  };
  scan(vnDir);
  return snap;
}
const initialVnSnapshot = getVnSnapshot();

// ============================================================================
// TEST 1: Chọn POI: có/không name, tag khớp chính xác, way -> tâm bbox đúng (hàm thuần)
// ============================================================================
test('1. POI selection: có/không name, tag khớp chính xác (driving_school bị loại), way -> tâm bbox đúng qua hàm thuần', () => {
  // Có name & tag chuẩn
  assert.equal(isTargetPoi({name: 'Trường Mầm Non A', amenity: 'kindergarten'}), true);
  assert.equal(isTargetPoi({name: 'Bệnh viện B', amenity: 'hospital'}), true);
  assert.equal(isTargetPoi({name: 'Siêu thị C', shop: 'supermarket'}), true);
  assert.equal(isTargetPoi({name: 'Công viên D', leisure: 'park'}), true);
  assert.equal(isTargetPoi({name: 'Hồ Tây', natural: 'water'}), true);

  // Khớp chính xác: driving_school không được nhận là school
  assert.equal(isTargetPoi({name: 'Trung tâm đào tạo lái xe', amenity: 'driving_school'}), false);
  assert.equal(isTargetPoi({name: 'Cửa hàng quần áo', shop: 'clothes'}), false);

  // Không có name -> bị loại
  assert.equal(isTargetPoi({amenity: 'school'}), false);
  assert.equal(isTargetPoi({name: '', amenity: 'school'}), false);

  // pickPoiTags chỉ giữ các tag cho phép
  const tags = {
    name: 'Trường A',
    'name:vi': 'Trường A',
    amenity: 'school',
    phone: '0123456789',
    opening_hours: '24/7',
    wheelchair: 'yes',
  };
  const picked = pickPoiTags(tags);
  assert.deepEqual(picked, {name: 'Trường A', 'name:vi': 'Trường A', amenity: 'school'});
  assert.equal((picked as any).phone, undefined);

  // Gọi trực tiếp hàm thuần sản phẩm: computeWayBboxCenter
  const mockNodes = new Map<number, {lat: number; lng: number}>([
    [1, {lat: 21.05, lng: 105.80}],
    [2, {lat: 21.07, lng: 105.80}],
    [3, {lat: 21.07, lng: 105.84}],
    [4, {lat: 21.05, lng: 105.84}],
  ]);
  const center = computeWayBboxCenter([1, 2, 3, 4], (id) => mockNodes.get(id) || null);
  assert.deepEqual(center, {lat: 21.06, lon: 105.82});

  // Gọi trực tiếp hàm thuần sản phẩm: buildLineFeature
  const lineResult = buildLineFeature(
    {id: 501, kind: 'road', class: 'primary', name: 'Đường Test', refs: [1, 2]},
    (id) => mockNodes.get(id) || null
  );
  assert.ok(lineResult !== null);
  assert.equal(lineResult!.feature.name, 'Đường Test');
  assert.deepEqual(lineResult!.gridKeys, ['210_1058']);

  // Gọi trực tiếp hàm thuần sản phẩm: buildAdminBoundary
  const mockAdminWays = new Map<number, number[]>([
    [10, [1, 2, 3]],
    [20, [3, 4, 1]],
  ]);
  const adminResult = buildAdminBoundary(
    {id: 888, name: 'Phường Test', adminLevel: 8, tags: {name: 'Phường Test'}, outerWayIds: [10, 20]},
    mockAdminWays,
    (id) => mockNodes.get(id) || null
  );
  assert.ok(adminResult !== null);
  assert.equal(adminResult!.id, 888);
  assert.equal(adminResult!.name, 'Phường Test');
});

// ============================================================================
// TEST 2: Đầu ra POI local qua parseOverpassElements
// ============================================================================
test('2. Đầu ra POI local qua parseOverpassElements cho kết quả giống đầu vào Overpass tương đương', () => {
  const plot = {lat: 21.063, lng: 105.8283};
  const localPoiElements = [
    {type: 'node', id: 101, lat: 21.064, lon: 105.829, tags: {name: 'Trường THPT Chu Văn An', amenity: 'school'}},
    {type: 'way', id: 202, center: {lat: 21.066, lon: 105.830}, tags: {name: 'Công viên Bách Thảo', leisure: 'park'}},
    {type: 'node', id: 303, lat: 21.070, lon: 105.835, tags: {name: 'Bệnh viện Thu Cúc', amenity: 'hospital'}},
    {type: 'node', id: 404, lat: 21.065, lon: 105.825, tags: {name: 'WinMart+', shop: 'supermarket'}},
  ];

  const scanned = parseOverpassElements(localPoiElements, plot.lat, plot.lng);
  assert.equal(scanned.length, 4);

  const categories = scanned.map(s => s.category);
  assert.ok(categories.includes('education'));
  assert.ok(categories.includes('leisure'));
  assert.ok(categories.includes('health'));
  assert.ok(categories.includes('shopping'));

  // Đảm bảo có lat, lng, distanceM hợp lệ
  for (const s of scanned) {
    assert.ok(typeof s.lat === 'number' && s.lat > 0);
    assert.ok(typeof s.lng === 'number' && s.lng > 0);
    assert.ok(typeof s.distanceM === 'number' && s.distanceM > 0);
  }
});

// ============================================================================
// TEST 3: Ghép vòng ngoài admin: đảo chiều, thiếu đoạn, multipolygon
// ============================================================================
test('3. Ghép vòng ngoài admin: đảo chiều nối kín, thiếu đoạn bị bỏ, multipolygon giữ vòng lớn hơn', () => {
  // Trường hợp 1: 3 way tạo thành tam giác kín, trong đó way2 bị ngược chiều
  // Way 1: A -> B
  // Way 2 (ngược): C -> B (cần đảo thành B -> C)
  // Way 3: C -> A
  const way1: Array<[number, number]> = [[21.0, 105.0], [21.0, 105.5]];
  const way2: Array<[number, number]> = [[21.5, 105.2], [21.0, 105.5]]; // ngược
  const way3: Array<[number, number]> = [[21.5, 105.2], [21.0, 105.0]];

  const res1 = stitchOuterRings([way1, way2, way3]);
  assert.equal(res1.parts, 1);
  assert.ok(res1.bestRing !== null);
  assert.equal(res1.bestRing!.length, 4);
  assert.deepEqual(res1.bestRing![0], [21.0, 105.0]);
  assert.deepEqual(res1.bestRing![res1.bestRing!.length - 1], [21.0, 105.0]); // kín vòng

  // Trường hợp 2: Thiếu 1 đoạn không thể khép kín -> bestRing là null
  const wayBroken1: Array<[number, number]> = [[21.0, 105.0], [21.0, 105.5]];
  const wayBroken2: Array<[number, number]> = [[21.1, 105.5], [21.5, 105.2]]; // hở đầu
  const res2 = stitchOuterRings([wayBroken1, wayBroken2]);
  assert.equal(res2.bestRing, null);
  assert.equal(res2.parts, 0);

  // Trường hợp 3: Multipolygon gồm 2 vòng khép kín độc lập -> giữ vòng có diện tích lớn hơn
  // Vòng nhỏ: diện tích 0.1 x 0.1
  const smallRingWays: Array<Array<[number, number]>> = [
    [[21.0, 105.0], [21.0, 105.1]],
    [[21.0, 105.1], [21.1, 105.1]],
    [[21.1, 105.1], [21.1, 105.0]],
    [[21.1, 105.0], [21.0, 105.0]],
  ];
  // Vòng lớn: diện tích 0.5 x 0.5
  const largeRingWays: Array<Array<[number, number]>> = [
    [[22.0, 106.0], [22.0, 106.5]],
    [[22.0, 106.5], [22.5, 106.5]],
    [[22.5, 106.5], [22.5, 106.0]],
    [[22.5, 106.0], [22.0, 106.0]],
  ];
  const res3 = stitchOuterRings([...smallRingWays, ...largeRingWays]);
  assert.equal(res3.parts, 2);
  assert.ok(res3.bestRing !== null);
  // bestRing phải là vòng lớn (tọa độ khoảng 22.x, 106.x)
  assert.equal(res3.bestRing![0][0], 22.0);
  assert.equal(res3.bestRing![0][1], 106.0);
});

// ============================================================================
// TEST 4: Douglas–Peucker: <= 300 đỉnh, giữ điểm đầu/cuối, polygon vuông không mất góc
// ============================================================================
test('4. Douglas–Peucker: đầu ra <= 300 đỉnh, giữ điểm đầu/cuối, polygon vuông không bị mất 4 góc', () => {
  // Polygon hình vuông 4 góc kèm các điểm nhiễu nhẹ dọc cạnh
  const squareCorners: Array<[number, number]> = [
    [21.0, 105.0], // góc 1
    [21.0, 105.02],
    [21.0, 105.05],
    [21.0, 105.1], // góc 2
    [21.04, 105.1],
    [21.08, 105.1],
    [21.1, 105.1], // góc 3
    [21.1, 105.06],
    [21.1, 105.02],
    [21.1, 105.0], // góc 4
    [21.05, 105.0],
    [21.0, 105.0], // đóng góc 1
  ];

  const simplifiedSquare = simplifyDouglasPeucker(squareCorners, 300, 0.001);
  // Điểm đầu và điểm cuối bảo toàn
  assert.deepEqual(simplifiedSquare[0], [21.0, 105.0]);
  assert.deepEqual(simplifiedSquare[simplifiedSquare.length - 1], [21.0, 105.0]);

  // Cả 4 góc nhọn chính phải còn nguyên
  const hasCorner = (lat: number, lng: number) =>
    simplifiedSquare.some(([lt, lg]) => Math.abs(lt - lat) < 1e-4 && Math.abs(lg - lng) < 1e-4);

  assert.ok(hasCorner(21.0, 105.0), 'Góc (21.0, 105.0) không bị mất');
  assert.ok(hasCorner(21.0, 105.1), 'Góc (21.0, 105.1) không bị mất');
  assert.ok(hasCorner(21.1, 105.1), 'Góc (21.1, 105.1) không bị mất');
  assert.ok(hasCorner(21.1, 105.0), 'Góc (21.1, 105.0) không bị mất');

  // Kiểm tra giới hạn 300 đỉnh trên chuỗi 500 điểm
  const densePoints: Array<[number, number]> = Array.from({length: 500}, (_, i) => [
    21.0 + i * 0.001,
    105.0 + Math.sin(i * 0.2) * 0.005,
  ]);
  const simplifiedDense = simplifyDouglasPeucker(densePoints, 300);
  assert.ok(simplifiedDense.length <= 300);
  assert.deepEqual(simplifiedDense[0], densePoints[0]);
  assert.deepEqual(simplifiedDense[simplifiedDense.length - 1], densePoints[densePoints.length - 1]);
});

// ============================================================================
// TEST 5: Lưới đường: way vắt qua 2 ô -> queryLines trả về 1 lần; không chạm -> rỗng
// ============================================================================
test('5. Lưới đường: way vắt qua 2 ô -> queryLines trả về 1 lần; bbox không chạm -> rỗng', () => {
  // Tạo thư mục tạm riêng biệt, KHÔNG BAO GIỜ chạm vào data/osm/vn
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-test-lines-'));
  const linesDir = path.join(tmpDir, 'lines');
  mkdirSync(linesDir, {recursive: true});

  // Way 999: vắt từ (21.04, 105.82) -> (21.12, 105.82).
  // Chạm ô 210_1058 và 211_1058.
  const lineFeature = {
    id: 999,
    kind: 'road',
    class: 'primary',
    name: 'Đường Thử Nghiệm Xuyên Ô',
    coords: [[21.04, 105.82], [21.12, 105.82]],
  };

  const cell1Path = path.join(linesDir, '210_1058.ndjson');
  const cell2Path = path.join(linesDir, '211_1058.ndjson');

  writeFileSync(cell1Path, JSON.stringify(lineFeature) + '\n', 'utf8');
  writeFileSync(cell2Path, JSON.stringify(lineFeature) + '\n', 'utf8');

  try {
    // Bbox bao quát cả 2 ô
    const bboxSpanning = {west: 105.8, south: 21.0, east: 105.9, north: 21.2};
    const res = queryLines(bboxSpanning, {dataDir: tmpDir});
    // Way 999 chỉ được trả về DUY NHẤT 1 lần
    const matches = res.filter(l => l.id === 999);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, 'Đường Thử Nghiệm Xuyên Ô');

    // Bbox ở rất xa không chạm
    const bboxDistant = {west: 106.5, south: 20.5, east: 106.6, north: 20.6};
    const resEmpty = queryLines(bboxDistant, {dataDir: tmpDir});
    const matchesDistant = resEmpty.filter(l => l.id === 999);
    assert.equal(matchesDistant.length, 0);
  } finally {
    rmSync(tmpDir, {recursive: true, force: true});
  }
});

// ============================================================================
// TEST 6: Tra tọa độ node bằng typed array + tìm kiếm nhị phân (hỗ trợ id > 2^31)
// ============================================================================
test('6. Tra tọa độ node bằng typed array + binary search: id có, id không có, id lớn hơn 2^31', () => {
  // Tạo 4 node đã sắp xếp theo ID, gồm ID nhỏ và ID > 2^31 (ví dụ 4 tỷ và 6 tỷ)
  const ids = new Float64Array([100, 500, 3_000_000_000, 6_000_000_000]);
  const lats = new Float64Array([21.01, 21.05, 21.08, 21.12]);
  const lngs = new Float64Array([105.81, 105.85, 105.88, 105.92]);

  // ID thường có trong danh sách
  const pt100 = findNodeCoord(ids, lats, lngs, 100);
  assert.ok(pt100 !== null);
  assert.equal(pt100!.lat, 21.01);
  assert.equal(pt100!.lng, 105.81);

  // ID lớn hơn 2^31 (3 tỷ)
  const pt3B = findNodeCoord(ids, lats, lngs, 3_000_000_000);
  assert.ok(pt3B !== null);
  assert.equal(pt3B!.lat, 21.08);
  assert.equal(pt3B!.lng, 105.88);

  // ID lớn hơn 2^31 (6 tỷ)
  const pt6B = findNodeCoord(ids, lats, lngs, 6_000_000_000);
  assert.ok(pt6B !== null);
  assert.equal(pt6B!.lat, 21.12);
  assert.equal(pt6B!.lng, 105.92);

  // ID không tồn tại
  const ptNone = findNodeCoord(ids, lats, lngs, 999);
  assert.equal(ptNone, null);

  const ptNoneBig = findNodeCoord(ids, lats, lngs, 4_000_000_000);
  assert.equal(ptNoneBig, null);
});

// ============================================================================
// TEST 7: fetch-boundary local: khớp nhiều kết quả -> lỗi; --osm-id chọn đúng
// ============================================================================
test('7. fetch-boundary local: query khớp nhiều kết quả -> lỗi kèm danh sách; --osm-id chọn đúng', async () => {
  // Tạo thư mục tạm riêng biệt, KHÔNG BAO GIỜ chạm vào data/osm/vn
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-test-admin-'));
  const adminFile = path.join(tmpDir, 'admin.ndjson');

  // Mock 2 xã cùng tên "Xã Tân Lập" ở 2 huyện khác nhau
  const mockAdmin1 = {
    id: 1111,
    name: 'Xã Tân Lập',
    adminLevel: 8,
    tags: {'name:vi': 'Xã Tân Lập'},
    bbox: [105.6, 21.1, 105.7, 21.2],
    ring: [[21.1, 105.6], [21.2, 105.7], [21.1, 105.7], [21.1, 105.6]],
  };
  const mockAdmin2 = {
    id: 2222,
    name: 'Xã Tân Lập',
    adminLevel: 8,
    tags: {'name:vi': 'Xã Tân Lập'},
    bbox: [106.1, 20.8, 106.2, 20.9],
    ring: [[20.8, 106.1], [20.9, 106.2], [20.8, 106.2], [20.8, 106.1]],
  };

  writeFileSync(adminFile, JSON.stringify(mockAdmin1) + '\n' + JSON.stringify(mockAdmin2) + '\n', 'utf8');

  try {
    // Truy vấn chung "Xã Tân Lập" -> Báo lỗi do có 2 kết quả, liệt kê danh sách và nhắc dùng --osm-id
    await assert.rejects(
      async () => {
        await fetchLocalBoundary('Xã Tân Lập', undefined, tmpDir);
      },
      (err: Error) => {
        assert.ok(err.message.includes('Tìm thấy 2 ranh giới hành chính'));
        assert.ok(err.message.includes('1111'));
        assert.ok(err.message.includes('2222'));
        assert.ok(err.message.includes('--osm-id'));
        return true;
      }
    );

    // Khi truyền osmId = 2222 -> Chọn chính xác
    const chosen = await fetchLocalBoundary('Xã Tân Lập', 2222, tmpDir);
    assert.equal(chosen.id, 2222);
    assert.equal(chosen.name, 'Xã Tân Lập');
    assert.deepEqual(chosen.boundary[0], {lat: 20.8, lng: 106.1});
  } finally {
    rmSync(tmpDir, {recursive: true, force: true});
  }
});

// ============================================================================
// TEST 8: --source local khi chưa có dữ liệu -> lỗi, KHÔNG gọi mạng
// ============================================================================
test('8. --source local khi chưa có dữ liệu -> lỗi, KHÔNG gọi mạng', async () => {
  // Thư mục tạm hoàn toàn rỗng, không có meta.json
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-empty-env-'));
  const origEnv = process.env.MAP_BDS_OSM_DIR;
  process.env.MAP_BDS_OSM_DIR = tmpDir;

  // Spy fetch
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: any[]) => {
    fetchCallCount++;
    return Reflect.apply(originalFetch, globalThis, args);
  }) as any;

  try {
    const testPropFile = path.join(tmpDir, 'test-prop.json');
    writeFileSync(testPropFile, JSON.stringify(sample, null, 2), 'utf8');

    await assert.rejects(
      async () => {
        await updatePropertyAmenities(testPropFile, 1500, 'local');
      },
      (err: Error) => {
        assert.ok(err.message.includes('Chưa có dữ liệu OSM local'));
        assert.ok(err.message.includes('osm-sync'));
        return true;
      }
    );

    // Kiểm tra tuyệt đối KHÔNG có fetch nào được gọi
    assert.equal(fetchCallCount, 0, 'Tuyệt đối không được gọi fetch mạng khi dùng --source local');
  } finally {
    globalThis.fetch = originalFetch;
    if (origEnv !== undefined) {
      process.env.MAP_BDS_OSM_DIR = origEnv;
    } else {
      delete process.env.MAP_BDS_OSM_DIR;
    }
    rmSync(tmpDir, {recursive: true, force: true});
  }
});

// ============================================================================
// TEST 9: usesOsmData cho cả 3 điều kiện và false; schema validation
// ============================================================================
test('9. usesOsmData cho cả 3 điều kiện và trường hợp false; schema kiểm tra dataSources', () => {
  const baseProp = propertySchema.parse(sample);

  // Điều kiện 1: dataSources có 'osm'
  const propWithDataSources: Property = {
    ...baseProp,
    dataSources: ['osm'],
    routes: [],
    amenities: [{name: 'Tiện ích A', distanceM: 200}],
  };
  assert.equal(usesOsmData(propWithDataSources), true);

  // Điều kiện 2: routes không rỗng
  const propWithRoutes: Property = {
    ...baseProp,
    dataSources: undefined,
    routes: [{name: 'Tuyến số 1', path: [{lat: 21.0, lng: 105.0}, {lat: 21.1, lng: 105.1}]}],
    amenities: [{name: 'Tiện ích B', distanceM: 300}],
  };
  assert.equal(usesOsmData(propWithRoutes), true);

  // Điều kiện 3: có ít nhất 1 tiện ích có tọa độ lat/lng
  const propWithCoordAmenity: Property = {
    ...baseProp,
    dataSources: undefined,
    routes: [],
    amenities: [{name: 'Trường Chu Văn An', distanceM: 400, lat: 21.04, lng: 105.83}],
  };
  assert.equal(usesOsmData(propWithCoordAmenity), true);

  // Trường hợp false: không có nguồn OSM, không có route, tiện ích không có tọa độ
  const propWithoutOsm: Property = {
    ...baseProp,
    dataSources: undefined,
    routes: [],
    amenities: [{name: 'Chợ địa phương', distanceM: 500}],
  };
  assert.equal(usesOsmData(propWithoutOsm), false);

  // Schema validation
  assert.equal(propertySchema.safeParse({...sample, dataSources: ['osm']}).success, true);
  assert.equal(propertySchema.safeParse({...sample, dataSources: []}).success, true);
  // Từ chối giá trị lạ không thuộc enum
  assert.equal(propertySchema.safeParse({...sample, dataSources: ['google_maps']}).success, false);
  // Từ chối mảng vượt quá max 5
  assert.equal(propertySchema.safeParse({...sample, dataSources: ['osm', 'osm', 'osm', 'osm', 'osm', 'osm']}).success, false);
});

// ============================================================================
// TEST 10: Khớp một phần tên ranh giới (kể cả đúng 1 kết quả) không tự chọn -> yêu cầu --osm-id
// ============================================================================
test('10. fetchLocalBoundary: đúng 1 kết quả khớp một phần tên -> KHÔNG tự chọn, bắt buộc --osm-id', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-partial-match-'));
  const adminFile = path.join(tmpDir, 'admin.ndjson');

  const mockAdmin = {
    id: 5555,
    name: 'Phường Quảng An',
    adminLevel: 8,
    tags: {'name:vi': 'Phường Quảng An'},
    bbox: [105.81, 21.06, 105.83, 21.08],
    ring: [[21.06, 105.81], [21.08, 105.81], [21.08, 105.83], [21.06, 105.81]],
  };

  writeFileSync(adminFile, JSON.stringify(mockAdmin) + '\n', 'utf8');

  try {
    // Query chỉ là "Quảng An" (khớp một phần với "Phường Quảng An")
    // Dù chỉ có đúng 1 kết quả cũng không được tự chọn
    await assert.rejects(
      async () => {
        await fetchLocalBoundary('Quảng An', undefined, tmpDir);
      },
      (err: Error) => {
        assert.ok(err.message.includes('khớp một phần'));
        assert.ok(err.message.includes('5555'));
        assert.ok(err.message.includes('--osm-id'));
        return true;
      }
    );

    // Khi truyền kèm --osm-id thì chọn đúng
    const chosen = await fetchLocalBoundary('Quảng An', 5555, tmpDir);
    assert.equal(chosen.id, 5555);
    assert.equal(chosen.name, 'Phường Quảng An');
  } finally {
    rmSync(tmpDir, {recursive: true, force: true});
  }
});

// ============================================================================
// TEST 11: boundaryPolygon ghi ra không có điểm cuối trùng điểm đầu
// ============================================================================
test('11. boundaryPolygon không lặp điểm đầu ở cuối', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-boundary-pts-'));
  const adminFile = path.join(tmpDir, 'admin.ndjson');

  // Ring có điểm cuối trùng điểm đầu
  const mockAdmin = {
    id: 7777,
    name: 'Xã Khép Kín',
    adminLevel: 8,
    tags: {'name:vi': 'Xã Khép Kín'},
    bbox: [105.0, 21.0, 105.1, 21.1],
    ring: [[21.0, 105.0], [21.1, 105.0], [21.1, 105.1], [21.0, 105.0]],
  };
  writeFileSync(adminFile, JSON.stringify(mockAdmin) + '\n', 'utf8');

  try {
    const res = await fetchLocalBoundary('Xã Khép Kín', 7777, tmpDir);
    assert.equal(res.boundary.length, 3, 'Phải bỏ điểm cuối trùng điểm đầu (còn 3 đỉnh)');
    const first = res.boundary[0];
    const last = res.boundary[res.boundary.length - 1];
    assert.notDeepEqual(first, last, 'Điểm đầu và điểm cuối không được trùng nhau');
  } finally {
    rmSync(tmpDir, {recursive: true, force: true});
  }
});

// ============================================================================
// TEST 12: Kiểm tra giá trị --source: gõ sai báo lỗi ngay, không gọi mạng
// ============================================================================
test('12. --source locl (sai chính tả) -> báo lỗi ngay, KHÔNG gọi mạng', async () => {
  assert.throws(
    () => validateOsmSource('locl'),
    /Giá trị --source không hợp lệ: "locl"/
  );

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: any[]) => {
    fetchCalled = true;
    return Reflect.apply(originalFetch, globalThis, args);
  }) as any;

  try {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-invalid-src-'));
    const testPropFile = path.join(tmpDir, 'test.json');
    writeFileSync(testPropFile, JSON.stringify(sample, null, 2), 'utf8');

    await assert.rejects(
      async () => {
        await updatePropertyAmenities(testPropFile, 1500, 'locl' as any);
      },
      /Giá trị --source không hợp lệ/
    );
    assert.equal(fetchCalled, false, 'Tuyệt đối không gọi fetch mạng khi --source không hợp lệ');

    await assert.rejects(
      async () => {
        await updatePropertyBoundary(testPropFile, 'Tây Hồ', 'locl' as any);
      },
      /Giá trị --source không hợp lệ/
    );
    assert.equal(fetchCalled, false);
    rmSync(tmpDir, {recursive: true, force: true});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// TEST 13: Toàn vẹn dữ liệu: data/osm/vn không bị thay đổi hoặc xóa bởi test suite
// ============================================================================
test('13. Toàn vẹn dữ liệu: data/osm/vn không bị thay đổi hoặc xóa bởi bất kỳ test nào', () => {
  if (!initialVnSnapshot) return;
  const currentSnapshot = getVnSnapshot();
  assert.ok(currentSnapshot !== null, 'data/osm/vn phải tồn tại');
  assert.equal(currentSnapshot.size, initialVnSnapshot.size, 'Số lượng file trong data/osm/vn phải không đổi');
  for (const [file, mtime] of initialVnSnapshot) {
    assert.ok(currentSnapshot.has(file), `File ${file} không được bị xóa`);
    assert.equal(currentSnapshot.get(file), mtime, `File ${file} không được bị sửa đổi mtime`);
  }
});
