import {createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, renameSync, statSync} from 'node:fs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createOSMStream} from 'osm-pbf-parser-node';
import {fromRoot} from './project';
import {
  gridKey,
  getGridKeysForBbox,
  stitchOuterRings,
  simplifyDouglasPeucker,
  getLocalOsmMeta,
  type OsmMeta,
  type LineFeature,
  type AdminBoundaryFeature,
} from './osm-local';

const PBF_URL = 'https://download.geofabrik.de/asia/vietnam-latest.osm.pbf';
const MD5_URL = 'https://download.geofabrik.de/asia/vietnam-latest.osm.pbf.md5';
const USER_AGENT = 'MapBDS-OsmSync/1.0';

const POI_AMENITIES = new Set(['school', 'kindergarten', 'hospital', 'clinic', 'marketplace', 'pharmacy']);
const POI_SHOPS = new Set(['supermarket', 'convenience', 'mall']);
const POI_LEISURES = new Set(['park', 'playground']);

export function isTargetPoi(tags?: Record<string, string>): boolean {
  if (!tags || !tags.name) return false;
  if (tags.amenity && POI_AMENITIES.has(tags.amenity)) return true;
  if (tags.shop && POI_SHOPS.has(tags.shop)) return true;
  if (tags.leisure && POI_LEISURES.has(tags.leisure)) return true;
  if (tags.natural === 'water') return true;
  return false;
}

export function pickPoiTags(tags?: Record<string, string>): Record<string, string> {
  if (!tags) return {};
  const picked: Record<string, string> = {};
  for (const k of ['name', 'name:vi', 'name:en', 'amenity', 'shop', 'leisure', 'natural']) {
    if (tags[k]) picked[k] = tags[k];
  }
  return picked;
}

const HIGHWAY_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'residential', 'unclassified', 'living_street',
]);
const WATERWAY_CLASSES = new Set(['river', 'canal', 'stream']);

export function isTargetLine(tags?: Record<string, string>): {kind: 'road' | 'waterway'; class: string} | null {
  if (!tags || !tags.name) return null;
  if (tags.highway && HIGHWAY_CLASSES.has(tags.highway)) {
    return {kind: 'road', class: tags.highway};
  }
  if (tags.waterway && WATERWAY_CLASSES.has(tags.waterway)) {
    return {kind: 'waterway', class: tags.waterway};
  }
  return null;
}

export function isAdminRelation(tags?: Record<string, string>): boolean {
  if (!tags || !tags.name) return false;
  if (tags.boundary !== 'administrative') return false;
  const level = String(tags.admin_level);
  return level === '4' || level === '6' || level === '8';
}

/**
 * Tải file checksum MD5 từ Geofabrik.
 */
export async function fetchRemoteMd5(): Promise<string> {
  console.log(`🔍 Đang kiểm tra checksum MD5 từ: ${MD5_URL}...`);
  const res = await fetch(MD5_URL, {
    headers: {'User-Agent': USER_AGENT},
  });
  if (!res.ok) {
    throw new Error(`Không tải được file md5 từ Geofabrik (${res.status} ${res.statusText}). Bắt buộc dừng theo quy định kiểm tra toàn vẹn.`);
  }
  const text = await res.text();
  const match = text.trim().match(/^([a-f0-9]{32})/i);
  if (!match) {
    throw new Error(`Định dạng file md5 không hợp lệ: "${text.trim()}"`);
  }
  return match[1].toLowerCase();
}

/**
 * Lấy header Last-Modified của file PBF trên server Geofabrik.
 */
export async function fetchRemoteLastModified(): Promise<string> {
  const res = await fetch(PBF_URL, {
    method: 'HEAD',
    headers: {'User-Agent': USER_AGENT},
  });
  return res.headers.get('last-modified') || '';
}

/**
 * Tính MD5 của một file cục bộ bằng streaming.
 */
export async function calculateFileMd5(filePath: string): Promise<string> {
  const {createReadStream} = await import('node:fs');
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', reject);
  });
}

/**
 * Tải file PBF từ Geofabrik nếu chưa có hoặc có bản mới hơn.
 */
