import {readFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fromRoot} from './project';
import {distanceMeters} from '../src/geo';
import {parseOverpassElements, type ScannedAmenity} from './amenities';
import type {CoordinatePoint} from '../src/schema';

export interface OsmMeta {
  schemaVersion: number;
  source: string;
  sourceLastModified: string | null;
  md5: string;
  downloadedAt: string;
  processedAt: string;
  counts: {
    pois: number;
    admin: number;
    lines: number;
  };
  adminSkipped: number;
  poiRelationsSkipped: number;
  peakRssMb: number;
  processingTimeSec: number;
  license: string;
  attribution: string;
}

export interface LineFeature {
  id: number;
  kind: 'road' | 'waterway';
  class: string;
  name: string;
  coords: Array<[number, number]>;
}

export interface AdminBoundaryFeature {
  id: number;
  name: string;
  adminLevel: number;
  tags?: Record<string, string>;
  bbox: [number, number, number, number]; // [west, south, east, north]
  parts?: number;
  ring: Array<[number, number]>; // [[lat, lng], ...]
}

export function getOsmDataDir(overrideDir?: string): string {
  if (overrideDir) return overrideDir;
  if (process.env.MAP_BDS_OSM_DIR) return process.env.MAP_BDS_OSM_DIR;
  return fromRoot('data/osm/vn');
}

/**
 * Đọc file metadata của OSM local nếu tồn tại và hợp lệ.
 */
export function getLocalOsmMeta(dataDir?: string): OsmMeta | null {
  const metaPath = path.join(getOsmDataDir(dataDir), 'meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    const raw = readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schemaVersion === 1) return parsed as OsmMeta;
    return null;
  } catch {
    return null;
  }
}

export function isLocalOsmAvailable(dataDir?: string): boolean {
  return getLocalOsmMeta(dataDir) !== null;
}

/**
 * Tra cứu tọa độ node từ typed array bằng Binary Search.
 * Hỗ trợ mọi số nguyên hợp lệ trong JS bao gồm id > 2^31.
 */
export function findNodeCoord(
  ids: Float64Array,
  lats: Float64Array,
  lngs: Float64Array,
  targetId: number
): {lat: number; lng: number} | null {
  let low = 0;
  let high = ids.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midId = ids[mid];
    if (midId === targetId) {
      return {lat: lats[mid], lng: lngs[mid]};
    }
    if (midId < targetId) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return null;
}

/**
 * Thuật toán Douglas-Peucker chuẩn để rút gọn mảng tọa độ [lat, lng].
 */
