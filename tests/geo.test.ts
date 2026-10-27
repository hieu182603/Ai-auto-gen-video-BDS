import {test} from 'node:test';
import assert from 'node:assert/strict';
import sample from '../examples/ho-tay.json';
import {propertySchema} from '../src/schema';
import {
  distanceMeters, frameContains, frameGroundSize, groundPlaneForFrame, imageToLatLng, mercatorX, mercatorY,
  latFromMercatorY, projectToImage, staticImageFrame, toLocalMeters, type GeoFrame,
} from '../src/geo';
import {parseOverpassElements, toPropertyAmenity} from '../scripts/amenities';
import {getLocalBoundaryVertices} from '../src/Boundary3D';

const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} (±${eps})`);
const plot = {lat: 21.063, lng: 105.8283};

test('Web Mercator maps origin to centre and round-trips latitude', () => {
  near(mercatorX(0), 0.5, 1e-12);
  near(mercatorY(0), 0.5, 1e-12);
  for (const lat of [-60, -10, 0, 21.063, 45, 80]) near(latFromMercatorY(mercatorY(lat)), lat, 1e-9);
});

test('static image frame matches the tile pyramid and centres the request point', () => {
  const world = staticImageFrame({center: {lat: 0, lng: 0}, zoom: 0, width: 256, height: 256, tileSize: 256});
  near(world.west, -180, 1e-9); near(world.east, 180, 1e-9); near(world.north, 85.05112878, 1e-6);

  for (const [tileSize, scale] of [[512, 2], [256, 2]] as const) {
    const f = staticImageFrame({center: plot, zoom: 17, width: 640, height: 400, scale, tileSize});
    assert.equal(f.width, 1280);
    const c = projectToImage(f, plot);
    near(c.x, f.width / 2, 1e-6); near(c.y, f.height / 2, 1e-6);
    assert.ok(frameContains(f, plot));
  }

  // Google z17 tại vĩ độ 21°: 156543.03 · cos(lat) / 2^17 m/px logic.
  const g = staticImageFrame({center: plot, zoom: 17, width: 640, height: 640, scale: 2, tileSize: 256});
  const expected = 640 * 156543.03392 * Math.cos((plot.lat * Math.PI) / 180) / 2 ** 17;
  near(frameGroundSize(g).widthM, expected, expected * 0.005);
});

test('projectToImage and imageToLatLng are inverses for both projections', () => {
  const frames: GeoFrame[] = [
    staticImageFrame({center: plot, zoom: 15, width: 1280, height: 800, scale: 2, tileSize: 512}),
    {projection: 'equirectangular', west: 105.8, south: 21.04, east: 105.86, north: 21.08, width: 1280, height: 800},
  ];
  for (const f of frames) {
    for (const p of [plot, {lat: f.north, lng: f.west}, {lat: f.south, lng: f.east}, {lat: 21.05, lng: 105.81}]) {
      const px = projectToImage(f, p);
      const back = imageToLatLng(f, px.x, px.y);
      near(back.lat, p.lat, 1e-9); near(back.lng, p.lng, 1e-9);
    }
    const nw = projectToImage(f, {lat: f.north, lng: f.west});
    near(nw.x, 0, 1e-6); near(nw.y, 0, 1e-6);
  }
});

test('local metres agree with great-circle distance at plot scale', () => {
  near(distanceMeters({lat: 0, lng: 0}, {lat: 1, lng: 0}), 111195, 5);
  const p = {lat: plot.lat + 0.004, lng: plot.lng - 0.006};
  const m = toLocalMeters(plot, p);
  assert.ok(m.x < 0 && m.y > 0, 'x là hướng đông, y là hướng bắc');
  near(Math.hypot(m.x, m.y), distanceMeters(plot, p), 1);
});

test('schema accepts mapped amenities and geo frames, rejects half coordinates and bad bounds', () => {
  const frame = {projection: 'mercator', west: 105.82, south: 21.06, east: 105.83, north: 21.07, width: 2560, height: 1600};
  const ok = {
    ...sample,
    amenities: [{name: 'Chợ', distanceM: 300, lat: 21.064, lng: 105.829, category: 'shopping', image: 'media/cho.jpg'}],
    media: {...sample.media, geo: {aerialImage: frame}},
  };
  assert.equal(propertySchema.safeParse(ok).success, true);
  for (const patch of [
    {amenities: [{name: 'Chợ', distanceM: 300, lat: 21.064}]},
    {amenities: [{name: 'Chợ', distanceM: 300, image: '../x.jpg'}]},
    {amenities: [{name: 'Chợ', distanceM: 300, category: 'casino'}]},
    {media: {geo: {aerialImage: {...frame, west: 106, east: 105}}}},
    {media: {geo: {plotImage: frame}}},
  ]) assert.equal(propertySchema.safeParse({...sample, ...patch}).success, false, JSON.stringify(patch));
});

test('Overpass parsing keeps only named places with real coordinates and never pads results', () => {
  assert.deepEqual(parseOverpassElements([], plot.lat, plot.lng), []);
  assert.deepEqual(parseOverpassElements([
    {lat: 21.064, lon: 105.829, tags: {amenity: 'school'}},
    {lat: 21.064, lon: 105.829, tags: {natural: 'water'}},
    {tags: {name: 'Không có tọa độ', amenity: 'hospital'}},
  ], plot.lat, plot.lng), []);

  const els = [
    {lat: 21.0632, lon: 105.8285, tags: {name: 'Trường A', amenity: 'school'}},
    {center: {lat: 21.066, lon: 105.83}, tags: {name: 'Công viên B', leisure: 'park'}},
    {lat: 21.07, lon: 105.835, tags: {name: 'Chợ C', amenity: 'marketplace'}},
    {lat: 21.0633, lon: 105.8286, tags: {name: 'trường a', amenity: 'school'}},
    ...Array.from({length: 8}, (_, i) => ({lat: 21.0631 + i * 1e-4, lon: 105.8284, tags: {name: `Hiệu thuốc ${i}`, amenity: 'pharmacy'}})),
  ];
  const out = parseOverpassElements(els, plot.lat, plot.lng);
  assert.equal(out.length, 6);
  assert.equal(out.filter(a => a.name.toLowerCase() === 'trường a').length, 1);
  assert.deepEqual(out.slice(0, 4).map(a => a.category), ['education', 'shopping', 'health', 'leisure']);
  const park = out.find(a => a.name === 'Công viên B')!;
  assert.deepEqual([park.lat, park.lng], [21.066, 105.83]);
  assert.equal(park.distanceM, Math.round(distanceMeters(plot, {lat: 21.066, lng: 105.83})));
  assert.equal(propertySchema.safeParse({...sample, amenities: out.map(toPropertyAmenity)}).success, true);
});

test('ground plane placement puts every boundary vertex on the same image pixel', () => {
  const property = propertySchema.parse(sample);
  const vertices = getLocalBoundaryVertices(property);
  const frames: GeoFrame[] = [
    staticImageFrame({center: property.gps, zoom: 17, width: 1280, height: 800, scale: 2, tileSize: 512}),
    // Ảnh lệch tâm so với gps (ví dụ tải theo tọa độ khác) và ảnh ESRI tuyến tính theo độ.
    staticImageFrame({center: {lat: property.gps.lat + 0.0012, lng: property.gps.lng - 0.002}, zoom: 18, width: 1280, height: 800, scale: 2, tileSize: 512}),
    {projection: 'equirectangular', west: 105.825, south: 21.061, east: 105.8316, north: 21.0651, width: 1280, height: 800},
  ];
  for (const f of frames) {
    const plane = groundPlaneForFrame(f, property.gps);
    property.boundaryPolygon!.forEach((pt, i) => {
      const v = vertices[i];
      // planeGeometry xoay −90° quanh X: mép trái = tây, mép trên = bắc (z âm).
      const x = ((v.x - (plane.x - plane.width / 2)) / plane.width) * f.width;
      const y = ((v.z - (plane.z - plane.height / 2)) / plane.height) * f.height;
      const expected = projectToImage(f, pt);
      near(x, expected.x, 0.5); near(y, expected.y, 0.5);
    });
  }
});
