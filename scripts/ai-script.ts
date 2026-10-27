import {parseArgs} from 'node:util';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {propertySchema, type Property} from '../src/schema';
import {fromRoot, syncModels} from './project';

const SYSTEM_PROMPT = `Bạn là chuyên gia marketing bất động sản cao cấp và biên tập viên video BĐS chuyên nghiệp tại Việt Nam.
Nhiệm vụ của bạn là nhận văn bản mô tả thô của môi giới BĐS (tin đăng bán, bài viết Facebook, tin nhắn Zalo) và trích xuất thành một cấu trúc JSON hợp lệ tuyệt đối theo schema của hệ thống video tự động.

Yêu cầu chi tiết cho các trường dữ liệu:
1. id: chuỗi slug viết thường không dấu, dùng gạch nối, tối đa 60 ký tự (ví dụ: "tay-ho-biet-thu-100m2", "biet-thu-thao-dien-q2").
2. title: Giật tít bán hàng sang trọng, hấp dẫn chuẩn BĐS cao cấp, tối đa 100 ký tự (ví dụ: "Biệt Thự Phố Tây Hồ View Tuyệt Đẹp · Đẳng Cấp An Cư").
3. address: Địa chỉ rõ ràng, đầy đủ quận/huyện, tỉnh/thành phố, tối đa 180 ký tự.
4. gps: Đối tượng { "lat": number, "lng": number }. Nếu bài đăng không ghi rõ tọa độ GPS cụ thể, HÃY SUY LUẬN TỌA ĐỘ THỰC TẾ của khu vực/phường/quận đó tại Việt Nam (ví dụ: Tây Hồ Hà Nội khoảng 21.06, 105.82; Thảo Điền TP.HCM khoảng 10.80, 106.73).
5. specs:
   - areaM2: Diện tích đất (m²), số dương.
   - widthM: Mặt tiền (m), nếu thiếu hãy ước tính hợp lý (ví dụ: 5.0, 6.0).
   - lengthM: Chiều dài (m), nếu thiếu tính bằng areaM2 / widthM.
   - stories: Số tầng nhà (số nguyên từ 1 đến 20, ví dụ 2, 3, 4. Nếu là đất trống thì để 0 hoặc 1).
6. amenities: CHỈ gồm tiện ích mà bài đăng ghi rõ kèm khoảng cách bằng số (tên tối đa 65 ký tự, distanceM tính theo mét). Không tự thêm tiện ích hay khoảng cách mà bài không nêu; nếu bài không có thì trả về mảng rỗng []. Tiện ích thật sẽ được quét sau bằng lệnh scan-amenities. Ví dụ bài ghi "cách trường Chu Văn An 300m":
   [
     {"name": "Trường Chu Văn An", "distanceM": 300}
   ]
7. contact:
   - name: Tên người liên hệ/môi giới (nếu không có, để "Chuyên Viên Tư Vấn").
   - cta: Lời kêu gọi hành động kích thích người xem (tối đa 100 ký tự, ví dụ: "Liên hệ ngay để nhận trọn bộ sổ đỏ & xem nhà thực tế").
   - phone: Số điện thoại/hotline (nếu có trong bài).
8. video:
   - format: "landscape" (ngang 16:9) hoặc "portrait" (dọc 9:16).
   - durationSeconds: 60 (hoặc thời lượng yêu cầu).
   - fps: 24.
9. media:
   - model3d: "models/sample-villa.glb" (nếu có mô hình 3D).
10. disclaimer: "THÔNG TIN DO NGƯỜI ĐĂNG CUNG CẤP · PHỐI CẢNH 3D MINH HỌA".

CHÚ Ý QUAN TRỌNG:
Chỉ trả về MỘT chuỗi JSON hợp lệ duy nhất, không bao gồm code block markdown (\`\`\`json), không có lời bình luận trước hoặc sau JSON.`;

async function promptInput(question: string): Promise<string> {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function callGemini(apiKey: string, promptText: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\n--- DƯỚI ĐÂY LÀ VĂN BẢN MÔ TẢ THÔ CỦA MÔI GIỚI BĐS ---\n${promptText}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini API không trả về nội dung hợp lệ.');
  }
  return rawText;
}

