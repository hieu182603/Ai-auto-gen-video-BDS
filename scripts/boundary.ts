import {writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {fromRoot, readProperty} from './project';
import type {Property, CoordinatePoint} from '../src/schema';
import {getLocalOsmMeta, fetchLocalBoundary, type OsmMeta} from './osm-local';

export type OsmSourceOption = 'auto' | 'local' | 'online';

const VALID_SOURCES = new Set(['auto', 'local', 'online']);
export function validateOsmSource(source: string): OsmSourceOption {
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Giá trị --source không hợp lệ: "${source}". Chỉ chấp nhận: auto | local | online`);
  }
  return source as OsmSourceOption;
}

/**
 * Rút gọn mảng tọa độ nếu quá nhiều đỉnh (đảm bảo <= maxPoints và giữ đúng hình dạng)
 */
function simplifyPolygon(points: CoordinatePoint[], maxPoints = 120): CoordinatePoint[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const sampled: CoordinatePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.floor(i * step)]);
  }
  return sampled;
}

/**
 * Tải đa giác ranh giới hành chính thực tế từ OpenStreetMap Nominatim GeoJSON
 */
export async function fetchAdministrativeBoundary(query: string): Promise<{boundary: CoordinatePoint[]; adminLevel?: number; name: string}> {
  console.log(`🗺️  Đang tìm kiếm ranh giới hành chính online cho: "${query}"...`);
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&extratags=1&limit=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'MapBDS-BoundaryRadar/1.0 (contact: support@mapbds.local)',
      'Accept-Language': 'vi,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`Lỗi kết nối OpenStreetMap Nominatim (${res.status}): ${res.statusText}`);
  }

  const results = await res.json() as any[];
  if (!results || results.length === 0) {
    throw new Error(`Không tìm thấy ranh giới hành chính cho: "${query}"`);
  }

  const item = results[0];
  const geojson = item.geojson;
  if (!geojson || !geojson.coordinates) {
    throw new Error(`Địa điểm "${item.display_name}" không có dữ liệu đa giác ranh giới.`);
  }

  let rawCoords: number[][] = [];
  if (geojson.type === 'Polygon') {
    rawCoords = geojson.coordinates[0];
  } else if (geojson.type === 'MultiPolygon') {
    // Lấy phần đa giác lớn nhất trong MultiPolygon
    let maxLen = 0;
    for (const poly of geojson.coordinates) {
      if (poly[0] && poly[0].length > maxLen) {
        maxLen = poly[0].length;
        rawCoords = poly[0];
      }
    }
  } else {
    throw new Error(`Kiểu dữ liệu hình học không hỗ trợ: ${geojson.type}`);
  }

  // Bỏ điểm cuối trùng điểm đầu theo chuẩn GeoJSON
  if (
    rawCoords.length >= 2 &&
    rawCoords[0][0] === rawCoords[rawCoords.length - 1][0] &&
    rawCoords[0][1] === rawCoords[rawCoords.length - 1][1]
  ) {
    rawCoords = rawCoords.slice(0, -1);
  }

  const points: CoordinatePoint[] = rawCoords.map(([lng, lat]) => ({
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  }));

  const simplified = simplifyPolygon(points, 120);
  console.log(`✅ Đã tìm thấy ranh giới: ${item.display_name} (${simplified.length} đỉnh mốc)`);
  const adminLevel = item.extratags?.admin_level ? Number(item.extratags.admin_level) : undefined;
  return {boundary: simplified, adminLevel, name: item.display_name};
}

/**
 * Đọc file BĐS, tự động nạp boundaryPolygon theo tên đơn vị hành chính và lưu lại
 */
export async function updatePropertyBoundary(
  filePath: string,
  query: string,
  source: OsmSourceOption = 'auto',
  osmId?: number
): Promise<Property> {
  source = validateOsmSource(source);
  const fullPath = fromRoot(filePath);
  const property = await readProperty(fullPath);
  const meta = getLocalOsmMeta();

  let boundary: CoordinatePoint[] = [];
  let adminLevel: number | undefined;
  let boundaryName = query;

  if (source === 'local') {
    if (!meta) {
      throw new Error('Chưa có dữ liệu OSM local. Vui lòng chạy "npm.cmd run video -- osm-sync" trước khi dùng --source local.');
    }
    console.log(`📡 Sử dụng nguồn dữ liệu local (OpenStreetMap Việt Nam · ngày ${meta.sourceLastModified || meta.processedAt})`);
    const res = await fetchLocalBoundary(query, osmId);
    boundary = res.boundary;
    adminLevel = res.adminLevel;
    boundaryName = res.name;
  } else if (source === 'auto' && meta) {
    console.log(`📡 Phát hiện dữ liệu OSM local hợp lệ: ngày ${meta.sourceLastModified || meta.processedAt}`);
    const res = await fetchLocalBoundary(query, osmId);
    boundary = res.boundary;
    adminLevel = res.adminLevel;
    boundaryName = res.name;
  } else {
    console.log(`📡 Sử dụng nguồn dữ liệu online (Nominatim GeoJSON)`);
    const res = await fetchAdministrativeBoundary(query);
    boundary = res.boundary;
    adminLevel = res.adminLevel;
    boundaryName = res.name;
  }

  if (adminLevel !== undefined) {
    console.log(`📍 Cấp hành chính (admin_level): ${adminLevel} — "${boundaryName}"`);
  }
  console.warn('⚠️  Cảnh báo: Ranh hành chính từ OSM có thể chưa cập nhật theo sáp nhập 1/7/2025 — kiểm tra trước khi dùng.');

  // Đảm bảo không có điểm cuối trùng điểm đầu
  if (
    boundary.length >= 2 &&
    Math.abs(boundary[0].lat - boundary[boundary.length - 1].lat) < 1e-6 &&
    Math.abs(boundary[0].lng - boundary[boundary.length - 1].lng) < 1e-6
  ) {
    boundary = boundary.slice(0, -1);
  }

  property.boundaryPolygon = boundary;
  if (!property.dataSources) property.dataSources = [];
  if (!property.dataSources.includes('osm')) property.dataSources.push('osm');

  await writeFile(fullPath, JSON.stringify(property, null, 2) + '\n', 'utf8');

  console.log(`🎉 Đã cập nhật ${boundary.length} đỉnh ranh giới vào ${filePath}`);
  return property;
}

async function main() {
  const {values} = parseArgs({
    options: {
      input: {type: 'string'},
      query: {type: 'string'},
      source: {type: 'string', default: 'auto'},
      'osm-id': {type: 'string'},
      help: {type: 'boolean'},
    },
  });

  if (values.help || !values.input || !values.query) {
    console.log(`
Map BĐS — Tự động khoanh ranh giới hành chính (OpenStreetMap GeoJSON / Local)

Cách dùng:
  npm run video -- fetch-boundary --input examples/ho-tay.json --query "Phường Quảng An, Tây Hồ" [--source auto|local|online] [--osm-id 12345]
`);
    return;
  }

  const source = validateOsmSource(values.source || 'auto');
  const osmId = values['osm-id'] ? Number(values['osm-id']) : undefined;
  await updatePropertyBoundary(values.input, values.query, source, osmId);
}

if (process.argv[1]?.includes('boundary')) {
  main().catch((err) => {
    console.error('❌ Lỗi:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

