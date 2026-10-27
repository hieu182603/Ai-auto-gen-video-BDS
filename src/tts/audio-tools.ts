import { spawn } from 'node:child_process';

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let out = '', err = '';
    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.stderr?.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} failed (exit ${code}): ${err.trim()}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Lấy thời lượng âm thanh chính xác (tính bằng giây) qua ffprobe
 */
export async function getDurationSec(filePath: string): Promise<number> {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const d = parseFloat(out.trim());
  if (isNaN(d)) throw new Error(`ffprobe không đọc được thời lượng của ${filePath}: ${out}`);
  return d;
}

/**
 * Chuyển đổi định dạng âm thanh (ví dụ sang WAV chuẩn hoặc MP3)
 */
export async function convertToWav(inPath: string, outWavPath: string): Promise<void> {
  await run('ffmpeg', [
    '-y', '-i', inPath,
    '-ar', '44100', '-ac', '1',
    '-c:a', 'pcm_s16le',
    outWavPath,
  ]);
}
