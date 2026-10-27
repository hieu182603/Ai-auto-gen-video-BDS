import { writeFile } from 'node:fs/promises';

export interface CitVoiceOpts {
  endpoint?: string;     // Mặc định: http://127.0.0.1:8001
  voiceId?: string;      // Tên giọng: "Minh Đức", "Hải Đăng", "Mai Anh", "Thùy Dung", ...
  speed?: number;        // Tốc độ: 0.5 - 2.0, mặc định 1.0
  temperature?: number;  // Biểu cảm: 0.1 - 1.2, mặc định 0.7
  format?: 'wav' | 'mp3';
}

/**
 * CIT Voice Studio (VieNeu-TTS v3) Local API Client
 * Chạy 100% Offline, không giới hạn, âm thanh chất lượng cao 48 kHz.
 * Tài liệu API: E:\CIT Voice Studio\cit-voice-studio.md
 */
export class CitVoiceClient {
  private endpoint: string;
  private voiceId: string;
  private speed: number;
  private temperature: number;
  private format: 'wav' | 'mp3';

  constructor(opts: CitVoiceOpts = {}) {
    this.endpoint = (opts.endpoint || process.env.CIT_VOICE_ENDPOINT || 'http://127.0.0.1:8001').replace(/\/+$/, '');
    this.voiceId = opts.voiceId || process.env.CIT_VOICE || 'Minh Đức';
    this.speed = opts.speed ?? Number(process.env.CIT_VOICE_SPEED || 1.0);
    this.temperature = opts.temperature ?? Number(process.env.CIT_VOICE_TEMPERATURE || 0.7);
    this.format = opts.format || 'wav';
  }

  /** Kiểm tra máy chủ CIT Voice Studio có đang chạy và sẵn sàng không */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const data = await res.json() as { status?: string };
      return data.status === 'ok' || data.status === 'loading';
    } catch {
      return false;
    }
  }

  /** Lấy danh sách các giọng đọc từ CIT Voice Studio */
  async getVoices(): Promise<Array<{ id: string; name: string; gender: string; region: string }>> {
    const res = await fetch(`${this.endpoint}/voices`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Lỗi lấy danh sách giọng: HTTP ${res.status}`);
    return await res.json() as Array<{ id: string; name: string; gender: string; region: string }>;
  }

  /** Tạo file giọng nói qua endpoint POST /api/tts/generate */
  async generate(text: string, audioOutPath: string, voiceOverride?: string): Promise<{ durationSeconds: number }> {
    const voice = voiceOverride || this.voiceId;
    const res = await fetch(`${this.endpoint}/api/tts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(180000), // Cho phép chạy CPU inference
      body: JSON.stringify({
        text,
        voice_id: voice,
        speed: this.speed,
        temperature: this.temperature,
        format: this.format,
        use_pronunciation_dict: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`CIT Voice Studio trả về lỗi HTTP ${res.status}: ${errText}`);
    }

    const durationHeader = res.headers.get('X-Duration-Seconds');
    const durationSeconds = durationHeader ? parseFloat(durationHeader) : 0;

    const arrayBuffer = await res.arrayBuffer();
    await writeFile(audioOutPath, Buffer.from(arrayBuffer));

    return { durationSeconds };
  }
}
