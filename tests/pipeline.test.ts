import {test} from 'node:test';
import assert from 'node:assert/strict';
import sample from '../examples/ho-tay.json';
import {dimensions, propertySchema} from '../src/schema';
import {srt, timeline} from '../src/timeline';
import {runPool} from '../scripts/project';
import {wavDuration} from '../scripts/tts';

test('rejects invalid GPS, dimensions, path traversal and unknown fields', () => {
  for (const patch of [
    {gps: {lat: 100, lng: 0}}, {specs: {...sample.specs, widthM: -1}},
    {media: {propertyImage: '../private.jpg'}}, {media: {propertyImage: 'C:\\private.jpg'}},
    {media: {propertyImage: 'https://example.com/picture.jpg'}}, {media: {model3d: '../secret.glb'}},
    {boundaryPolygon: [{lat: 200, lng: 0}]}, {boundaryPolygon: [{lat: 21, lng: 105}, {lat: 21.1, lng: 105}]},
    {inventedField: true},
  ]) assert.equal(propertySchema.safeParse({...sample, ...patch}).success, false);
  assert.equal(propertySchema.safeParse({...sample, media: {propertyImage: 'media/nhà đẹp.jpg', model3d: 'models/sample-villa.glb'}}).success, true);
  assert.equal(propertySchema.safeParse({...sample, boundaryPolygon: [[21, 105], [21.01, 105], [21.01, 105.01]]}).success, true);
});

test('timeline covers every frame exactly once at all supported durations and fps', () => {
  for (const durationSeconds of [12, 61, 120]) for (const fps of [24, 30]) {
    const p = propertySchema.parse({...sample, video: {durationSeconds, fps}});
    const scenes = timeline(p);
    assert.equal(scenes[0].from, 0);
    for (let i = 1; i < scenes.length; i++) assert.equal(scenes[i].from, scenes[i - 1].from + scenes[i - 1].duration);
    assert.equal(scenes.at(-1)!.from + scenes.at(-1)!.duration, durationSeconds * fps);
  }
  const p = propertySchema.parse(sample);
  assert.match(srt(p), /00:01:00,000/);
  assert.deepEqual(dimensions('portrait'), {width: 1080, height: 1920});
});

test('worker pool limits concurrency, preserves order and continues after failure', async () => {
  let active = 0, peak = 0;
  const results = await runPool([0, 1, 2, 3], 2, async n => {
    active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 5)); active--;
    if (n === 1) throw new Error('expected failure');
    return n * 2;
  });
  assert.equal(peak, 2);
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual(results[3], {status: 'fulfilled', value: 6});
  await assert.rejects(runPool([], 0, async n => n));
});

test('WAV duration uses byte rate and rejects truncated audio', () => {
  const wav = Buffer.alloc(44 + 48000);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(48000, 40);
  assert.equal(wavDuration(wav), 1);
  assert.throws(() => wavDuration(wav.subarray(0, 100)));
  assert.throws(() => wavDuration(Buffer.from('bad')));
});
