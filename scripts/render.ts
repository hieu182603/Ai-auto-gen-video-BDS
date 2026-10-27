import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {getVideoMetadata, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import type {Property} from '../src/schema';
import {fromRoot, prepare, saveJson, validateAssets} from './project';
import {timeline} from '../src/timeline';

let bundled: Promise<string> | undefined;
const getBundle = () => bundled ??= bundle({entryPoint: fromRoot('src/index.ts'), publicDir: fromRoot('public')});

export async function render(p: Property, options: {draft?: boolean; still?: boolean; frame?: number} = {}) {
  await validateAssets(p);
  const scenes = timeline(p);
  if (p.media.streetVideo && !p.media.panorama) {
    const meta = await getVideoMetadata(fromRoot(`public/${p.media.streetVideo}`));
    if (meta.durationInSeconds === null || meta.durationInSeconds < scenes[3].duration / p.video.fps) throw new Error('streetVideo không đọc được thời lượng hoặc ngắn hơn phân cảnh tư liệu. Cung cấp clip dài hơn hoặc giảm thời lượng video.');
  }
  const job = await prepare(p);
  const started = Date.now();
  await saveJson(path.join(job.output, 'status.json'), {status: 'rendering', startedAt: new Date().toISOString()});
  try {
    const concurrency = Number(process.env.RENDER_CONCURRENCY ?? 2);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('RENDER_CONCURRENCY phải từ 1 đến 8.');
    const serveUrl = await getBundle();
    const inputProps = {property: p};
    const chromiumOptions = {gl: 'angle' as const};
    const composition = await selectComposition({serveUrl, id: 'PropertyVideo', inputProps, chromiumOptions});
    const frame = options.frame ?? Math.floor(composition.durationInFrames * 0.38);
    if (!Number.isInteger(frame) || frame < 0 || frame >= composition.durationInFrames) throw new Error('Frame nằm ngoài thời lượng video.');
    const common = {serveUrl, composition, inputProps, chromiumOptions};
    await renderStill({...common, frame, output: path.join(job.output, 'poster.png'), scale: options.draft ? 0.5 : 1});

    // Xuất thêm ảnh bìa tạp chí BĐS cao cấp (Luxury Magazine Poster)
    try {
      const posterComposition = await selectComposition({serveUrl, id: 'PropertyPoster', inputProps, chromiumOptions});
      await renderStill({
        serveUrl,
        composition: posterComposition,
        inputProps,
        chromiumOptions,
        frame: 0,
        output: path.join(job.output, 'poster-magazine.png'),
        scale: options.draft ? 0.5 : 1,
      });
    } catch (e) {
      console.warn('Không thể xuất poster-magazine:', (e as Error).message);
    }

    if (!options.still) {
      let last = -1;
      await renderMedia({...common, outputLocation: path.join(job.output, 'video.mp4'), codec: 'h264', pixelFormat: 'yuv420p', scale: options.draft ? 0.5 : 1, crf: options.draft ? 25 : 18, concurrency,
        onProgress: ({progress}) => {const step = Math.floor(progress * 10); if (step !== last) {last = step; console.log(`[${job.job}] ${step * 10}%`);}},
      });
    }
    await saveJson(path.join(job.output, 'status.json'), {status: 'done', durationMs: Date.now() - started, draft: !!options.draft, still: !!options.still});
    console.log(`Output: ${job.output}`);
    return job.output;
  } catch (error) {
    await saveJson(path.join(job.output, 'status.json'), {status: 'failed', error: error instanceof Error ? error.message : String(error)});
    throw error;
  }
}
