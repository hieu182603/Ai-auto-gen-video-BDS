import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

export interface EdgeTtsOpts {
  voice?: string;        // Mặc định: "vi-VN-NamMinhNeural" (Nam) hoặc "vi-VN-HoaiMyNeural" (Nữ)
  rate?: string;         // e.g. "+0%", "+10%", "-5%"
  pitch?: string;        // e.g. "+0Hz"
  volume?: string;       // e.g. "+0%"
  timeoutMs?: number;    // Giới hạn thời gian (mặc định 60s)
  command?: string;      // Đường dẫn edge-tts CLI (mặc định: EDGE_TTS_CMD hoặc 'edge-tts')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_TIMEOUT_MS = 60_000;

function runEdgeTts(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stderr = '';
    proc.stderr?.on('data', (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Edge TTS bị treo quá ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        e.code === 'ENOENT'
          ? new Error(`Không tìm thấy "${cmd}". Hãy cài đặt với: uv tool install edge-tts`)
          : e,
      );
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`edge-tts thoát với mã lỗi ${code}: ${stderr.trim().split('\n').pop() ?? ''}`));
    });
  });
}

/**
 * Microsoft Edge TTS client (Hoàn toàn MIỄN PHÍ, không cần API Key)
 */
export class EdgeTtsClient {
  constructor(private cfg: EdgeTtsOpts = {}) {}

  async generate(text: string, audioOutPath: string, srtOutPath?: string): Promise<void> {
    const cmd = this.cfg.command ?? process.env.EDGE_TTS_CMD ?? 'edge-tts';
    const voice = this.cfg.voice ?? process.env.EDGE_TTS_VOICE ?? 'vi-VN-NamMinhNeural';
    const rate = this.cfg.rate ?? process.env.EDGE_TTS_RATE ?? '+0%';
    const pitch = this.cfg.pitch ?? process.env.EDGE_TTS_PITCH ?? '+0Hz';
    const volume = this.cfg.volume ?? process.env.EDGE_TTS_VOLUME ?? '+0%';

    const args = [
      '--voice', voice,
      `--rate=${rate}`,
      `--pitch=${pitch}`,
      `--volume=${volume}`,
      `--text=${text}`,
      '--write-media', audioOutPath,
      ...(srtOutPath ? ['--write-subtitles', srtOutPath] : []),
    ];

    const delays = [2000, 5000, 10000];
    for (let attempt = 0; ; attempt++) {
      try {
        await runEdgeTts(cmd, args, this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const fileStat = await stat(audioOutPath);
        if (fileStat.size === 0) {
          throw new Error('Edge TTS trả về file âm thanh rỗng');
        }
        return;
      } catch (e) {
        if ((e as Error).message.includes('not found')) throw e;
        if (attempt >= delays.length) throw e;
        await sleep(delays[attempt]);
      }
    }
  }
}