export async function generatePropertyFromRawText(
  rawText: string,
  options: {
    format?: 'landscape' | 'portrait';
    duration?: number;
    model?: string;
    apiKey?: string;
  } = {}
): Promise<Property> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Thiếu GEMINI_API_KEY!\nVui lòng thêm GEMINI_API_KEY vào file .env hoặc truyền qua cờ --key <key>.'
    );
  }

  const modelCandidates = options.model
    ? [options.model]
    : [
        process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-2.0-flash',
      ];

  let rawJson = '';
  let lastError: Error | null = null;

  for (const m of modelCandidates) {
    try {
      console.log(`🤖 Đang gửi văn bản tới Gemini API (model: ${m})...`);
      rawJson = await callGemini(apiKey, rawText, m);
      if (rawJson) break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Thử model ${m} thất bại, thử model tiếp theo...`);
    }
  }

  if (!rawJson) {
    throw lastError || new Error('Không thể tạo JSON từ Gemini API.');
  }

  // Làm sạch markdown nếu có
  const cleanJson = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleanJson);

  // Áp dụng override nếu có
  if (options.format) {
    parsed.video = parsed.video || {};
    parsed.video.format = options.format;
  }
  if (options.duration) {
    parsed.video = parsed.video || {};
    parsed.video.durationSeconds = options.duration;
  }

  // Tự động kiểm tra nếu có mô hình 3D trong assets/models
  await syncModels();
  if (!parsed.media?.model3d) {
    parsed.media = parsed.media || {};
    parsed.media.model3d = 'models/sample-villa.glb';
  }

  // Xác thực nghiêm ngặt bằng schema Zod của dự án
  return propertySchema.parse(parsed);
}

async function main() {
  const {values} = parseArgs({
    options: {
      text: {type: 'string'},
      input: {type: 'string'},
      output: {type: 'string'},
      format: {type: 'string'},
      duration: {type: 'string'},
      model: {type: 'string'},
      key: {type: 'string'},
      help: {type: 'boolean'},
    },
  });

  if (values.help) {
    console.log(`
Map BĐS — AI Copywriting & Script Generator
Tự động phân tích văn bản mô tả thô của môi giới và xuất file input.json chuẩn BĐS.

Cách dùng:
  npm run script:ai -- --text "Bán nhà mặt phố Hồ Tây 100m2 4 tầng ngõ ô tô..."
  npm run script:ai -- --input raw_post.txt [--output examples/my-property.json]
  npm run script:ai -- --format portrait [--duration 60]

Tùy chọn:
  --text <string>       Nội dung mô tả BĐS trực tiếp
  --input <file.txt>    File văn bản chứa tin đăng của môi giới
  --output <file.json>   Đường dẫn lưu file JSON kết quả (mặc định: examples/<id>.json)
  --format <format>     Định dạng video: landscape (ngang 16:9) hoặc portrait (dọc 9:16)
  --duration <giây>     Thời lượng video (mặc định: 60)
  --model <model>       Model Gemini (mặc định: gemini-2.5-flash hoặc gemini-1.5-flash)
  --key <apiKey>        Gemini API Key (hoặc lấy từ GEMINI_API_KEY trong .env)
`);
    return;
  }

  let rawContent = values.text;
  if (!rawContent && values.input) {
    rawContent = await readFile(fromRoot(values.input), 'utf8');
  }

  if (!rawContent) {
    console.log('📝 Nhập hoặc dán đoạn mô tả BĐS thô của môi giới (Nhấn Enter để gửi):');
    rawContent = await promptInput('> ');
  }

  if (!rawContent || rawContent.trim().length < 10) {
    throw new Error('Nội dung mô tả BĐS quá ngắn hoặc để trống.');
  }

  const format = values.format === 'portrait' ? 'portrait' : 'landscape';
  const duration = values.duration ? Number(values.duration) : 60;

  const property = await generatePropertyFromRawText(rawContent, {
    format,
    duration,
    model: values.model,
    apiKey: values.key,
  });

  const outputPath = values.output
    ? fromRoot(values.output)
    : fromRoot(`examples/${property.id}.json`);

  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, JSON.stringify(property, null, 2) + '\n', 'utf8');

  console.log(`
================================================================================
✨ GEMINI AI COPYWRITING — TẠO KỊCH BẢN BĐS THÀNH CÔNG! ✨
================================================================================
🆔 Mã định danh:   ${property.id}
🏷️ Tiêu đề video:  ${property.title}
📍 Địa chỉ BĐS:    ${property.address}
📐 Quy mô & Kích thước: ${property.specs.areaM2} m² (${property.specs.widthM}m × ${property.specs.lengthM}m) · ${property.specs.stories} Tầng
🌐 Tọa độ định vị: ${property.gps.lat.toFixed(5)}°, ${property.gps.lng.toFixed(5)}°
🏢 Tiện ích:       ${property.amenities.map((a) => `${a.name} (${a.distanceM}m)`).join(', ')}
📞 Hotline tư vấn: ${property.contact.name} ${property.contact.phone ? `(${property.contact.phone})` : ''}
📣 Kêu gọi (CTA):  ${property.contact.cta}
🎬 Định dạng xuất: ${property.video.format.toUpperCase()} (${property.video.durationSeconds}s, ${property.video.fps}fps)
🏠 Mô hình 3D:     ${property.media.model3d || 'Procedural'}
📁 File đã lưu:    ${outputPath}
================================================================================
🚀 CÁC BƯỚC TIẾP THEO:
  1. Render video MP4 & Ảnh Poster:
     npm.cmd run video -- render --input ${path.relative(fromRoot(''), outputPath).replace(/\\/g, '/')}

  2. Tạo giọng đọc AI chuẩn phát âm tiếng Việt BĐS:
     npm.cmd run video -- tts --input ${path.relative(fromRoot(''), outputPath).replace(/\\/g, '/')}
================================================================================
`);
}

main().catch((err) => {
  console.error('❌ Lỗi tạo kịch bản AI:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
