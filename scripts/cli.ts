import {parseArgs} from 'node:util';
import {z} from 'zod';
import {propertySchema} from '../src/schema';
import {readJson, readProperty, prepare, runPool, validateAssets, fromRoot} from './project';
import {render} from './render';
import {generateSpeech} from './tts';
import {updatePropertyAmenities, type OsmSourceOption} from './amenities';
import {updatePropertySatelliteMap} from './map-fetcher';
import {updatePropertyBoundary, validateOsmSource} from './boundary';
import {updatePropertyRoute} from './route';
import {downloadOsmPbf, processOsmPbf, calculateFileMd5} from './osm-sync';
import {getLocalOsmMeta, queryLines, scanLocalAmenities, loadLocalAdminBoundaries} from './osm-local';
import {existsSync, statSync} from 'node:fs';

const help = `Map BĐS — local video pipeline
  npm run video -- validate --input examples/ho-tay.json
  npm run video -- prepare --input examples/ho-tay.json
  npm run video -- render --input examples/ho-tay.json [--draft] [--format portrait] [--seconds 12]
  npm run video -- still --input examples/ho-tay.json [--frame 550] [--draft]
  npm run video -- batch --input examples/batch.json [--jobs 2] [--draft] [--seconds 12]
  npm run video -- tts --input examples/ho-tay.json [--provider cit-voice|edge-tts|gemini-tts]
  npm run video -- scan-amenities --input examples/ho-tay.json [--radius 2000] [--source auto|local|online]
  npm run video -- fetch-map --input examples/ho-tay.json [--zoom 16]
  npm run video -- fetch-boundary --input examples/ho-tay.json --query "Phường Quảng An, Tây Hồ" [--source auto|local|online] [--osm-id 12345]
  npm run video -- fetch-route --input examples/ho-tay.json --to "Sân bay Nội Bài" [--name "Kết nối Sân Bay"]
  npm run video -- osm-sync [--process-only] [--force]
  npm run video -- osm-query --lat 21.063 --lng 105.8283 [--radius 500] --layer roads|waterways|pois|admin
  npm run script:ai [--text "Mô tả..." | --input post.txt] [--format portrait|landscape]
  npm run video -- schema
  npm run video -- doctor
3D Satellite Map Flyover supports Mapbox Satellite, ArcGIS World Imagery, and Google Maps.
GIS boundaryPolygon supported for glowing cadastral boundary lines.
OSM routing supported for dynamic driving route paths.`;

