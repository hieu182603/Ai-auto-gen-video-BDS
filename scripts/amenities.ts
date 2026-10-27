import {readFile, writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {fromRoot, readProperty} from './project';
import type {Property} from '../src/schema';
import {distanceMeters} from '../src/geo';
import {getLocalOsmMeta, scanLocalAmenities} from './osm-local';
import {validateOsmSource} from './boundary';

export interface ScannedAmenity {
  name: string;
  /** Khoảng cách đường chim bay từ gps của BĐS, không phải quãng đường đi. */
  distanceM: number;
  lat: number;
  lng: number;
  category: 'education' | 'health' | 'shopping' | 'leisure' | 'other';
}

/** Chuyển kết quả quét thành mục `amenities` trong JSON BĐS (giữ tọa độ để vẽ lên bản đồ). */
export function toPropertyAmenity(s: ScannedAmenity): Property['amenities'][number] {
  return {name: s.name.slice(0, 65), distanceM: s.distanceM, lat: s.lat, lng: s.lng, category: s.category};
}

/**
 * Khoảng cách đường chim bay giữa 2 điểm GPS (mét, làm tròn)
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(distanceMeters({lat: lat1, lng: lon1}, {lat: lat2, lng: lon2}));
}

/**
 * Quét tiện ích thực tế qua Google Places API (nếu có GOOGLE_MAPS_API_KEY)
 */
export async function scanAmenitiesGooglePlaces(
  lat: number,
  lng: number,
  radiusM: number = 2000,
  apiKey: string = process.env.GOOGLE_MAPS_API_KEY || ''
): Promise<ScannedAmenity[]> {
  if (!apiKey) return [];
  const items: ScannedAmenity[] = [];
  const seenNames = new Set<string>();

  const typesToCategory: Array<{type: string; category: ScannedAmenity['category']}> = [
    {type: 'school', category: 'education'},
    {type: 'hospital', category: 'health'},
    {type: 'shopping_mall', category: 'shopping'},
    {type: 'park', category: 'leisure'},
  ];

  for (const {type, category} of typesToCategory) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=${type}&language=vi&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.results?.length) continue;

      for (const place of data.results.slice(0, 3)) {
        const name = (place.name || '').trim();
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        const pLat = place.geometry?.location?.lat;
        const pLng = place.geometry?.location?.lng;
        // Không có tọa độ thì không biết khoảng cách thật: bỏ qua thay vì đoán.
        if (typeof pLat !== 'number' || typeof pLng !== 'number') continue;
        items.push({name, distanceM: haversineDistance(lat, lng, pLat, pLng), lat: pLat, lng: pLng, category});
      }
    } catch {
      // bỏ qua lỗi từng loại để tiếp tục
    }
  }

  return items;
}

/**
 * Quét tiện ích thực tế xung quanh tọa độ qua OpenStreetMap Overpass API (Miễn phí, không cần Key)
 */
export async function scanAmenitiesOSM(
  lat: number,
  lng: number,
  radiusM: number = 2000
): Promise<ScannedAmenity[]> {
  const overpassQuery = `
[out:json][timeout:20];
(
  node["amenity"~"school|kindergarten|hospital|clinic|marketplace|pharmacy"](around:${radiusM},${lat},${lng});
  node["shop"~"supermarket|convenience|mall"](around:${radiusM},${lat},${lng});
  node["leisure"~"park|playground"](around:${radiusM},${lat},${lng});
  way["leisure"="park"](around:${radiusM},${lat},${lng});
  node["natural"="water"](around:${radiusM},${lat},${lng});
  way["natural"="water"](around:${radiusM},${lat},${lng});
);
out center 40;
`.trim();

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  let data: any = null;
  let reached = false;
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        method: 'POST',
        // Overpass từ chối (406) request không có User-Agent nhận dạng.
        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MapBDS-AmenityScan/1.0'},
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        reached = true;
        data = await res.json();
        if (data?.elements && data.elements.length > 0) break;
      }
    } catch {
      // thử endpoint tiếp theo
    }
  }

  if (!reached) {
    throw new Error('Không kết nối được Overpass API (OpenStreetMap). Kiểm tra mạng rồi thử lại; dữ liệu tiện ích hiện có được giữ nguyên.');
  }

  return parseOverpassElements(data?.elements ?? [], lat, lng);
}

