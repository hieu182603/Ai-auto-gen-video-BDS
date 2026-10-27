import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frameGroundSize, projectToImage, staticImageFrame, type GeoFrame} from '../src/geo';
import {
  clampBoxToSafeZone, cumulativeLengths, formatKm, formatMeters, geoToScreen, imageBox, imageTransform, longestRunInside,
  marchingDashOffset, offsetPerpendicular, pixelsPerMeter, pointAtLength, polylineLength, polylineMidpoint, progress,
  radiusToPixels, readableDirection, slicePolyline, svgId, type ImageView,
} from '../src/overlay/geometry';
import fixture from '../src/overlay/fixtures/ho-tay-lines.json';

const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} (±${eps})`);
const plot = {lat: 21.063, lng: 105.8283};
const frame = staticImageFrame({center: plot, zoom: 16, width: 800, height: 500, scale: 2, tileSize: 256}); // 1600×1000
const portrait = {width: 1080, height: 1920};

test('cover fit scales by the larger ratio and centres the image', () => {
  const t = imageTransform({frame, viewport: portrait});
  near(t.scale, 1.92, 1e-12); // max(1080/1600, 1920/1000)
  near(t.offsetX, (1080 - 1600 * 1.92) / 2, 1e-9);
  near(t.offsetY, 0, 1e-9);
  const box = imageBox({frame, viewport: portrait});
  near(box.width, 3072, 1e-9); near(box.height, 1920, 1e-9);
  // Tâm ảnh rơi vào tâm khung.
  const c = geoToScreen({frame, viewport: portrait}, plot);
  near(c.x, 540, 1e-6); near(c.y, 960, 1e-6);
});

test('contain fit letterboxes and keeps the image inside the viewport', () => {
  const t = imageTransform({frame, viewport: portrait, fit: 'contain'});
  near(t.scale, 0.675, 1e-12);
  near(t.offsetX, 0, 1e-9);
  near(t.offsetY, (1920 - 1000 * 0.675) / 2, 1e-9);
});

test('zoom + focus pans the focus point to the viewport centre; clamp keeps the image covering', () => {
  const view: ImageView = {frame, viewport: portrait, zoom: 2, focus: {lat: 21.0645, lng: 105.8262}};
  const p = geoToScreen(view, view.focus!);
  near(p.x, 540, 1e-6); near(p.y, 960, 1e-6);
  // Mọi điểm chiếu nhất quán với ảnh: screen = image·scale + offset.
  const t = imageTransform(view);
  const img = projectToImage(frame, plot);
  const s = geoToScreen(view, plot);
  near(s.x, img.x * t.scale + t.offsetX, 1e-9);
  near(s.y, img.y * t.scale + t.offsetY, 1e-9);
  // Focus ở góc tây bắc: bị giữ lại để không lộ mép ảnh.
  const corner = imageTransform({frame, viewport: portrait, zoom: 1.5, focus: {lat: frame.north, lng: frame.west}});
  near(corner.offsetX, 0, 1e-9); near(corner.offsetY, 0, 1e-9);
  const free = imageTransform({frame, viewport: portrait, zoom: 1.5, focus: {lat: frame.north, lng: frame.west}, clamp: false});
  near(free.offsetX, 540, 1e-6); near(free.offsetY, 960, 1e-6);
});

test('metres → pixels matches the ground size of the frame', () => {
  const view: ImageView = {frame, viewport: portrait};
  const {widthM} = frameGroundSize(frame);
  const expected = (frame.width * imageTransform(view).scale) / widthM;
  const ppm = pixelsPerMeter(view, plot);
  near(ppm.x, expected, expected * 0.002);
  near(ppm.y, ppm.x, ppm.x * 0.002); // Mercator bảo giác: vòng tròn vẫn tròn
  const r = radiusToPixels(view, plot, 300);
  near(r.rx, 300 * expected, 300 * expected * 0.002);
  // Ảnh equirectangular: 1° kinh ngắn hơn 1° vĩ theo cos(lat) → ellipse.
  const eq: GeoFrame = {projection: 'equirectangular', west: 105.8, east: 105.9, south: 21.0, north: 21.1, width: 1000, height: 1000};
  const e = radiusToPixels({frame: eq, viewport: {width: 1000, height: 1000}}, {lat: 21.05, lng: 105.85}, 500);
  near(e.rx / e.ry, 1 / Math.cos((21.05 * Math.PI) / 180), 1e-3);
});

test('polyline length, point at length and slicing for dashes', () => {
  const pts = [{x: 0, y: 0}, {x: 30, y: 40}, {x: 30, y: 100}];
  assert.deepEqual(cumulativeLengths(pts), [0, 50, 110]);
  assert.equal(polylineLength(pts), 110);
  const p = pointAtLength(pts, 25);
  near(p.x, 15, 1e-9); near(p.y, 20, 1e-9); near(p.angle, Math.atan2(40, 30), 1e-12);
  const q = pointAtLength(pts, 80);
  near(q.x, 30, 1e-9); near(q.y, 70, 1e-9); near(q.angle, Math.PI / 2, 1e-12);
  // Ngoài phạm vi bị kẹp về hai đầu.
  assert.deepEqual([pointAtLength(pts, -5).x, pointAtLength(pts, 999).y], [0, 100]);
  const s = slicePolyline(pts, 70);
  assert.equal(s.length, 3);
  near(polylineLength(s), 70, 1e-9);
  near(s[2].y, 60, 1e-9);
  assert.deepEqual(slicePolyline(pts, 0), [{x: 0, y: 0}]);
  assert.deepEqual(slicePolyline(pts, 500), pts);
});

test('km label sits at the length-midpoint, not the vertex average', () => {
  const pts = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 10, y: 100}];
  const m = polylineMidpoint(pts); // tổng 110 → 55 → (10, 45)
  near(m.x, 10, 1e-9); near(m.y, 45, 1e-9);
  // Dời vuông góc: hướng sang phải (angle 0) → bên trái là phía trên màn hình.
  const o = offsetPerpendicular({x: 100, y: 100, angle: 0}, 20);
  near(o.x, 100, 1e-9); near(o.y, 80, 1e-9);
  assert.equal(formatKm(1.24), '1,2 km');
  assert.equal(formatKm(0.95), '1 km');
  assert.equal(formatKm(12.6), '13 km');
  assert.equal(formatMeters(300), '300 m');
  assert.equal(formatMeters(1500), '1,5 km');
});

test('marching dashes stay within one period and move forward', () => {
  for (const f of [0, 1, 7, 33, 100]) {
    const o = marchingDashOffset(f, 1.2, 24, 16);
    assert.ok(o <= 0 && o > -40, `${o}`);
  }
  near(marchingDashOffset(10, 1.2, 24, 16), -12, 1e-9);
});

test('progress, readable direction, visible run, safe zone and svg ids', () => {
  assert.deepEqual([progress(5, 10, 20), progress(20, 10, 20), progress(40, 10, 20), progress(10, 10, 0)], [0, 0.5, 1, 1]);
  const rtl = [{x: 100, y: 0}, {x: 0, y: 0}];
  assert.equal(readableDirection(rtl)[0].x, 0);
  const run = longestRunInside([{x: -10, y: 0}, {x: 10, y: 10}, {x: 20, y: 10}, {x: 500, y: 0}, {x: 30, y: 30}], {left: 0, top: 0, right: 100, bottom: 100});
  assert.deepEqual(run, [{x: 10, y: 10}, {x: 20, y: 10}]);
  const box = clampBoxToSafeZone({x: 1000, y: 1800, width: 300, height: 200}, portrait);
  assert.deepEqual([box.x, box.y], [600, 1300]);
  const box2 = clampBoxToSafeZone({x: 0, y: 0, width: 100, height: 100}, portrait);
  assert.deepEqual([box2.x, box2.y], [60, 220]);
  assert.equal(svgId('glow', ':r1a:'), 'glow-r1a');
  assert.equal(svgId('glow', '«r2»'), 'glow-r2');
});

test('OSM fixture is small, attributed and inside its bbox', () => {
  assert.equal(fixture.attribution, '© OpenStreetMap contributors');
  assert.ok(fixture.lines.length >= 3 && fixture.lines.length <= 6);
  for (const l of fixture.lines) {
    assert.ok(l.coords.length >= 2, l.name);
    for (const [lat, lng] of l.coords) {
      assert.ok(lat >= fixture.bbox.south && lat <= fixture.bbox.north && lng >= fixture.bbox.west && lng <= fixture.bbox.east, l.name);
    }
  }
});
