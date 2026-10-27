import {readFile, mkdir, writeFile, stat, realpath, readdir, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {propertySchema, type Property} from '../src/schema';
import {srt, timeline} from '../src/timeline';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const fromRoot = (p: string) => path.resolve(root, p);
export const readJson = async (file: string): Promise<unknown> => JSON.parse((await readFile(fromRoot(file), 'utf8')).replace(/^\uFEFF/, ''));
export const saveJson = (file: string, data: unknown) => writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
export async function readProperty(file: string, overrides: {format?: string; seconds?: number} = {}): Promise<Property> {
  const p = propertySchema.parse(await readJson(file));
  if (overrides.format) p.video.format = overrides.format as Property['video']['format'];
  if (overrides.seconds !== undefined) p.video.durationSeconds = overrides.seconds;
  return propertySchema.parse(p);
}

export async function syncModels() {
  const assetsModels = fromRoot('assets/models');
  const publicModels = fromRoot('public/models');
  try {
    const files = await readdir(assetsModels).catch(() => []);
    if (files.length > 0) {
      await mkdir(publicModels, {recursive: true});
      for (const file of files) {
        if (/\.(glb|gltf|bin)$/i.test(file)) {
          await copyFile(path.join(assetsModels, file), path.join(publicModels, file));
        }
      }
    }
  } catch {}
}

export async function validateAssets(p: Property) {
  await syncModels();
  const publicRoot = await realpath(fromRoot('public'));
  const {attribution: _a, geo: _g, ...files} = p.media;
  const assets = [
    ...Object.values(files).flatMap((value) => Array.isArray(value) ? value : value ? [value] : []),
    ...p.amenities.flatMap((a) => a.image ? [a.image] : []),
  ];
  for (const asset of assets) {
    const resolved = await realpath(path.join(publicRoot, asset)).catch(() => {throw new Error(`Thiếu tư liệu: public/${asset}`);});
    const relative = path.relative(publicRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(resolved)).isFile()) throw new Error(`Tư liệu phải là file trong public/: ${asset}`);
  }
}

export async function prepare(p: Property) {
  await validateAssets(p);
  const job = `${p.id}-${p.video.format}-${randomUUID().slice(0, 8)}`;
  const output = fromRoot(`out/${job}`);
  await mkdir(output, {recursive: true});
  await saveJson(path.join(output, 'input.json'), p);
  await saveJson(path.join(output, 'timeline.json'), timeline(p));
  await writeFile(path.join(output, 'captions.srt'), srt(p), 'utf8');
  await writeFile(path.join(output, 'narration.txt'), timeline(p).map(s => s.caption).join('\n\n'), 'utf8');
  await writeFile(path.join(output, 'social-caption.txt'), `${p.title}\n${p.address}\n${p.specs.areaM2} m² · ${p.specs.widthM} × ${p.specs.lengthM} m\n${p.contact.cta}${p.contact.phone ? ` — ${p.contact.phone}` : ''}\n\n${p.disclaimer}\n#BatDongSan #NhaDat\n`, 'utf8');
  return {job, output};
}

export async function runPool<T, R>(items: T[], limit: number, work: (item: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2) throw new Error('Số tác vụ đồng thời phải là 1 hoặc 2.');
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {results[i] = {status: 'fulfilled', value: await work(items[i], i)};}
      catch (reason) {results[i] = {status: 'rejected', reason};}
    }
  }));
  return results;
}