function douglasPeuckerRecursive(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const [latA, lngA] = points[0];
  const [latB, lngB] = points[points.length - 1];
  const lineDist = Math.hypot(latB - latA, lngB - lngA);

  for (let i = 1; i < points.length - 1; i++) {
    const [latP, lngP] = points[i];
    let dist = 0;
    if (lineDist === 0) {
      dist = Math.hypot(latP - latA, lngP - lngA);
    } else {
      dist = Math.abs((lngB - lngA) * latP - (latB - latA) * lngP + latB * lngA - lngB * latA) / lineDist;
    }
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeuckerRecursive(points.slice(0, index + 1), epsilon);
    const right = douglasPeuckerRecursive(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

/**
 * Rút gọn mảng tọa độ về tối đa maxPoints đỉnh (mặc định <= 300).
 * Giữ nguyên điểm đầu/cuối và các góc sắc nét của đa giác.
 */
export function simplifyDouglasPeucker(
  points: Array<[number, number]>,
  maxPoints = 300,
  initialEpsilon = 0.00001
): Array<[number, number]> {
  if (points.length <= maxPoints) return points;
  let eps = initialEpsilon;
  let result = douglasPeuckerRecursive(points, eps);
  let iter = 0;
  while (result.length > maxPoints && iter < 30) {
    eps *= 1.5;
    result = douglasPeuckerRecursive(points, eps);
    iter++;
  }
  if (result.length > maxPoints) {
    const step = (result.length - 1) / (maxPoints - 1);
    const sampled: Array<[number, number]> = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      sampled.push(result[Math.floor(i * step)]);
    }
    sampled.push(result[result.length - 1]);
    result = sampled;
  }
  return result;
}

/**
 * Ghép các way thành viên role outer thành vòng ngoài khép kín (outer ring).
 * Hỗ trợ đảo chiều way khi cần. Nếu có nhiều vòng, chọn vòng có diện tích lớn nhất.
 */
export function stitchOuterRings(
  ways: Array<Array<[number, number]>>
): {rings: Array<Array<[number, number]>>; bestRing: Array<[number, number]> | null; parts: number} {
  const isMatch = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

  const unused = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const closedRings: Array<Array<[number, number]>> = [];

  while (unused.length > 0) {
    const current = unused.shift()!;
    let extended = true;

    while (extended && unused.length > 0) {
      extended = false;
      const head = current[0];
      const tail = current[current.length - 1];

      if (current.length >= 3 && isMatch(head, tail)) {
        break;
      }

      for (let i = 0; i < unused.length; i++) {
        const candidate = unused[i];
        const cHead = candidate[0];
        const cTail = candidate[candidate.length - 1];

        if (isMatch(tail, cHead)) {
          current.push(...candidate.slice(1));
          unused.splice(i, 1);
          extended = true;
          break;
        } else if (isMatch(tail, cTail)) {
          const reversed = [...candidate].reverse();
          current.push(...reversed.slice(1));
          unused.splice(i, 1);
          extended = true;
          break;
        } else if (isMatch(head, cTail)) {
          current.unshift(...candidate.slice(0, -1));
          unused.splice(i, 1);
          extended = true;
          break;
        } else if (isMatch(head, cHead)) {
          const reversed = [...candidate].reverse();
          current.unshift(...reversed.slice(0, -1));
          unused.splice(i, 1);
          extended = true;
          break;
        }
      }
    }

    const head = current[0];
    const tail = current[current.length - 1];
    if (current.length >= 3 && isMatch(head, tail)) {
      closedRings.push(current);
    }
  }

  if (closedRings.length === 0) {
    return {rings: [], bestRing: null, parts: 0};
  }

  // Tính diện tích từng vòng theo Shoelace formula
  let maxArea = -1;
  let bestRing: Array<[number, number]> | null = null;
  for (const ring of closedRings) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][1] * ring[i + 1][0] - ring[i + 1][1] * ring[i][0];
    }
    area = Math.abs(area) / 2;
    if (area > maxArea) {
      maxArea = area;
      bestRing = ring;
    }
  }

  return {rings: closedRings, bestRing, parts: closedRings.length};
}

/**
 * Sinh khóa ô lưới không gian (0.1 độ).
 */
