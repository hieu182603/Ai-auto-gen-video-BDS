import {parseArgs} from 'node:util';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {propertySchema, type Property} from '../src/schema';
import {fromRoot, syncModels} from './project';
import {resolveAdminBoundary, validateOsmSource} from './boundary';
import {geocodeLocation, fetchDrivingRoute} from './route';
import {scanAmenitiesOSM, toPropertyAmenity} from './amenities';
import {getLocalOsmMeta, scanLocalAmenities} from './osm-local';

/**
 * Tự động chọn mô hình 3D tối ưu từ kho 16 models dựa vào ngữ nghĩa BĐS
 */
export function autoSelect3DModel(p: Partial<Property>): string {
  const text = `${p.title || ''} ${p.address || ''} ${p.specs?.stories || ''} tang`.toLowerCase();

  if (text.includes('shophouse') || text.includes('kinh doanh') || text.includes('mặt phố')) {
    return 'models/shophouse.glb';
  }
  if (text.includes('hồ bơi') || text.includes('dinh thự') || text.includes('nghỉ dưỡng')) {
    return 'models/biet-thu-sang-trong.glb';
  }
  if (text.includes('mái thái') || text.includes('nhà vườn')) {
    return 'models/biet-thu-mai-thai.glb';
  }
  if (text.includes('hiện đại') || text.includes('compound') || text.includes('villa')) {
    return 'models/biet-thu-hien-dai.glb';
  }
  if (text.includes('chung cư') || text.includes('căn hộ') || text.includes('condo')) {
    return 'models/chung-cu-cao-tang.glb';
  }
  if (text.includes('văn phòng') || text.includes('tòa nhà')) {
    return 'models/toa-nha-van-phong.glb';
  }
  if (p.specs?.stories && p.specs.stories >= 4) {
    return 'models/nha-pho-4-tang.glb';
  }
  if (p.specs?.stories && p.specs.stories === 3) {
    return 'models/nha-pho-3-tang.glb';
  }
  return 'models/biet-thu-mai-thai.glb';
}

/**
 * Tự động chọn phong cách biển hiệu & chữ BĐS
 */
export function autoSelectBadgeStyle(p: Partial<Property>): 'two_legs' | 'signboard' | 'sold_stamp' | 'gold24k' | 'platinum' | 'bronze' | 'emerald' | 'neon' {
  const text = `${p.title || ''} ${p.badge?.text || ''} ${p.badge?.status || ''}`.toLowerCase();

  if (text.includes('đã bán') || text.includes('chốt cọc') || text.includes('sold')) {
    return 'sold_stamp';
  }
  if (text.includes('đất nền') || text.includes('thổ cư') || text.includes('mảnh đất') || text.includes('phân lô')) {
    return 'two_legs';
  }
  if (text.includes('kim cương') || text.includes('triệu đô') || text.includes('penthouse') || text.includes('view hồ')) {
    return 'gold24k';
  }
  if (text.includes('công nghệ') || text.includes('smart city')) {
    return 'neon';
  }
  return 'two_legs';
}

