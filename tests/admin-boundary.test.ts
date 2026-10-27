import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sample from '../examples/ho-tay.json';
import {propertySchema, adminBoundarySchema} from '../src/schema';
import {updatePropertyBoundary} from '../scripts/boundary';

const ring = [{lat: 21.0, lng: 105.0}, {lat: 21.1, lng: 105.0}, {lat: 21.1, lng: 105.1}];

test('schema: adminBoundary hợp lệ, tùy chọn, tách khỏi boundaryPolygon', () => {
  const ok = propertySchema.parse({...sample, adminBoundary: {name: 'Phường Quảng An', adminLevel: 8, osmId: 123, polygon: ring}});
  assert.equal(ok.adminBoundary?.name, 'Phường Quảng An');
  assert.deepEqual(ok.boundaryPolygon, propertySchema.parse(sample).boundaryPolygon);
  assert.equal(propertySchema.parse(sample).adminBoundary, undefined);
  // Dạng tuple [lat, lng] cũng được chấp nhận như boundaryPolygon
  assert.deepEqual(adminBoundarySchema.parse({name: 'X', polygon: [[21, 105], [21.1, 105], [21.1, 105.1]]}).polygon[0], {lat: 21, lng: 105});
});

test('schema: adminBoundary từ chối dữ liệu sai', () => {
  const bad = (adminBoundary: unknown) => propertySchema.safeParse({...sample, adminBoundary}).success;
  assert.equal(bad({name: 'X', polygon: ring.slice(0, 2)}), false, 'ít hơn 3 đỉnh');
  assert.equal(bad({name: 'X', polygon: Array.from({length: 301}, (_, i) => ({lat: 21 + i * 1e-4, lng: 105}))}), false, 'quá 300 đỉnh');
  assert.equal(bad({name: 'X', polygon: [...ring, ring[0]]}), false, 'lặp điểm cuối');
  assert.equal(bad({polygon: ring}), false, 'thiếu name');
  assert.equal(bad({name: 'X', adminLevel: 4.5, polygon: ring}), false, 'adminLevel không nguyên');
  assert.equal(bad({name: 'X', polygon: ring, extra: 1}), false, 'trường lạ');
  assert.equal(bad({name: 'X', polygon: [{lat: 91, lng: 105}, ...ring]}), false, 'lat ngoài phạm vi');
});

test('updatePropertyBoundary ghi adminBoundary, không đổi boundaryPolygon, không gọi mạng', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'osm-admin-boundary-'));
  const origEnv = process.env.MAP_BDS_OSM_DIR;
  process.env.MAP_BDS_OSM_DIR = tmpDir;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error('Không được gọi mạng trong test');
  }) as typeof fetch;

  try {
    writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify({schemaVersion: 1, processedAt: '2026-01-01T00:00:00Z'}), 'utf8');
    writeFileSync(path.join(tmpDir, 'admin.ndjson'), JSON.stringify({
      id: 4242,
      name: 'Phường Thử Nghiệm',
      adminLevel: 8,
      tags: {'name:vi': 'Phường Thử Nghiệm'},
      bbox: [105.0, 21.0, 105.1, 21.1],
      ring: [[21.0, 105.0], [21.1, 105.0], [21.1, 105.1], [21.0, 105.1], [21.0, 105.0]],
    }) + '\n', 'utf8');
    const propFile = path.join(tmpDir, 'prop.json');
    writeFileSync(propFile, JSON.stringify(sample, null, 2), 'utf8');
    const before = propertySchema.parse(sample).boundaryPolygon;
    assert.ok(before && before.length >= 3, 'mẫu ho-tay phải có boundaryPolygon để kiểm tra');

    const result = await updatePropertyBoundary(propFile, 'Phường Thử Nghiệm', 'local');
    const saved = propertySchema.parse(JSON.parse(readFileSync(propFile, 'utf8')));

    for (const p of [result, saved]) {
      assert.deepEqual(p.boundaryPolygon, before, 'boundaryPolygon (ranh thửa đất) phải giữ nguyên');
      assert.equal(p.adminBoundary?.name, 'Phường Thử Nghiệm');
      assert.equal(p.adminBoundary?.adminLevel, 8);
      assert.equal(p.adminBoundary?.osmId, 4242);
      assert.equal(p.adminBoundary?.polygon.length, 4, 'bỏ điểm cuối trùng điểm đầu');
      assert.ok(p.dataSources?.includes('osm'));
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (origEnv !== undefined) process.env.MAP_BDS_OSM_DIR = origEnv;
    else delete process.env.MAP_BDS_OSM_DIR;
    rmSync(tmpDir, {recursive: true, force: true});
  }
});
