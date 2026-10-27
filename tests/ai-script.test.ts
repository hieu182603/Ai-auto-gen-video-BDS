import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finalizeAiDraft, numbersInText} from '../scripts/ai-script';

const fullPost = 'Bán nhà Tây Hồ, tọa độ 21.0625, 105.8153. Diện tích 100m2, mặt tiền 5,5m, dài 18,2m, 4 tầng. ' +
  'Cách trường Chu Văn An 300m, chợ 1,2km. LH anh Minh 0912345678';

const modelJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  id: 'tay-ho-100m2',
  title: 'Nhà Tây Hồ 100m2 4 tầng',
  address: 'Tây Hồ',
  gps: {lat: 21.0625, lng: 105.8153},
  specs: {areaM2: 100, widthM: 5.5, lengthM: 18.2, stories: 4},
  amenities: [{name: 'Trường Chu Văn An', distanceM: 300}, {name: 'Chợ', distanceM: 1200}],
  contact: {name: 'Anh Minh', cta: 'Liên hệ xem nhà', phone: '0912345678'},
  video: {format: 'landscape', durationSeconds: 60, fps: 24},
  disclaimer: 'THÔNG TIN DO NGƯỜI ĐĂNG CUNG CẤP · PHỐI CẢNH 3D MINH HỌA',
  ...over,
});

test('numbersInText: dấu phẩy thập phân và dấu chấm nghìn', () => {
  const nums = numbersInText('mặt tiền 5,5m, 1.200m2, 21.0625');
  for (const v of [5.5, 1200, 21.0625]) assert.ok(nums.includes(v), `thiếu ${v}`);
});

test('finalizeAiDraft: đủ dữ kiện có trong bài -> Property hợp lệ, không thêm mặc định', () => {
  const r = finalizeAiDraft(modelJson(), fullPost, {format: 'portrait', duration: 30});
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.property.gps, {lat: 21.0625, lng: 105.8153});
  assert.equal(r.property.amenities.length, 2);
  assert.equal(r.property.media.model3d, undefined, 'không tự gán mô hình 3D');
  assert.equal(r.property.video.format, 'portrait');
  assert.equal(r.property.video.durationSeconds, 30);
  assert.deepEqual(r.warnings, []);
});

test('finalizeAiDraft: thiếu gps/specs -> bản nháp, liệt kê trường thiếu, không điền giả', () => {
  const post = 'Bán nhà Tây Hồ 100m2, LH anh Minh';
  const r = finalizeAiDraft(modelJson({gps: null, specs: {areaM2: 100, widthM: null, lengthM: null, stories: null}}), post);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.missing, ['gps.lat', 'gps.lng', 'specs.widthM', 'specs.lengthM', 'specs.stories']);
  assert.deepEqual(r.draft.gps, {lat: null, lng: null});
  assert.deepEqual(r.draft.specs, {areaM2: 100, widthM: null, lengthM: null, stories: null});
});

test('finalizeAiDraft: gps hoặc kích thước model tự suy luận (không có trong bài) bị bỏ', () => {
  const post = 'Bán nhà Tây Hồ 100m2 4 tầng, LH anh Minh';
  const r = finalizeAiDraft(modelJson({specs: {areaM2: 100, widthM: 5, lengthM: 20, stories: 4}}), post);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.missing, ['gps.lat', 'gps.lng', 'specs.widthM', 'specs.lengthM']);
  assert.ok(r.warnings.some((w) => w.includes('gps')));
  assert.ok(r.warnings.some((w) => w.includes('specs.widthM')));
});

test('finalizeAiDraft: tiện ích có khoảng cách không có trong bài bị bỏ', () => {
  const r = finalizeAiDraft(modelJson({amenities: [{name: 'Trường Chu Văn An', distanceM: 300}, {name: 'Lotte', distanceM: 800}]}), fullPost);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.property.amenities.map((a) => a.name), ['Trường Chu Văn An']);
  assert.ok(r.warnings.some((w) => w.includes('Lotte')));
});

test('finalizeAiDraft: không tự điền tên liên hệ', () => {
  const r = finalizeAiDraft(modelJson({contact: {name: null, cta: 'Liên hệ ngay'}}), fullPost);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.missing, ['contact.name']);
});

test('finalizeAiDraft: dữ liệu sai schema -> nháp, báo đường dẫn trường lỗi', () => {
  const r = finalizeAiDraft('```json\n' + modelJson({id: 'Sai ID'}) + '\n```', fullPost);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.missing, ['id']);
});

test('finalizeAiDraft: output không phải JSON -> lỗi rõ ràng', () => {
  assert.throws(() => finalizeAiDraft('xin lỗi', fullPost), /không trả về JSON hợp lệ/);
});
