import {writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {fromRoot, readProperty} from './project';
import type {Property, CoordinatePoint} from '../src/schema';

/**
 * Rút gọn mảng tọa độ tuyến đường nếu quá dày (đảm bảo <= maxPoints)
 */
function simplifyPath(points: CoordinatePoint[], maxPoints = 150): CoordinatePoint[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const sampled: CoordinatePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.floor(i * step)]);
  }
  // Giữ lại điểm cuối cùng
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled[sampled.length - 1] = points[points.length - 1];
  }
  return sampled;
}

/**
 * Tìm tọa độ điểm đến qua OpenStreetMap Nominatim
 */
export async function geocodeLocation(query: string): Promise<{lat: number; lng: number; displayName: string}> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'MapBDS-Router/1.0 (contact: support@mapbds.local)',
      'Accept-Language': 'vi,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Không tìm được địa điểm "${query}" (${res.status})`);
  const results = await res.json() as any[];
  if (!results || results.length === 0) throw new Error(`Không tìm thấy tọa độ cho: "${query}"`);
  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    displayName: results[0].display_name,
  };
}

/**
 * Tìm tuyến đường ô tô thực tế từ A đến B qua OpenStreetMap OSRM Routing
 */
export async function fetchDrivingRoute(
  from: CoordinatePoint,
  to: CoordinatePoint,
  name?: string
): Promise<{name: string; path: CoordinatePoint[]; distanceKm: number; durationMin: number}> {
  console.log(`🚗 Đang tính toán tuyến đường từ (${from.lat}, ${from.lng}) đến (${to.lat}, ${to.lng})...`);
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  const res = await fetch(osrmUrl, {
    headers: {'User-Agent': 'MapBDS-Router/1.0'},
  });

  if (!res.ok) {
    throw new Error(`OSM Routing API trả về lỗi (${res.status}): ${res.statusText}`);
  }

  const data = await res.json() as any;
  if (!data?.routes || data.routes.length === 0) {
    throw new Error('Không tìm thấy đường bộ khả dụng nối hai điểm này.');
  }

  const route = data.routes[0];
  const distanceKm = Number((route.distance / 1000).toFixed(1));
  const durationMin = Math.round(route.duration / 60);

  const rawCoords: number[][] = route.geometry.coordinates;
  const points: CoordinatePoint[] = rawCoords.map(([lng, lat]) => ({
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  }));

  const simplified = simplifyPath(points, 150);
  console.log(`✅ Tuyến đường: ${distanceKm} km · ~${durationMin} phút di chuyển (${simplified.length} điểm tim đường)`);

  return {
    name: name || `Kết nối giao thông (${distanceKm} km)`,
    path: simplified,
    distanceKm,
    durationMin,
  };
}

/**
 * Đọc file BĐS, tìm tuyến đường đến điểm đến chỉ định và nạp vào trường routes
 */
export async function updatePropertyRoute(
  filePath: string,
  destinationQuery: string,
  routeName?: string
): Promise<Property> {
  const fullPath = fromRoot(filePath);
  const property = await readProperty(fullPath);

  const dest = await geocodeLocation(destinationQuery);
  console.log(`📍 Điểm đến: ${dest.displayName}`);

  const route = await fetchDrivingRoute(
    property.gps,
    {lat: dest.lat, lng: dest.lng},
    routeName || destinationQuery
  );

  property.routes = property.routes || [];
  // Thay thế nếu trùng tên, hoặc thêm mới (tối đa 4 tuyến)
  const existingIdx = property.routes.findIndex(r => r.name === route.name);
  if (existingIdx >= 0) {
    property.routes[existingIdx] = route;
  } else {
    property.routes.push(route);
  }
  if (property.routes.length > 4) property.routes = property.routes.slice(-4);

  if (!property.dataSources) property.dataSources = [];
  if (!property.dataSources.includes('osm')) property.dataSources.push('osm');

  await writeFile(fullPath, JSON.stringify(property, null, 2) + '\n', 'utf8');

  console.log(`🎉 Đã cập nhật tuyến đường "${route.name}" vào ${filePath}`);
  return property;
}

async function main() {
  const {values} = parseArgs({
    options: {
      input: {type: 'string'},
      to: {type: 'string'},
      name: {type: 'string'},
      help: {type: 'boolean'},
    },
  });

  if (values.help || !values.input || !values.to) {
    console.log(`
Map BĐS — Tính toán tuyến đường ô tô thực tế A → B (OSM Routing)

Cách dùng:
  npm run video -- fetch-route --input examples/ho-tay.json --to "Sân bay Quốc tế Nội Bài" [--name "Kết nối Sân Bay"]
`);
    return;
  }

  await updatePropertyRoute(values.input, values.to, values.name);
}

if (process.argv[1]?.includes('route')) {
  main().catch((err) => {
    console.error('❌ Lỗi:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