async function main() {
  const {values} = parseArgs({
    options: {
      input: {type: 'string'},
      boundary: {type: 'string'},
      to: {type: 'string'},
      scan: {type: 'boolean', default: false},
      model: {type: 'string'},
      style: {type: 'string'},
      output: {type: 'string'},
      source: {type: 'string', default: 'auto'},
      render: {type: 'boolean', default: false},
      draft: {type: 'boolean', default: false},
      help: {type: 'boolean'},
    },
  });

  const source = validateOsmSource(values.source || 'auto');

  if (values.help || !values.input) {
    console.log(`
Map BĐS — Tự Động Hóa Toàn Diện Pipeline Biên Tập Video
Tự động gắn ranh giới GIS, tính tuyến đường, quét tiện ích và chọn mô hình 3D.

Cách dùng:
  npm run auto -- --input examples/tay-ho.json [tùy chọn]

Tùy chọn:
  --boundary <tên phường/xã>  Lấy ranh hành chính từ OpenStreetMap vào adminBoundary
  --to <điểm đến>             Tính tuyến đường và cự ly (ví dụ: "Sân bay Nội Bài")
  --scan                      Tự động quét tiện ích lân cận (bán kính 2km)
  --source <auto|local|online> Nguồn dữ liệu OSM (mặc định: auto)
  --model <file.glb>          Chỉ định mô hình 3D (mặc định: tự động chọn thông minh)
  --style <style>             Kiểu biển: two_legs, signboard, sold_stamp, gold24k, neon...
  --output <file.json>        Lưu ra file mới (mặc định: ghi đè file input)
  --render                    Tự động render video sau khi xử lý xong
  --draft                     Render nháp tốc độ cao (960x540)
`);
    return;
  }

  const inputPath = fromRoot(values.input);
  const rawText = await readFile(inputPath, 'utf8');
  let property: Property = propertySchema.parse(JSON.parse(rawText));

  console.log(`\n🎬 BẮT ĐẦU TỰ ĐỘNG HÓA BIÊN TẬP CHO: "${property.title}"`);

  // 1. Đồng bộ kho 3D models
  await syncModels();

  // 2. Tự động chọn mô hình 3D nếu chưa có
  if (!property.media?.model3d || values.model) {
    const selectedModel = values.model || autoSelect3DModel(property);
    property.media = property.media || {};
    property.media.model3d = selectedModel;
    console.log(`🏠 Tự động gán mô hình 3D: ${selectedModel}`);
  }

  // 3. Tự động chọn phong cách biển hiệu / Text FX
  if (property.badge) {
    property.badge.style = (values.style as any) || property.badge.style || autoSelectBadgeStyle(property);
    console.log(`🏷️ Phong cách biển hiệu / chữ: ${property.badge.style}`);
  }

  const meta = getLocalOsmMeta();
  const useLocal = source === 'local' || (source === 'auto' && meta);

  // 4. Tự động lấy ranh giới hành chính nếu có cờ --boundary
  const boundaryQuery = values.boundary;
  if (boundaryQuery) {
    console.log(`🗺️ Đang tự động truy vấn ranh giới hành chính: "${boundaryQuery}"...`);
    // Ranh hành chính vào adminBoundary; boundaryPolygon (ranh thửa đất) giữ nguyên.
    property.adminBoundary = await resolveAdminBoundary(boundaryQuery, source);
    if (!property.dataSources) property.dataSources = [];
    if (!property.dataSources.includes('osm')) property.dataSources.push('osm');
  }

  // 5. Tự động tính tuyến đường nếu có cờ --to
  const toDestination = values.to;
  if (toDestination) {
    console.log(`🚗 Đang tính tuyến đường tới: "${toDestination}"...`);
    const dest = await geocodeLocation(toDestination);
    const route = await fetchDrivingRoute(property.gps, {lat: dest.lat, lng: dest.lng}, toDestination);
    property.routes = property.routes || [];
    property.routes = [route, ...property.routes.filter(r => r.name !== route.name)].slice(0, 4);
    if (!property.dataSources) property.dataSources = [];
    if (!property.dataSources.includes('osm')) property.dataSources.push('osm');
  }

  // 6. Tự động quét tiện ích lân cận nếu có cờ --scan hoặc tiện ích trống
  if (values.scan || property.amenities.length < 2) {
    console.log(`📡 Đang quét radar tiện ích lân cận quanh tọa độ GPS...`);
    try {
      if (source === 'local' && !meta) {
        throw new Error('Chưa có dữ liệu OSM local. Vui lòng chạy "npm.cmd run video -- osm-sync" trước.');
      }
      const osmItems = useLocal
        ? await scanLocalAmenities(property.gps.lat, property.gps.lng, 2000)
        : await scanAmenitiesOSM(property.gps.lat, property.gps.lng, 2000);
      if (osmItems.length > 0) {
        property.amenities = osmItems.slice(0, 4).map(toPropertyAmenity);
        if (!property.dataSources) property.dataSources = [];
        if (!property.dataSources.includes('osm')) property.dataSources.push('osm');
      } else {
        console.warn('⚠️ Không tìm thấy tiện ích có tên quanh BĐS; giữ nguyên danh sách hiện có.');
      }
    } catch (err) {
      console.warn(`⚠️ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Lưu file kết quả
  const outputPath = values.output ? fromRoot(values.output) : inputPath;
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, JSON.stringify(property, null, 2) + '\n', 'utf8');
  console.log(`\n💾 ĐÃ LƯU DỮ LIỆU ĐẦY ĐỦ VÀO: ${outputPath}`);

  // 8. Tự động render nếu được yêu cầu
  if (values.render) {
    console.log('\n🚀 Bắt đầu render video tự động...');
    const draftArg = values.draft ? '--draft' : '';
    const {spawnSync} = await import('node:child_process');
    const res = spawnSync('npm.cmd', ['run', 'video', '--', 'render', '--input', path.relative(fromRoot(''), outputPath).replace(/\\/g, '/'), draftArg].filter(Boolean), {
      stdio: 'inherit',
      cwd: fromRoot(''),
    });
    if (res.status !== 0) {
      throw new Error(`Render thất bại với mã lỗi ${res.status}`);
    }
  }

  console.log('✅ HOÀN TẤT TỰ ĐỘNG HÓA PIPELINE BĐS!\n');
}

main().catch((err) => {
  console.error('❌ Lỗi:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
