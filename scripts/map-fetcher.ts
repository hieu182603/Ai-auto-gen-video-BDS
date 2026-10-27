import {writeFile, mkdir} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {fromRoot, readProperty} from './project';
import type {Property} from '../src/schema';
import {staticImageFrame, type GeoFrame} from '../src/geo';

/**
 * Tải ảnh vệ tinh Mapbox / Google Maps Static API (nếu có key) hoặc ESRI World Imagery (miễn phí)
 */
export async function fetchSatelliteMap(
  lat: number,
  lng: number,
  options: {
    zoom?: number;
    width?: number;
    height?: number;
    apiKey?: string;
    mapboxToken?: string;
    style?: string;
    provider?: 'auto' | 'mapbox' | 'google' | 'esri';
  } = {}
): Promise<{buffer: Buffer; source: 'mapbox' | 'google' | 'esri'; geo: GeoFrame}> {
  const zoom = options.zoom || Number(process.env.MAP_SATELLITE_ZOOM) || 16;
  const width = options.width || 1280;
  const height = options.height || 800;
  const provider = options.provider || (process.env.MAP_DEFAULT_PROVIDER as 'auto' | 'mapbox' | 'google' | 'esri') || 'auto';
  const mapboxToken = options.mapboxToken || process.env.MAPBOX_ACCESS_TOKEN;
  const apiKey = options.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  const style = options.style || process.env.MAPBOX_STYLE || 'satellite-v9';

  // 1. Thử Mapbox Static Satellite API nếu có Token
  if (mapboxToken && (provider === 'auto' || provider === 'mapbox')) {
    try {
      const w = Math.min(width, 1280);
      const h = Math.min(height, 1280);
      console.log(`📡 Đang tải ảnh vệ tinh Mapbox (${style}) quanh (${lat}, ${lng}) - Zoom: ${zoom}...`);
      const mapboxUrl = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${lng},${lat},${zoom},0,0/${w}x${h}@2x?access_token=${mapboxToken}`;
      const res = await fetch(mapboxUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        console.log(`✅ Đã tải thành công từ Mapbox (${(arrayBuf.byteLength / 1024).toFixed(1)} KB)`);
        const geo = staticImageFrame({center: {lat, lng}, zoom, width: w, height: h, scale: 2, tileSize: 512});
        return {buffer: Buffer.from(arrayBuf), source: 'mapbox', geo};
      } else {
        console.warn(`Mapbox trả về mã ${res.status}, chuyển sang nguồn tiếp theo...`);
      }
    } catch (err) {
      console.warn('Lỗi kết nối Mapbox API:', err);
    }
  }

  // 2. Thử Google Maps Static Satellite API nếu có Key
  if (apiKey && (provider === 'auto' || provider === 'google')) {
    try {
      console.log(`📡 Đang tải ảnh vệ tinh Google Maps Static API quanh (${lat}, ${lng}) - Zoom: ${zoom}...`);
      // Google Static Maps max size is 640x640 with scale=2 -> 1280x1280
      const googleUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=640x640&scale=2&maptype=satellite&key=${apiKey}`;
      const res = await fetch(googleUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        console.log(`✅ Đã tải thành công từ Google Maps (${(arrayBuf.byteLength / 1024).toFixed(1)} KB)`);
        const geo = staticImageFrame({center: {lat, lng}, zoom, width: 640, height: 640, scale: 2, tileSize: 256});
        return {buffer: Buffer.from(arrayBuf), source: 'google', geo};
      } else {
        console.warn(`Google Maps trả về mã ${res.status}, chuyển sang nguồn ảnh vệ tinh độ phân giải cao ArcGIS/ESRI...`);
      }
    } catch (err) {
      console.warn('Lỗi kết nối Google Maps API, chuyển sang nguồn dự phòng ArcGIS/ESRI:', err);
    }
  }

  // 3. Nguồn vệ tinh độ nét cao ArcGIS World Imagery (Hoàn toàn miễn phí, không cần key)
  console.log(`🌍 Đang tải ảnh vệ tinh độ nét cao ArcGIS World Imagery quanh (${lat}, ${lng})...`);
  // Tính toán bounding box tương ứng với zoom level
  const delta = 0.36 / Math.pow(2, zoom - 11); // xấp xỉ theo zoom level
  const minLng = lng - delta * 1.6;
  const maxLng = lng + delta * 1.6;
  const minLat = lat - delta;
  const maxLat = lat + delta;

  const esriUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326&size=${width},${height}&format=jpg&f=image`;

  const res = await fetch(esriUrl);
  if (!res.ok) {
    throw new Error(`Không tải được ảnh vệ tinh từ server (mã lỗi: ${res.status})`);
  }
  const arrayBuf = await res.arrayBuffer();
  console.log(`✅ Đã tải thành công ảnh vệ tinh vệ tinh thực tế (${(arrayBuf.byteLength / 1024).toFixed(1)} KB)`);
  // imageSR=4326: ảnh tuyến tính theo độ, tỉ lệ bbox (3.2δ × 2δ) khớp tỉ lệ ảnh mặc định 1280 × 800.
  const geo: GeoFrame = {projection: 'equirectangular', west: minLng, south: minLat, east: maxLng, north: maxLat, width, height};
  return {buffer: Buffer.from(arrayBuf), source: 'esri', geo};
}

/**
 * Đọc file BĐS, tải ảnh vệ tinh theo tọa độ gps, lưu vào public/media và cập nhật JSON
 */
export async function updatePropertySatelliteMap(
  filePath: string,
  options: {zoom?: number; style?: string} = {}
): Promise<Property> {
  const fullPath = fromRoot(filePath);
  const property = await readProperty(fullPath);

  const {lat, lng} = property.gps;
  const zoom = options.zoom || Number(process.env.MAP_SATELLITE_ZOOM) || 17;

  console.log(`🌌 Tải cấp độ 1: Toàn cảnh Trái Đất / Vũ trụ (Zoom 4)...`);
  const spaceRes = await fetchSatelliteMap(lat, lng, {zoom: 4, style: options.style});

  console.log(`🏙️ Tải cấp độ 2: Toàn cảnh Thành phố / Khu vực (Zoom 12)...`);
  const cityRes = await fetchSatelliteMap(lat, lng, {zoom: 12, style: options.style});

  console.log(`🏡 Tải cấp độ 3: Cận cảnh Thửa đất sắc nét (Zoom ${zoom})...`);
  const plotRes = await fetchSatelliteMap(lat, lng, {zoom, style: options.style});

  const mediaDir = fromRoot('public/media');
  await mkdir(mediaDir, {recursive: true});

  const spaceRel = `media/${property.id}-space.jpg`;
  const cityRel = `media/${property.id}-city.jpg`;
  const plotRel = `media/${property.id}-satellite.jpg`;

  await writeFile(path.join(mediaDir, `${property.id}-space.jpg`), spaceRes.buffer);
  await writeFile(path.join(mediaDir, `${property.id}-city.jpg`), cityRes.buffer);
  await writeFile(path.join(mediaDir, `${property.id}-satellite.jpg`), plotRes.buffer);

  // Cập nhật trường media và attribution
  property.media = property.media || {};
  property.media.spaceImage = spaceRel;
  property.media.cityImage = cityRel;
  property.media.aerialImage = plotRel;
  property.media.geo = {spaceImage: spaceRes.geo, cityImage: cityRes.geo, aerialImage: plotRes.geo};
  property.media.attribution = plotRes.source === 'mapbox'
    ? 'Ảnh vệ tinh độ phân giải cao © Mapbox © Maxar'
    : plotRes.source === 'google'
    ? 'Ảnh vệ tinh bản đồ © Google Maps'
    : 'Ảnh vệ tinh độ phân giải cao © ESRI World Imagery';

  await writeFile(fullPath, JSON.stringify(property, null, 2) + '\n', 'utf8');

  console.log(`🎉 Đã cập nhật đủ 3 cấp độ vệ tinh (Vũ trụ → Thành phố → Thửa đất):`);
  console.log(`   - Không gian (Zoom 4):  ${spaceRel}`);
  console.log(`   - Thành phố (Zoom 12): ${cityRel}`);
  console.log(`   - Lô đất (Zoom ${zoom}):    ${plotRel}`);
  console.log(`   - Nguồn: ${property.media.attribution}`);

  return property;
}

async function main() {
  const {values} = parseArgs({
    options: {
      input: {type: 'string'},
      zoom: {type: 'string', default: '16'},
      lat: {type: 'string'},
      lng: {type: 'string'},
      output: {type: 'string'},
      key: {type: 'string'},
      help: {type: 'boolean'},
    },
  });

  if (values.help) {
    console.log(`
Map BĐS — Tải ảnh bản đồ vệ tinh 3D (Google Maps / ArcGIS World Imagery)

Cách dùng:
  npm run video -- fetch-map --input examples/ho-tay.json [--zoom 16]
  npm run fetch-map -- --input examples/ho-tay.json
  npm run fetch-map -- --lat 21.0625 --lng 105.8153 --output public/media/test-sat.jpg
`);
    return;
  }

  if (values.input) {
    await updatePropertySatelliteMap(values.input, {zoom: Number(values.zoom)});
  } else if (values.lat && values.lng) {
    const lat = Number(values.lat);
    const lng = Number(values.lng);
    const zoom = Number(values.zoom || 16);
    const out = values.output ? fromRoot(values.output) : fromRoot('public/media/custom-satellite.jpg');
    const {buffer, source} = await fetchSatelliteMap(lat, lng, {zoom, apiKey: values.key});
    await writeFile(out, buffer);
    console.log(`✅ Đã lưu ảnh vệ tinh vào ${out} (${source})`);
  } else {
    throw new Error('Vui lòng cung cấp --input <file.json> hoặc --lat <vĩ độ> --lng <kinh độ>');
  }
}

if (process.argv[1]?.includes('map-fetcher')) {
  main().catch((err) => {
    console.error('❌ Lỗi tải bản đồ:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