export function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat * 10)}_${Math.floor(lng * 10)}`;
}

/**
 * Lấy danh sách khóa ô lưới bao phủ một bounding box.
 */
export function getGridKeysForBbox(bbox: {west: number; south: number; east: number; north: number}): string[] {
  const minLatKey = Math.floor(bbox.south * 10);
  const maxLatKey = Math.floor(bbox.north * 10);
  const minLngKey = Math.floor(bbox.west * 10);
  const maxLngKey = Math.floor(bbox.east * 10);

  const keys: string[] = [];
  for (let lat = minLatKey; lat <= maxLatKey; lat++) {
    for (let lng = minLngKey; lng <= maxLngKey; lng++) {
      keys.push(`${lat}_${lng}`);
    }
  }
  return keys;
}

/**
 * Bộ nhớ đệm trong tiến trình cho danh sách POIs local (tránh đọc đĩa nhiều lần).
 */
let cachedPois: {dir: string; items: any[]} | null = null;

export async function loadLocalPois(dataDir?: string): Promise<any[]> {
  const dir = getOsmDataDir(dataDir);
  if (cachedPois && cachedPois.dir === dir) return cachedPois.items;
  const filePath = path.join(dir, 'pois.ndjson');
  if (!existsSync(filePath)) {
    throw new Error('Chưa có dữ liệu OSM local (pois.ndjson). Vui lòng chạy "npm.cmd run video -- osm-sync" trước.');
  }
  const content = await readFile(filePath, 'utf8');
  const items: any[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      items.push(JSON.parse(trimmed));
    } catch {
      // bỏ qua dòng hỏng
    }
  }
  cachedPois = {dir, items};
  return items;
}

/**
 * Quét tiện ích local xung quanh tọa độ gps trong bán kính radiusM.
 */
export async function scanLocalAmenities(
  lat: number,
  lng: number,
  radiusM: number = 2000,
  dataDir?: string
): Promise<ScannedAmenity[]> {
  const pois = await loadLocalPois(dataDir);
  const matched: any[] = [];

  for (const el of pois) {
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (elLat === undefined || elLon === undefined) continue;

    const dist = distanceMeters({lat, lng}, {lat: elLat, lng: elLon});
    if (dist <= radiusM) {
      matched.push(el);
    }
  }

  return parseOverpassElements(matched, lat, lng);
}

/**
 * Truy vấn đường và sông ngòi theo bounding box từ các ô lưới local.
 */
export function queryLines(
  bbox: {west: number; south: number; east: number; north: number},
  opts?: {kinds?: Array<'road' | 'waterway'>; dataDir?: string}
): LineFeature[] {
  const keys = getGridKeysForBbox(bbox);
  const linesDir = path.join(getOsmDataDir(opts?.dataDir), 'lines');
  if (!existsSync(linesDir)) return [];

  const seenIds = new Set<number>();
  const results: LineFeature[] = [];

  for (const key of keys) {
    const filePath = path.join(linesDir, `${key}.ndjson`);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const feat = JSON.parse(trimmed) as LineFeature;
        if (seenIds.has(feat.id)) continue;
        if (opts?.kinds && !opts.kinds.includes(feat.kind)) continue;

        // Kiểm tra ít nhất một điểm nằm trong bbox
        const inBbox = feat.coords.some(
          ([lat, lng]) =>
            lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east
        );
        if (inBbox) {
          seenIds.add(feat.id);
          results.push(feat);
        }
      } catch {
        // bỏ qua dòng hỏng
      }
    }
  }

  return results;
}

/**
 * Đọc toàn bộ danh sách ranh hành chính từ admin.ndjson.
 */
export async function loadLocalAdminBoundaries(dataDir?: string): Promise<AdminBoundaryFeature[]> {
  const filePath = path.join(getOsmDataDir(dataDir), 'admin.ndjson');
  if (!existsSync(filePath)) {
    throw new Error('Chưa có dữ liệu OSM local (admin.ndjson). Vui lòng chạy "npm.cmd run video -- osm-sync" trước.');
  }
  const content = await readFile(filePath, 'utf8');
  const items: AdminBoundaryFeature[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      items.push(JSON.parse(trimmed));
    } catch {
      // bỏ qua dòng hỏng
    }
  }
  return items;
}

function normStr(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Truy vấn ranh hành chính từ dữ liệu local theo query hoặc osmId.
 */
export async function fetchLocalBoundary(
  query: string,
  osmId?: number,
  dataDir?: string
): Promise<{boundary: CoordinatePoint[]; adminLevel: number; name: string; id: number}> {
  const boundaries = await loadLocalAdminBoundaries(dataDir);

  const cleanRing = (ring: Array<[number, number]>): CoordinatePoint[] => {
    const isClosed =
      ring.length >= 2 &&
      Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-6 &&
      Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-6;
    const trimmed = isClosed ? ring.slice(0, -1) : ring;
    return trimmed.map(([lat, lng]) => ({lat, lng}));
  };

  if (osmId !== undefined) {
    const directMatch = boundaries.find((b) => b.id === osmId);
    if (!directMatch) {
      throw new Error(`Không tìm thấy ranh giới hành chính nào có OSM ID = ${osmId}`);
    }
    return {
      boundary: cleanRing(directMatch.ring),
      adminLevel: directMatch.adminLevel,
      name: directMatch.name,
      id: directMatch.id,
    };
  }

  // Tách query nếu có dấu phẩy: "Phần chính, Tên cha"
  const commaIdx = query.indexOf(',');
  const primaryQuery = normStr(commaIdx >= 0 ? query.slice(0, commaIdx) : query);
  const parentHint = normStr(commaIdx >= 0 ? query.slice(commaIdx + 1) : '');

  // Lọc theo tên chính
  let candidates = boundaries.filter((b) => {
    const nameMatch = normStr(b.name) === primaryQuery;
    const nameViMatch = b.tags?.['name:vi'] && normStr(b.tags['name:vi']) === primaryQuery;
    const nameEnMatch = b.tags?.['name:en'] && normStr(b.tags['name:en']) === primaryQuery;
    return nameMatch || nameViMatch || nameEnMatch;
  });

  let isPartialMatch = false;
  // Nếu không khớp chính xác, thử khớp dạng chứa (starts with / contains)
  if (candidates.length === 0) {
    candidates = boundaries.filter((b) => {
      const name = normStr(b.name);
      return name.includes(primaryQuery);
    });
    if (candidates.length > 0) {
      isPartialMatch = true;
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Không tìm thấy ranh giới hành chính phù hợp cho: "${query}".`);
  }

  // Nếu có nhiều hơn 1 kết quả và có parentHint: so khớp ranh cha chứa tâm ranh con
  if (candidates.length > 1 && parentHint) {
    const hintMatched = candidates.filter((c) => {
      const cCenterLat = (c.bbox[1] + c.bbox[3]) / 2;
      const cCenterLng = (c.bbox[0] + c.bbox[2]) / 2;
      return boundaries.some(
        (parent) =>
          parent.adminLevel < c.adminLevel &&
          normStr(parent.name).includes(parentHint) &&
          cCenterLat >= parent.bbox[1] &&
          cCenterLat <= parent.bbox[3] &&
          cCenterLng >= parent.bbox[0] &&
          cCenterLng <= parent.bbox[2]
      );
    });
    if (hintMatched.length === 1) {
      candidates = hintMatched;
    }
  }

  // Yêu cầu: Khớp một phần LUÔN LUÔN liệt kê làm ứng viên, chỉ được chọn bằng --osm-id (kể cả chỉ đúng 1 kết quả)
  if (isPartialMatch) {
    const list = candidates
      .map((c) => {
        const centerLat = ((c.bbox[1] + c.bbox[3]) / 2).toFixed(4);
        const centerLng = ((c.bbox[0] + c.bbox[2]) / 2).toFixed(4);
        return `   - ID: ${c.id} | ${c.name} (cấp ${c.adminLevel}, tâm: ${centerLat}, ${centerLng})`;
      })
      .join('\n');
    throw new Error(
      `Tìm thấy ${candidates.length} ranh giới hành chính khớp một phần với "${query}":\n${list}\nVui lòng thêm cờ --osm-id <id> để chọn chính xác.`
    );
  }

  // Nếu vẫn còn nhiều kết quả khớp chính xác: Báo lỗi và liệt kê danh sách
  if (candidates.length > 1) {
    const list = candidates
      .map((c) => {
        const centerLat = ((c.bbox[1] + c.bbox[3]) / 2).toFixed(4);
        const centerLng = ((c.bbox[0] + c.bbox[2]) / 2).toFixed(4);
        return `   - ID: ${c.id} | ${c.name} (cấp ${c.adminLevel}, tâm: ${centerLat}, ${centerLng})`;
      })
      .join('\n');
    throw new Error(
      `Tìm thấy ${candidates.length} ranh giới hành chính khớp với "${query}":\n${list}\nVui lòng thêm cờ --osm-id <id> để chọn chính xác.`
    );
  }

  const selected = candidates[0];
  return {
    boundary: cleanRing(selected.ring),
    adminLevel: selected.adminLevel,
    name: selected.name,
    id: selected.id,
  };
}
