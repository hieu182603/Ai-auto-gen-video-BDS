import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Property } from '../src/schema';
import { timeline } from '../src/timeline';
import { fromRoot, saveJson } from './project';
import { EdgeTtsClient } from '../src/tts/edge-tts-client';
import { CitVoiceClient } from '../src/tts/cit-voice-client';
import { applyPronunciation, loadPronunciationDict } from '../src/tts/pronunciation';
import { getDurationSec } from '../src/tts/audio-tools';

export function wavDuration(buffer: Buffer): number {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Gemini không trả về WAV hợp lệ.');
  }
  let rate = 0, dataBytes = 0;
  for (let i = 12; i + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', i, i + 4);
    const size = buffer.readUInt32LE(i + 4);
    if (i + 8 + size > buffer.length) throw new Error('WAV bị thiếu dữ liệu.');
    if (id === 'fmt ' && size >= 16) rate = buffer.readUInt32LE(i + 16);
    if (id === 'data') dataBytes += size;
    i += 8 + size + (size % 2);
  }
  if (!rate || !dataBytes) throw new Error('WAV thiếu fmt hoặc data.');
  return dataBytes / rate;
}

export interface TtsOptions {
  provider?: 'cit-voice' | 'edge-tts' | 'gemini-tts' | string;
  voice?: string;
  rate?: string;
}

/**
 * Gọi Gemini REST API để sinh giọng đọc WAV
 */
async function generateGeminiSpeech(text: string, voice: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Thiếu GEMINI_API_KEY trong .env');
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
  if (!/^gemini-3\.8-.*tts$/.test(model)) {
    throw new Error('Adapter hiện hỗ trợ schema Gemini 3.8 TTS; model khác cần adapter riêng.');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{
          text,
          speech_metadata: { style: 'Đọc tiếng Việt tự nhiên, rõ ràng, truyền cảm, tốc độ vừa phải, phong cách giới thiệu bất động sản.' }
        }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { voice } }
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini TTS HTTP ${response.status}. Kiểm tra model, key và quota.`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> } }>
  };
  const part = data.candidates?.[0]?.content?.parts?.find(v => v.inlineData)?.inlineData;
  if (!part?.data) throw new Error('Gemini không trả về âm thanh.');
  return Buffer.from(part.data, 'base64');
}

/**
 * Sinh giọng đọc thuyết minh cho toàn bộ 5 phân cảnh
 */
export async function generateSpeech(p: Property, opts: TtsOptions & {saveToInput?: string} = {}) {
  // Xác định provider: ưu tiên cờ CLI -> biến môi trường -> cit-voice
  let provider = opts.provider || process.env.TTS_PROVIDER;
  if (!provider) {
    provider = 'cit-voice';
  }

  let voice = opts.voice;

  // Kiểm tra kết nối nếu dùng CIT Voice Studio
  if (provider === 'cit-voice') {
    const tempCit = new CitVoiceClient({ voiceId: voice || 'Minh Đức' });
    const ok = await tempCit.isHealthy();
    if (!ok) {
      console.warn(
        `[TTS] CIT Voice Studio (http://127.0.0.1:8001) chưa khởi động.\n` +
        `Tự động chuyển sang Microsoft Edge TTS tiếng Việt tự nhiên (vi-VN-NamMinhNeural)...`
      );
      provider = 'edge-tts';
      if (!opts.voice || opts.voice === 'Minh Đức' || opts.voice === 'Hải Đăng') {
        voice = undefined;
      }
    }
  }

  const defaultVoice = provider === 'cit-voice'
    ? (process.env.CIT_VOICE || 'Minh Đức')
    : provider === 'gemini-tts'
    ? (process.env.GEMINI_TTS_VOICE || 'Kore')
    : (process.env.EDGE_TTS_VOICE || 'vi-VN-NamMinhNeural');
  voice = voice || defaultVoice;

  console.log(`Bắt đầu tạo giọng đọc (${provider} - Voice: ${voice})...`);

  // Nạp từ điển chuẩn hóa phát âm tiếng Việt cho BĐS
  const dictPath = fromRoot('assets/pronunciation.json');
  const dict = await loadPronunciationDict(dictPath);

  const folder = `generated/${p.id}-${randomUUID().slice(0, 8)}`;
  await mkdir(fromRoot(`public/${folder}`), { recursive: true });

  const citClient = new CitVoiceClient({ voiceId: voice });
  const edgeClient = new EdgeTtsClient({ voice, rate: opts.rate });

  const assets: string[] = [];

  for (const scene of timeline(p)) {
    // Chuẩn hóa văn bản trước khi đọc (VD: m² -> mét vuông, BĐS -> bất động sản)
    const spokenText = applyPronunciation(scene.caption, dict);
    console.log(`[TTS: ${scene.id}] ${spokenText}`);

    const ext = provider === 'gemini-tts' || provider === 'cit-voice' ? 'wav' : 'mp3';
    const asset = `${folder}/${scene.id}.${ext}`;
    const fullPath = fromRoot(`public/${asset}`);

    let seconds = 0;

    if (provider === 'cit-voice') {
      const res = await citClient.generate(spokenText, fullPath, voice);
      seconds = res.durationSeconds || await getDurationSec(fullPath);
    } else if (provider === 'gemini-tts') {
      try {
        const wavBuffer = await generateGeminiSpeech(spokenText, voice);
        await writeFile(fullPath, wavBuffer);
        seconds = wavDuration(wavBuffer);
      } catch (err) {
        console.warn(`Gemini TTS lỗi ("${(err as Error).message}"), tự động chuyển sang Edge TTS (NamMinh)...`);
        const fallbackAsset = `${folder}/${scene.id}.mp3`;
        const fallbackPath = fromRoot(`public/${fallbackAsset}`);
        await edgeClient.generate(spokenText, fallbackPath);
        seconds = await getDurationSec(fallbackPath);
        assets.push(fallbackAsset);
        continue;
      }
    } else {
      // Dùng Edge TTS hoàn toàn miễn phí
      await edgeClient.generate(spokenText, fullPath);
      seconds = await getDurationSec(fullPath);
    }

    const maxSeconds = scene.duration / p.video.fps;
    if (seconds > maxSeconds) {
      console.warn(`⚠️ Cảnh ${scene.id} dài ${seconds.toFixed(1)}s (vượt giới hạn cảnh ${maxSeconds.toFixed(1)}s). Khuyến nghị tăng durationSeconds.`);
    }

    assets.push(asset);
  }

  const prepared: Property = {
    ...p,
    media: {
      ...p.media,
      voiceover: undefined,
      sceneVoiceovers: assets as [string, string, string, string, string],
    },
  };

  const output = fromRoot(`out/tts-${p.id}-${randomUUID().slice(0, 8)}`);
  await mkdir(output, { recursive: true });
  await saveJson(path.join(output, 'input.json'), prepared);

  if (opts.saveToInput) {
    await saveJson(fromRoot(opts.saveToInput), prepared);
    console.log(`💾 Đã cập nhật âm thanh vào file: ${opts.saveToInput}`);
  }

  console.log(`\n✅ Đã tạo xong giọng đọc cho 5 cảnh!`);
  console.log(`📁 File cấu hình mới: ${path.join(output, 'input.json')}`);
  console.log(`Render tiếp theo bằng lệnh:`);
  console.log(`  npm.cmd run video -- render --input "${opts.saveToInput || path.join(output, 'input.json')}"`);

  return prepared;
}
