import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('map scene never falls back to demo satellite imagery from another property', () => {
  for (const file of ['Map3DScene.tsx', 'satellite-texture.ts']) {
    assert.doesNotMatch(source(file), /media\/ho-tay/, `${file} must not reference demo media`);
  }
});

test('amenity note does not claim straight-line distances are travel distances', () => {
  const video = source('Video.tsx');
  assert.doesNotMatch(video, /số liệu thực tế/);
  assert.match(video, /đường chim bay/);
});

// Poster.tsx nạp font qua staticFile khi import nên không chạy được trong Node: kiểm tra mã nguồn.
test('poster footer credits imagery attribution like the video footer', () => {
  const poster = source('Poster.tsx');
  assert.match(poster, /p\.media\.attribution/);
  assert.match(poster, /\{posterFootnote\(p\)\}/);
});