/**
 * Lọc phần tử Overpass thành tối đa 6 tiện ích có tên, ưu tiên đa dạng danh mục.
 */
export function parseOverpassElements(elements: any[], lat: number, lng: number): ScannedAmenity[] {
  const items: ScannedAmenity[] = [];
  const seenNames = new Set<string>();

  {
    for (const el of elements) {
      const tags = el.tags || {};
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat === undefined || elLon === undefined) continue;

      // Phần tử OSM không có tên thì bỏ, không tự đặt tên chung chung.
      const name = tags.name || tags['name:vi'] || tags['name:en'];
      let category: ScannedAmenity['category'] = 'other';

      if (tags.amenity === 'school' || tags.amenity === 'kindergarten') {
        category = 'education';
      } else if (tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.amenity === 'pharmacy') {
        category = 'health';
      } else if (tags.amenity === 'marketplace' || tags.shop === 'supermarket' || tags.shop === 'mall') {
        category = 'shopping';
      } else if (tags.leisure === 'park' || tags.natural === 'water') {
        category = 'leisure';
      }

      if (!name) continue;

      // Chuẩn hóa tên gọn gàng (max 50 ký tự)
      const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, 50);
      if (seenNames.has(cleanName.toLowerCase())) continue;
      seenNames.add(cleanName.toLowerCase());

      const dist = haversineDistance(lat, lng, elLat, elLon);
      items.push({
        name: cleanName,
        distanceM: dist,
        lat: elLat,
        lng: elLon,
        category,
      });
    }
  }

  // Sắp xếp theo khoảng cách từ gần đến xa
  items.sort((a, b) => a.distanceM - b.distanceM);

  // Chọn lọc tối đa 6 tiện ích với sự đa dạng danh mục (ưu tiên mỗi loại ít nhất 1 cái)
  const selected: ScannedAmenity[] = [];
  const categories: Array<ScannedAmenity['category']> = ['education', 'shopping', 'health', 'leisure'];

  for (const cat of categories) {
    const match = items.find((it) => it.category === cat && !selected.includes(it));
    if (match) selected.push(match);
  }

  // Điền thêm các tiện ích gần nhất còn lại cho đủ 4 - 6 tiện ích
  for (const it of items) {
    if (selected.length >= 6) break;
    if (!selected.includes(it)) selected.push(it);
  }

  return selected;
}

export type OsmSourceOption = 'auto' | 'local' | 'online';

/**
 * Đọc file BĐS, quét tiện ích xung quanh tọa độ gps, cập nhật và lưu lại file JSON
 */