async function main() {
  const {positionals, values} = parseArgs({allowPositionals: true, options: {
    input: {type: 'string'}, format: {type: 'string'}, seconds: {type: 'string'}, jobs: {type: 'string', default: '2'},
    frame: {type: 'string'}, draft: {type: 'boolean', default: false}, help: {type: 'boolean'},
    provider: {type: 'string'}, voice: {type: 'string'}, radius: {type: 'string'}, zoom: {type: 'string'},
    query: {type: 'string'}, to: {type: 'string'}, name: {type: 'string'},
    source: {type: 'string'}, 'osm-id': {type: 'string'},
    'process-only': {type: 'boolean', default: false}, force: {type: 'boolean', default: false},
    lat: {type: 'string'}, lng: {type: 'string'}, layer: {type: 'string'},
  }});
  const command = positionals[0];
  if (!command || values.help) {console.log(help); return;}
  if (command === 'schema') {console.log(JSON.stringify(z.toJSONSchema(propertySchema), null, 2)); return;}
  if (command === 'doctor') {
    const osmMeta = getLocalOsmMeta();
    console.log(JSON.stringify({
      node: process.version,
      ttsProvider: process.env.TTS_PROVIDER || 'cit-voice (CIT Voice Studio)',
      citVoice: process.env.CIT_VOICE || 'Minh Đức',
      citEndpoint: process.env.CIT_VOICE_ENDPOINT || 'http://127.0.0.1:8001',
      edgeVoice: process.env.EDGE_TTS_VOICE || 'vi-VN-NamMinhNeural',
      geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
      mapboxTokenConfigured: !!process.env.MAPBOX_ACCESS_TOKEN,
      googleMapsKeyConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
      renderer: 'Remotion 4.0.536 / local Chromium',
      model3dSupport: 'GLTF/GLB loader enabled (assets/models/ -> public/models/)',
      map3dFlyoverSupport: 'Mapbox / ArcGIS / Google Maps 3D Flyover enabled',
      gisBoundarySupport: 'boundaryPolygon enabled (SVG + Three.js Neon glow)',
      adminBoundarySupport: 'OpenStreetMap Nominatim boundary radar enabled',
      osmLocalData: osmMeta ? `Sẵn sàng (${osmMeta.counts.pois.toLocaleString()} POIs, ${osmMeta.counts.admin.toLocaleString()} Admin, ${osmMeta.counts.lines.toLocaleString()} Lines)` : 'Chưa đồng bộ (chạy osm-sync)',
      routingEngineSupport: 'OpenStreetMap OSRM driving route engine enabled',
      amenitiesScanner: 'OpenStreetMap Overpass radar enabled',
      aiScriptGenerator: 'npm run script:ai (Gemini 2.5/1.5 Flash)',
      concurrency: process.env.RENDER_CONCURRENCY || '2'
    }, null, 2));
    return;
  }

  if (command === 'osm-sync') {
    const pbfPath = fromRoot('data/osm/vietnam-latest.osm.pbf');
    let metaInfo: {pbfPath: string; md5: string; sourceLastModified: string | null; downloadedAt: string; skipped: boolean};
    if (values['process-only']) {
      if (!existsSync(pbfPath)) {
        throw new Error(`Không tìm thấy file ${pbfPath}. Chạy mà không có --process-only để tải file trước.`);
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
    return;
  }

  if (command === 'osm-query') {
    if (!values.lat || !values.lng) throw new Error('Thiếu --lat và --lng');
    const lat = Number(values.lat);
    const lng = Number(values.lng);
    const radiusM = values.radius ? Number(values.radius) : 500;
    const layer = values.layer || 'roads';

    // Đổi radius mét ra độ xấp xỉ
    const degLat = radiusM / 111195;
    const degLng = radiusM / (111195 * Math.cos((lat * Math.PI) / 180));
    const bbox = {
      west: lng - degLng,
      south: lat - degLat,
      east: lng + degLng,
      north: lat + degLat,
    };

    console.log(`🔍 Truy vấn OSM Local quanh (${lat}, ${lng}) bán kính ${radiusM}m [layer: ${layer}]:`);
    if (layer === 'roads' || layer === 'waterways') {
      const kind = layer === 'roads' ? 'road' : 'waterway';
      const lines = queryLines(bbox, {kinds: [kind]});
      console.log(`   Tổng số tìm thấy: ${lines.length}`);
      console.log('   10 đối tượng đầu tiên:');
      lines.slice(0, 10).forEach((l, i) => console.log(`   ${i + 1}. [${l.class}] ${l.name} (${l.coords.length} điểm)`));
    } else if (layer === 'pois') {
      const pois = await scanLocalAmenities(lat, lng, radiusM);
      console.log(`   Tổng số tìm thấy: ${pois.length}`);
      console.log('   10 đối tượng đầu tiên:');
      pois.slice(0, 10).forEach((p, i) => console.log(`   ${i + 1}. [${p.category}] ${p.name} (${p.distanceM}m)`));
    } else if (layer === 'admin') {
      const admins = await loadLocalAdminBoundaries();
      const matched = admins.filter(a =>
        a.bbox[0] <= bbox.east && a.bbox[2] >= bbox.west &&
        a.bbox[1] <= bbox.north && a.bbox[3] >= bbox.south
      );
      console.log(`   Tổng số tìm thấy: ${matched.length}`);
      console.log('   10 đối tượng đầu tiên:');
      matched.slice(0, 10).forEach((a, i) => console.log(`   ${i + 1}. [cấp ${a.adminLevel}] ${a.name} (ID: ${a.id})`));
    } else {
      throw new Error(`Layer không hợp lệ: ${layer}. Chọn: roads|waterways|pois|admin`);
    }
    return;
  }

  if (!['validate', 'prepare', 'render', 'still', 'batch', 'tts', 'scan-amenities', 'fetch-map', 'fetch-boundary', 'fetch-route'].includes(command)) {
    throw new Error(`Lệnh không hợp lệ: ${command}\n${help}`);
  }
  if (!values.input) throw new Error('Thiếu --input <file.json>');

  const source = validateOsmSource(values.source || 'auto');

  if (command === 'fetch-boundary') {
    if (!values.query) throw new Error('Thiếu --query "Tên phường/xã/quận/tỉnh"');
    const osmId = values['osm-id'] ? Number(values['osm-id']) : undefined;
    await updatePropertyBoundary(values.input, values.query, source, osmId);
    return;
  }
  if (command === 'fetch-route') {
    if (!values.to) throw new Error('Thiếu --to "Tên điểm đến hoặc địa chỉ"');
    await updatePropertyRoute(values.input, values.to, values.name);
    return;
  }
  if (command === 'scan-amenities') {
    await updatePropertyAmenities(values.input, values.radius ? Number(values.radius) : 2000, source);
    return;
  }
  if (command === 'fetch-map') {
    await updatePropertySatelliteMap(values.input, {zoom: values.zoom ? Number(values.zoom) : 16});
    return;
  }
  const overrides = {format: values.format, seconds: values.seconds === undefined ? undefined : Number(values.seconds)};
  if (command === 'batch') {
    const entries = z.array(z.object({input: z.string().min(1), format: z.enum(['landscape', 'portrait']).optional()})).min(1).max(100).parse(await readJson(values.input));
    // Validate every job before starting any renderer.
    const properties = await Promise.all(entries.map(e => readProperty(e.input, {...overrides, format: e.format ?? overrides.format})));
    await Promise.all(properties.map(validateAssets));
    const results = await runPool(properties, Number(values.jobs), p => render(p, {draft: values.draft}));
    const summary = results.map((r, i) => ({job: i, ...r.status === 'fulfilled' ? {status: r.status, output: r.value} : {status: r.status, error: r.reason instanceof Error ? r.reason.message : String(r.reason)}}));
    console.log(JSON.stringify(summary, null, 2));
    if (results.some(r => r.status === 'rejected')) process.exitCode = 1;
    return;
  }
  const p = await readProperty(values.input, overrides);
  await validateAssets(p);
  if (command === 'validate') {console.log(`Hợp lệ: ${p.id}`); return;}
  if (command === 'prepare') {console.log((await prepare(p)).output); return;}
  if (command === 'tts') {await generateSpeech(p, {provider: values.provider, voice: values.voice, saveToInput: values.input}); return;}
  await render(p, {draft: values.draft, still: command === 'still', frame: values.frame === undefined ? undefined : Number(values.frame)});
}
main().catch(error => {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;});