export async function downloadOsmPbf(options?: {force?: boolean}): Promise<{
  pbfPath: string;
  md5: string;
  sourceLastModified: string | null;
  downloadedAt: string;
  skipped: boolean;
}> {
  const osmDir = fromRoot('data/osm');
  await mkdir(osmDir, {recursive: true});
  const pbfPath = path.join(osmDir, 'vietnam-latest.osm.pbf');
  const partPath = path.join(osmDir, 'vietnam-latest.osm.pbf.part');

  const remoteMd5 = await fetchRemoteMd5();
  const remoteLastModified = await fetchRemoteLastModified();

  if (!options?.force && existsSync(pbfPath)) {
    console.log(`📄 Đã tìm thấy file cục bộ: ${pbfPath}. Đang xác thực MD5...`);
    const localMd5 = await calculateFileMd5(pbfPath);
    if (localMd5 === remoteMd5) {
      console.log(`✅ File cục bộ đã khớp MD5 (${localMd5}) và không có bản mới hơn. Bỏ qua bước tải.`);
      const existingMeta = getLocalOsmMeta();
      return {
        pbfPath,
        md5: remoteMd5,
        sourceLastModified: remoteLastModified || (existingMeta?.md5 === remoteMd5 ? existingMeta.sourceLastModified : null),
        downloadedAt: statSync(pbfPath).mtime.toISOString(),
        skipped: true,
      };
    }
    console.log(`⚠️ MD5 cục bộ (${localMd5}) khác server (${remoteMd5}). Bắt đầu tải lại...`);
  }

  console.log(`🌐 Đang tải dữ liệu OpenStreetMap Việt Nam từ Geofabrik...`);
  console.log(`   URL: ${PBF_URL}`);
  console.log(`   MD5 dự kiến: ${remoteMd5}`);

  let existingBytes = 0;
  if (existsSync(partPath)) {
    existingBytes = statSync(partPath).size;
    console.log(`🔄 Phát hiện file tạm dở dang: ${(existingBytes / 1024 / 1024).toFixed(1)} MB. Sẽ tải tiếp từ mốc này...`);
  }

  const reqHeaders: Record<string, string> = {'User-Agent': USER_AGENT};
  if (existingBytes > 0) {
    reqHeaders['Range'] = `bytes=${existingBytes}-`;
  }

  const res = await fetch(PBF_URL, {
    headers: reqHeaders,
  });

  const isPartial = res.status === 206;
  if (!res.ok && !isPartial) {
    throw new Error(`Lỗi tải file PBF (${res.status} ${res.statusText})`);
  }

  const fileStream = createWriteStream(partPath, {flags: isPartial ? 'a' : 'w'});

  let totalBytes = 0;
  if (isPartial) {
    const contentRange = res.headers.get('content-range'); // e.g. bytes 116222866-331590325/331590326
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) totalBytes = Number(match[1]);
    }
    if (!totalBytes) {
      totalBytes = existingBytes + Number(res.headers.get('content-length') || 0);
    }
  } else {
    totalBytes = Number(res.headers.get('content-length') || 0);
    existingBytes = 0; // server ignored Range or fresh download
  }

  const totalMb = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
  console.log(`📦 Tổng dung lượng cần tải: ${totalMb} MB (Đã có sẵn: ${(existingBytes / 1024 / 1024).toFixed(1)} MB)`);

  let downloadedBytes = existingBytes;
  let lastReportPercent = -1;

  if (!res.body) {
    throw new Error('Không nhận được luồng dữ liệu (ReadableStream) từ server.');
  }

  const reader = res.body.getReader();

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (value) {
      fileStream.write(value);
      downloadedBytes += value.length;

      if (totalBytes > 0) {
        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
        if (percent !== lastReportPercent && percent % 5 === 0) {
          lastReportPercent = percent;
          process.stdout.write(`\r   Tiến độ tải: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} / ${totalMb} MB)`);
        }
      }
    }
  }

  await new Promise((resolve, reject) => {
    fileStream.end((err: any) => (err ? reject(err) : resolve(null)));
  });
  process.stdout.write('\n');

  console.log(`🔍 Đang xác thực MD5 toàn bộ file tải về...`);
  const actualMd5 = await calculateFileMd5(partPath);
  if (actualMd5 !== remoteMd5) {
    rmSync(partPath, {force: true});
    throw new Error(`Kiểm tra MD5 thất bại! Server: ${remoteMd5}, Thực nhận: ${actualMd5}. Đã xóa file hỏng.`);
  }

  if (existsSync(pbfPath)) rmSync(pbfPath, {force: true});
  renameSync(partPath, pbfPath);

  console.log(`✅ Tải file hoàn tất và xác thực MD5 thành công: ${pbfPath}`);
  return {
    pbfPath,
    md5: actualMd5,
    sourceLastModified: remoteLastModified || null,
    downloadedAt: new Date().toISOString(),
    skipped: false,
  };
}