export async function updatePropertyAmenities(
  filePath: string,
  radiusM: number = 2000,
  source: OsmSourceOption = 'auto'
): Promise<Property> {
  source = validateOsmSource(source);
  const fullPath = fromRoot(filePath);
  const property = await readProperty(fullPath);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  console.log(`🌐 Đang quét tiện ích thực tế quanh tọa độ (${property.gps.lat}, ${property.gps.lng}) trong bán kính ${radiusM}m...`);
  
  let scanned: ScannedAmenity[] = [];
  const meta = getLocalOsmMeta();
  let usedSourceDesc = 'online (Overpass API / Google Places)';

  if (source === 'local') {
    if (!meta) {
      throw new Error('Chưa có dữ liệu OSM local. Vui lòng chạy "npm.cmd run video -- osm-sync" trước khi dùng --source local.');
    }
    usedSourceDesc = `local (OpenStreetMap Việt Nam · ngày ${meta.sourceLastModified || meta.processedAt})`;
    console.log(`📡 Nguồn dữ liệu: ${usedSourceDesc}`);
    scanned = await scanLocalAmenities(property.gps.lat, property.gps.lng, radiusM);
  } else if (source === 'auto' && meta) {
    usedSourceDesc = `local (OpenStreetMap Việt Nam · ngày ${meta.sourceLastModified || meta.processedAt})`;
    console.log(`📡 Nguồn dữ liệu tự động: ${usedSourceDesc}`);
    scanned = await scanLocalAmenities(property.gps.lat, property.gps.lng, radiusM);
  } else {
    // online
    console.log(`📡 Nguồn dữ liệu: ${usedSourceDesc}`);
    if (apiKey) {
      console.log(`📍 Tìm kiếm qua Google Places API (Key đã cấu hình)...`);
      scanned = await scanAmenitiesGooglePlaces(property.gps.lat, property.gps.lng, radiusM, apiKey);
    }

    if (scanned.length < 3) {
      console.log(`📡 Quét bổ sung từ mạng lưới OpenStreetMap Radar...`);
      const osmItems = await scanAmenitiesOSM(property.gps.lat, property.gps.lng, radiusM);
      for (const item of osmItems) {
        if (scanned.length >= 6) break;
        if (!scanned.some((s) => s.name.toLowerCase() === item.name.toLowerCase())) {
          scanned.push(item);
        }
      }
    }
  }

  if (scanned.length === 0) {
    throw new Error(`Không tìm thấy tiện ích có tên trong bán kính ${radiusM} m. Giữ nguyên ${filePath}; thử tăng --radius hoặc nhập tiện ích đã kiểm chứng bằng tay.`);
  }

  property.amenities = scanned.map(toPropertyAmenity);
  if (!property.dataSources) property.dataSources = [];
  if (!property.dataSources.includes('osm')) property.dataSources.push('osm');

  await writeFile(fullPath, JSON.stringify(property, null, 2) + '\n', 'utf8');

  console.log(`✅ Đã cập nhật thành công ${property.amenities.length} tiện ích vào ${filePath}:`);
  console.log('------------------------------------------------------------');
  property.amenities.forEach((a, idx) => {
    console.log(`   ${idx + 1}. 📍 ${a.name.padEnd(35)} : ${a.distanceM} m (đường chim bay)`);
  });
  console.log('------------------------------------------------------------');

  return property;
}

async function main() {
  const {values} = parseArgs({
    options: {
      input: {type: 'string'},
      radius: {type: 'string', default: '2000'},
      source: {type: 'string', default: 'auto'},
      lat: {type: 'string'},
      lng: {type: 'string'},
      help: {type: 'boolean'},
    },
  });

  if (values.help) {
    console.log(`
Map BĐS — Tự động quét tiện ích xung quanh (OpenStreetMap Radar)
Cách dùng:
  npm run video -- scan-amenities --input examples/ho-tay.json [--radius 2500] [--source auto|local|online]
  npm run amenities -- --input examples/ho-tay.json
  npm run amenities -- --lat 21.0625 --lng 105.8153 [--radius 1500] [--source auto|local|online]
`);
    return;
  }

  const source = validateOsmSource(values.source || 'auto');

  if (values.input) {
    await updatePropertyAmenities(values.input, Number(values.radius), source);
  } else if (values.lat && values.lng) {
    const lat = Number(values.lat);
    const lng = Number(values.lng);
    const radius = Number(values.radius || 2000);
    console.log(`🌐 Quét tiện ích quanh (${lat}, ${lng}) bán kính ${radius}m (nguồn: ${source}):`);
    let list: ScannedAmenity[] = [];
    const meta = getLocalOsmMeta();
    if (source === 'local' || (source === 'auto' && meta)) {
      if (!meta) throw new Error('Chưa có dữ liệu OSM local. Chạy "npm run video -- osm-sync" trước.');
      list = await scanLocalAmenities(lat, lng, radius);
    } else {
      list = await scanAmenitiesOSM(lat, lng, radius);
    }
    list.forEach((it, i) => console.log(` ${i + 1}. ${it.name} (${it.distanceM}m) [${it.category}]`));
  } else {
    throw new Error('Vui lòng cung cấp --input <file.json> hoặc --lat <vĩ độ> --lng <kinh độ>');
  }
}

// Chạy trực tiếp qua CLI
if (process.argv[1]?.includes('amenities')) {
  main().catch((err) => {
    console.error('❌ Lỗi quét tiện ích:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
