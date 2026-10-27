import type {Property} from './schema';

export type Scene = {id: 'location' | 'plot' | 'amenities' | 'media' | 'contact'; label: string; caption: string; from: number; duration: number};

/**
 * Phân cảnh video kết hợp nghệ thuật biên soạn kịch bản (Copywriting & Marketing Psychology)
 * Nhấn mạnh vị trí đắc địa, không gian sống thịnh vượng, kết nối tiện nghi và kêu gọi hành động mạnh mẽ.
 */
export function timeline(p: Property): Scene[] {
  const total = p.video.durationSeconds * p.video.fps;

  const amenitiesSummary = p.amenities.length
    ? p.amenities.map(a => `${a.name} ${a.distanceM} m`).join(' · ')
    : 'Thuận tiện kết nối mọi tiện ích trọng yếu xung quanh.';

  const entries: Array<[Scene['id'], string, string]> = [
    [
      'location',
      'Vị thế kim cương',
      `${p.title} — Tọa lạc đắc địa tại ${p.address}. Tâm điểm kết nối và an cư lý tưởng.`
    ],
    [
      'plot',
      'Quy mô & Không gian',
      `Sở hữu diện tích ${p.specs.areaM2} m², mặt tiền ${p.specs.widthM} m, dài ${p.specs.lengthM} m.${p.specs.stories ? ` Quy mô ${p.specs.stories} tầng bề thế, tối ưu không gian sống.` : ''}`
    ],
    [
      'amenities',
      'Kết nối phồn vinh',
      `Hệ thống tiện ích ngoại khu vượt trội: ${amenitiesSummary}.`
    ],
    [
      'media',
      'Góc nhìn đẳng cấp',
      p.media.panorama
        ? 'Khám phá không gian sống thực tế qua góc nhìn toàn cảnh 360 độ.'
        : p.media.propertyImage || p.media.streetVideo
        ? 'Góc nhìn cận cảnh từ tư liệu thực tế của bất động sản.'
        : 'Phối cảnh kiến trúc hiện đại, kiến tạo chuẩn mực sống sang.'
    ],
    [
      'contact',
      'Cơ hội sở hữu',
      `${p.contact.cta}.${p.contact.phone ? ` Hotline tư vấn độc quyền: ${p.contact.phone}.` : ''}`
    ],
  ];

  const cuts = [0, 0.2, 0.45, 0.65, 0.85, 1].map(n => Math.round(n * total));
  return entries.map(([id, label, caption], i) => ({id, label, caption, from: cuts[i], duration: cuts[i + 1] - cuts[i]}));
}

export function srt(p: Property) {
  const stamp = (frames: number) => {
    const ms = Math.round(frames / p.video.fps * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return timeline(p).map((s, i) => `${i + 1}\n${stamp(s.from)} --> ${stamp(s.from + s.duration)}\n${s.caption}\n`).join('\n');
}