/**
 * Tính tâm bounding box của một Way từ danh sách node refs.
 */
export function computeWayBboxCenter(
  refs: number[],
  getNodeCoord: (id: number) => {lat: number; lng: number} | null
): {lat: number; lon: number} | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let validPts = 0;

  for (const ref of refs) {
    const pt = getNodeCoord(ref);
    if (pt) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lng < minLon) minLon = pt.lng;
      if (pt.lng > maxLon) maxLon = pt.lng;
      validPts++;
    }
  }

  if (validPts === 0) return null;
  return {
    lat: Number(((minLat + maxLat) / 2).toFixed(6)),
    lon: Number(((minLon + maxLon) / 2).toFixed(6)),
  };
}

/**
 * Xây dựng LineFeature và danh sách ô lưới bao phủ.
 */
export function buildLineFeature(
  way: {id: number; kind: 'road' | 'waterway'; class: string; name: string; refs: number[]},
  getNodeCoord: (id: number) => {lat: number; lng: number} | null
): {feature: LineFeature; gridKeys: string[]} | null {
  const coords: Array<[number, number]> = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const ref of way.refs) {
    const pt = getNodeCoord(ref);
    if (pt) {
      coords.push([pt.lat, pt.lng]);
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lng < minLng) minLng = pt.lng;
      if (pt.lng > maxLng) maxLng = pt.lng;
    }
  }

  if (coords.length < 2) return null;
  const gridKeys = getGridKeysForBbox({west: minLng, south: minLat, east: maxLng, north: maxLat});
  return {
    feature: {
      id: way.id,
      kind: way.kind,
      class: way.class,
      name: way.name,
      coords,
    },
    gridKeys,
  };
}

/**
 * Ghép ranh giới hành chính từ relation và các way thành viên.
 */
export function buildAdminBoundary(
  rel: {id: number; name: string; adminLevel: number; tags: Record<string, string>; outerWayIds: number[]},
  adminWayRefs: Map<number, number[]>,
  getNodeCoord: (id: number) => {lat: number; lng: number} | null
): AdminBoundaryFeature | null {
  const memberWaysCoords: Array<Array<[number, number]>> = [];

  for (const wayId of rel.outerWayIds) {
    const refs = adminWayRefs.get(wayId);
    if (!refs) continue;
    const wayCoords: Array<[number, number]> = [];
    for (const ref of refs) {
      const pt = getNodeCoord(ref);
      if (pt) wayCoords.push([pt.lat, pt.lng]);
    }
    if (wayCoords.length >= 2) {
      memberWaysCoords.push(wayCoords);
    }
  }

  const {bestRing, parts} = stitchOuterRings(memberWaysCoords);
  if (!bestRing) return null;

  const simplified = simplifyDouglasPeucker(bestRing, 300);

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of simplified) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return {
    id: rel.id,
    name: rel.name,
    adminLevel: rel.adminLevel,
    tags: rel.tags,
    bbox: [
      Number(minLng.toFixed(6)),
      Number(minLat.toFixed(6)),
      Number(maxLng.toFixed(6)),
      Number(maxLat.toFixed(6)),
    ],
    parts,
    ring: simplified,
  };
}

/**
 * Xử lý file .pbf thành cấu trúc dữ liệu gọn gàng trong data/osm/vn/
 */
export async function processOsmPbf(
  pbfPath: string,
  metaInfo: {
    sourceLastModified: string | null;
    md5: string;
    downloadedAt: string;
  }
): Promise<OsmMeta> {
  const startTime = Date.now();
  let peakRssBytes = process.memoryUsage().rss;

  const sampleMemory = () => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRssBytes) peakRssBytes = rss;
  };

  const vnDir = fromRoot('data/osm/vn');
  const tmpDir = fromRoot('data/osm/vn.tmp');
  const linesTmpDir = path.join(tmpDir, 'lines');

  if (existsSync(tmpDir)) rmSync(tmpDir, {recursive: true, force: true});
  mkdirSync(linesTmpDir, {recursive: true});

  console.log(`\n⚙️ BẮT ĐẦU XỬ LÝ PBF (Multi-pass Streaming)...`);

  // =========================================================================
  // LƯỢT 1: Quét Relations & Ways để tìm Admin Relations, POI Ways, Line Ways
  // =========================================================================
  console.log(`1️⃣  Lượt 1: Quét Relations và Ways...`);
  const adminRelations: Array<{
    id: number;
    name: string;
    adminLevel: number;
    tags: Record<string, string>;
    outerWayIds: number[];
  }> = [];
  const adminOuterWaySet = new Set<number>();
  let poiRelationsSkipped = 0;

  const poiWays: Array<{
    id: number;
    tags: Record<string, string>;
    refs: number[];
  }> = [];

  const lineWays: Array<{
    id: number;
    kind: 'road' | 'waterway';
    class: string;
    name: string;
    refs: number[];
  }> = [];

  const neededNodeIds = new Set<number>();
  let scannedCount = 0;

  for await (const entity of createOSMStream(pbfPath) as any) {
    scannedCount++;
    if (scannedCount % 500000 === 0) {
      sampleMemory();
      process.stdout.write(`\r   Đã duyệt ${scannedCount.toLocaleString()} phần tử...`);
    }

    if (entity.type === 'relation') {
      if (isAdminRelation(entity.tags)) {
        const outerWayIds: number[] = [];
        for (const member of entity.members || []) {
          if (member.type === 'way' && (member.role === 'outer' || !member.role)) {
            outerWayIds.push(member.ref);
            adminOuterWaySet.add(member.ref);
          }
        }
        adminRelations.push({
          id: entity.id,
          name: entity.tags.name,
          adminLevel: Number(entity.tags.admin_level),
          tags: {
            'name:vi': entity.tags['name:vi'] || '',
            'name:en': entity.tags['name:en'] || '',
          },
          outerWayIds,
        });
      } else if (isTargetPoi(entity.tags)) {
        poiRelationsSkipped++;
      }
    } else if (entity.type === 'way') {
      if (isTargetPoi(entity.tags)) {
        poiWays.push({
          id: entity.id,
          tags: pickPoiTags(entity.tags),
          refs: entity.refs || [],
        });
        for (const r of entity.refs || []) neededNodeIds.add(r);
      }
      const line = isTargetLine(entity.tags);
      if (line) {
        lineWays.push({
          id: entity.id,
          kind: line.kind,
          class: line.class,
          name: entity.tags.name,
          refs: entity.refs || [],
        });
        for (const r of entity.refs || []) neededNodeIds.add(r);
      }
    }
  }
  process.stdout.write('\n');
  sampleMemory();

  console.log(`   Tìm thấy: ${adminRelations.length} Admin Relations (${adminOuterWaySet.size} outer ways), ${poiWays.length} POI Ways, ${lineWays.length} Line Ways.`);

  // =========================================================================
  // LƯỢT 1.5: Thu thập refs của các way thuộc adminOuterWaySet
  // =========================================================================
  console.log(`1️⃣.5️⃣ Thu thập tọa độ way thành viên của ranh hành chính...`);
  const adminWayRefs = new Map<number, number[]>();
  let waysScanned = 0;

  for await (const entity of createOSMStream(pbfPath) as any) {
    if (entity.type === 'way') {
      waysScanned++;
      if (adminOuterWaySet.has(entity.id)) {
        adminWayRefs.set(entity.id, entity.refs || []);
        for (const r of entity.refs || []) neededNodeIds.add(r);
        if (adminWayRefs.size === adminOuterWaySet.size) {
          break; // đã tìm đủ tất cả way thành viên
        }
      }
    }
  }
  sampleMemory();
  console.log(`   Đã thu thập ${adminWayRefs.size} admin outer ways. Tổng số node cần lấy tọa độ: ${neededNodeIds.size.toLocaleString()}.`);

  // =========================================================================
  // LƯỢT 2: Quét Nodes -> Lưu POI nodes trực tiếp, gom tọa độ neededNodeIds vào TypedArray
  // =========================================================================
  console.log(`2️⃣  Lượt 2: Quét Nodes (lưu POI node & cấp phát Float64Array tọa độ)...`);
  const poisPath = path.join(tmpDir, 'pois.ndjson');
  const poisStream = createWriteStream(poisPath, {flags: 'w'});

  let poisCount = 0;
  const maxNeeded = neededNodeIds.size;
  const rawIds = new Float64Array(maxNeeded);
  const rawLats = new Float64Array(maxNeeded);
  const rawLngs = new Float64Array(maxNeeded);
  let storedNodeCount = 0;

  let nodesScanned = 0;
  for await (const entity of createOSMStream(pbfPath) as any) {
    if (entity.type === 'node') {
      nodesScanned++;
      if (nodesScanned % 1000000 === 0) {
        sampleMemory();
        process.stdout.write(`\r   Đã duyệt ${nodesScanned.toLocaleString()} nodes (đã lưu ${storedNodeCount.toLocaleString()} mốc)...`);
      }

      // Lưu POI node nếu có
      if (isTargetPoi(entity.tags)) {
        poisCount++;
        const record = {
          type: 'node',
          id: entity.id,
          lat: Number(entity.lat.toFixed(6)),
          lon: Number(entity.lon.toFixed(6)),
          tags: pickPoiTags(entity.tags),
        };
        poisStream.write(JSON.stringify(record) + '\n');
      }

      // Lưu tọa độ nếu thuộc neededNodeIds
      if (neededNodeIds.has(entity.id)) {
        rawIds[storedNodeCount] = entity.id;
        rawLats[storedNodeCount] = Number(entity.lat.toFixed(6));
        rawLngs[storedNodeCount] = Number(entity.lon.toFixed(6));
        storedNodeCount++;
      }
    }
  }
  process.stdout.write('\n');
  sampleMemory();

  console.log(`   Sắp xếp ${storedNodeCount.toLocaleString()} node bằng TypedArray để tìm kiếm nhị phân...`);
  // Sắp xếp các mảng theo ID
  const indices = new Int32Array(storedNodeCount);
  for (let i = 0; i < storedNodeCount; i++) indices[i] = i;
  indices.sort((a, b) => (rawIds[a] < rawIds[b] ? -1 : rawIds[a] > rawIds[b] ? 1 : 0));

  const sortedIds = new Float64Array(storedNodeCount);
  const sortedLats = new Float64Array(storedNodeCount);
  const sortedLngs = new Float64Array(storedNodeCount);
  for (let i = 0; i < storedNodeCount; i++) {
    const orig = indices[i];
    sortedIds[i] = rawIds[orig];
    sortedLats[i] = rawLats[orig];
    sortedLngs[i] = rawLngs[orig];
  }
  sampleMemory();

  // Helper tìm kiếm nhanh tọa độ
  const getNodeCoord = (targetId: number): {lat: number; lng: number} | null => {
    let low = 0;
    let high = storedNodeCount - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const midId = sortedIds[mid];
      if (midId === targetId) {
        return {lat: sortedLats[mid], lng: sortedLngs[mid]};
      }
      if (midId < targetId) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return null;
  };

  // =========================================================================
  // LƯỢT 3: Ghép tọa độ POI Ways, Lines & Admin Boundaries
  // =========================================================================
  console.log(`3️⃣  Lượt 3: Ghép dữ liệu và xuất các file output...`);

  // 1. POI Ways -> tính bbox center và ghi vào pois.ndjson
  for (const way of poiWays) {
    const center = computeWayBboxCenter(way.refs, getNodeCoord);
    if (center) {
      poisCount++;
      const record = {
        type: 'way',
        id: way.id,
        center,
        tags: way.tags,
      };
      poisStream.write(JSON.stringify(record) + '\n');
    }
  }
  await new Promise((resolve) => poisStream.end(resolve));

  // 2. Lines -> phân vào các ô lưới lines/<latKey>_<lngKey>.ndjson
  console.log(`   Đang phân bổ ${lineWays.length.toLocaleString()} đường & sông vào ô lưới không gian...`);
  let linesCount = 0;
  const lineStreams = new Map<string, any>();

  const getLineStream = (key: string) => {
    let s = lineStreams.get(key);
    if (!s) {
      const p = path.join(linesTmpDir, `${key}.ndjson`);
      s = createWriteStream(p, {flags: 'a'});
      lineStreams.set(key, s);
    }
    return s;
  };

  for (const way of lineWays) {
    const built = buildLineFeature(way, getNodeCoord);
    if (built) {
      linesCount++;
      const record = JSON.stringify(built.feature) + '\n';
      for (const k of built.gridKeys) {
        getLineStream(k).write(record);
      }
    }
  }

  // Đóng và chờ toàn bộ luồng ghi ô lưới hoàn tất trước khi tiếp tục
  await Promise.all(
    Array.from(lineStreams.values()).map(
      (s) => new Promise((ok, err) => { s.end(() => ok(undefined)); s.on('error', err); })
    )
  );

  // 3. Admin relations -> ghép outer ring, rút gọn Douglas-Peucker và ghi vào admin.ndjson
  console.log(`   Đang ghép vòng ngoài cho ${adminRelations.length} ranh giới hành chính...`);
  const adminPath = path.join(tmpDir, 'admin.ndjson');
  const adminStream = createWriteStream(adminPath, {flags: 'w'});

  let adminCount = 0;
  let adminSkipped = 0;

  for (const rel of adminRelations) {
    const record = buildAdminBoundary(rel, adminWayRefs, getNodeCoord);
    if (!record) {
      adminSkipped++;
      continue;
    }
    adminCount++;
    adminStream.write(JSON.stringify(record) + '\n');
  }
  await new Promise((resolve) => adminStream.end(resolve));

  sampleMemory();
  const processingTimeSec = Math.round((Date.now() - startTime) / 1000);
  const peakRssMb = Math.round(peakRssBytes / (1024 * 1024));

  const meta: OsmMeta = {
    schemaVersion: 1,
    source: PBF_URL,
    sourceLastModified: metaInfo.sourceLastModified,
    md5: metaInfo.md5,
    downloadedAt: metaInfo.downloadedAt,
    processedAt: new Date().toISOString(),
    counts: {
      pois: poisCount,
      admin: adminCount,
      lines: linesCount,
    },
    adminSkipped,
    poiRelationsSkipped,
    peakRssMb,
    processingTimeSec,
    license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors',
  };

  await writeFile(path.join(tmpDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

  // Đổi tên tmpDir thành vnDir nguyên tử
  if (existsSync(vnDir)) {
    rmSync(vnDir, {recursive: true, force: true});
  }
  renameSync(tmpDir, vnDir);

  console.log(`\n🎉 HOÀN THÀNH XỬ LÝ DỮ LIỆU OSM VIỆT NAM TRONG ${processingTimeSec}s!`);
  console.log(`   RAM đỉnh: ${peakRssMb} MB (giới hạn an toàn < 4096 MB)`);
  console.log(`   Số lượng tiện ích (POIs): ${poisCount.toLocaleString()}`);
  console.log(`   Số lượng ranh hành chính: ${adminCount.toLocaleString()} (bỏ qua không khép kín: ${adminSkipped})`);
  console.log(`   Số lượng đường & sông có tên: ${linesCount.toLocaleString()}`);
  console.log(`   Thư mục lưu trữ: ${vnDir}`);

  return meta;
}

async function main() {
  const {values} = parseArgs({
    options: {
      'process-only': {type: 'boolean', default: false},
      force: {type: 'boolean', default: false},
      help: {type: 'boolean'},
    },
  });

  if (values.help) {
    console.log(`
Map BĐS — Đồng bộ dữ liệu OpenStreetMap Việt Nam cục bộ
Cách dùng:
  npm run video -- osm-sync                 # Tải (nếu cần) + xử lý
  npm run video -- osm-sync --process-only  # Chỉ xử lý lại file .pbf đã có
  npm run video -- osm-sync --force         # Bắt buộc tải lại dù file đã có
`);
    return;
  }

  const pbfPath = fromRoot('data/osm/vietnam-latest.osm.pbf');
  let metaInfo: {
    pbfPath: string;
    md5: string;
    sourceLastModified: string | null;
    downloadedAt: string;
    skipped: boolean;
  };

  if (values['process-only']) {
    if (!existsSync(pbfPath)) {
      throw new Error(`Không tìm thấy file ${pbfPath}. Vui lòng chạy "npm run video -- osm-sync" để tải file trước.`);
    }
    console.log(`🔍 Chế độ --process-only: Đang tính toán MD5 của file hiện có...`);
    const md5 = await calculateFileMd5(pbfPath);
    const existingMeta = getLocalOsmMeta();
    let sourceLastModified: string | null = null;
    if (existingMeta && existingMeta.md5 === md5 && existingMeta.sourceLastModified) {
      sourceLastModified = existingMeta.sourceLastModified;
    } else {
      console.warn('⚠️  Cảnh báo: Không có thông tin sourceLastModified từ Geofabrik cho file PBF hiện tại.');
    }
    metaInfo = {
      pbfPath,
      md5,
      sourceLastModified,
      downloadedAt: statSync(pbfPath).mtime.toISOString(),
      skipped: true,
    };
  } else {
    metaInfo = await downloadOsmPbf({force: values.force});
  }

  await processOsmPbf(metaInfo.pbfPath, metaInfo);
}

if (process.argv[1]?.includes('osm-sync')) {
  main().catch((err) => {
    console.error('\n❌ Lỗi osm-sync:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
