import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import './fonts';
import type { Property } from './schema';
import { theme, badgeStyle } from './theme';
import { usesOsmData } from './osm';

/** Dòng chú thích cuối poster: miễn trừ, nguồn OSM và bản quyền ảnh nền khi poster có dùng ảnh. */
export function posterFootnote(p: Property): string {
  const usesImage = Boolean(p.media.propertyImage || p.media.aerialImage);
  return [
    p.disclaimer,
    usesOsmData(p) ? 'Dữ liệu bản đồ © OpenStreetMap contributors' : '',
    usesImage ? p.media.attribution ?? '' : '',
  ].filter(Boolean).join(' · ');
}

export function PropertyPoster({ property: p }: { property: Property }) {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const inset = portrait ? 60 : 90;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.bgDark,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.sans,
        overflow: 'hidden',
      }}
    >
      {/* Nền ảnh / texture / gradient */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {p.media.aerialImage || p.media.propertyImage ? (
          <Img
            src={staticFile(p.media.propertyImage || p.media.aerialImage || '')}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.38) contrast(1.1)' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'radial-gradient(ellipse at 70% 30%, #16362e 0%, #091513 60%, #040908 100%)',
            }}
          />
        )}
        {/* Lớp gradient phủ sang trọng */}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(5,12,11,0.7) 0%, rgba(5,12,11,0.3) 40%, rgba(5,12,11,0.92) 85%, #050c0b 100%)',
          }}
        />
        {/* Viền khung vàng kim danh giá quanh poster */}
        <div
          style={{
            position: 'absolute',
            inset: portrait ? 30 : 40,
            border: `1px solid ${theme.colors.borderGold}`,
            pointerEvents: 'none',
            borderRadius: 8,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: portrait ? 34 : 44,
            border: '1px solid rgba(223, 195, 122, 0.15)',
            pointerEvents: 'none',
            borderRadius: 6,
          }}
        />
      </AbsoluteFill>

      {/* Nội dung chính */}
      <AbsoluteFill style={{ padding: inset, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {/* Header Tạp chí BĐS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${theme.colors.borderLight}`, paddingBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: portrait ? 28 : 34, letterSpacing: 8, fontWeight: 700 }}>
                MAP <b style={{ color: theme.colors.gold }}>BĐS</b>
              </span>
              <span style={{ fontSize: 13, color: theme.colors.gold, letterSpacing: 3, borderLeft: `1px solid ${theme.colors.borderGold}`, paddingLeft: 12 }}>
                PREMIER PORTFOLIO
              </span>
            </div>
            <div style={{ fontSize: 13, color: theme.colors.textMuted, letterSpacing: 2, marginTop: 6, textTransform: 'uppercase' }}>
              Bản tin bất động sản cao cấp · Tuyển chọn đặc quyền
            </div>
          </div>

          <div style={badgeStyle}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.colors.gold }} />
            EXCLUSIVE LISTING
          </div>
        </div>

        {/* Thân Poster: Tiêu đề & Thông số Bento Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: portrait ? 28 : 32, margin: 'auto 0' }}>
          <div>
            <span style={{ fontSize: portrait ? 18 : 22, color: theme.colors.gold, letterSpacing: 4, textTransform: 'uppercase', fontWeight: 600 }}>
              CƠ HỘI ĐẦU TƯ & AN CƯ
            </span>
            <h1
              style={{
                fontFamily: theme.fonts.serif,
                fontSize: portrait ? 72 : 88,
                fontWeight: 400,
                lineHeight: 1.1,
                margin: '14px 0 16px',
                color: theme.colors.textPrimary,
                textShadow: '0 4px 20px rgba(0,0,0,0.8)',
              }}
            >
              {p.title}
            </h1>
            <div style={{ fontSize: portrait ? 24 : 28, color: theme.colors.textSecondary, maxWidth: portrait ? '100%' : '80%' }}>
              📍 {p.address}
            </div>
            <div style={{ fontSize: 16, color: theme.colors.textMuted, marginTop: 10 }}>
              Tọa độ: {Math.abs(p.gps.lat).toFixed(4)}° {p.gps.lat >= 0 ? 'Bắc' : 'Nam'} · {Math.abs(p.gps.lng).toFixed(4)}° {p.gps.lng >= 0 ? 'Đông' : 'Tây'}
            </div>
          </div>

          {/* Bento Box thông số vàng */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: portrait ? '1fr 1fr' : 'repeat(4, 1fr)',
              gap: 16,
              background: 'rgba(15, 34, 30, 0.85)',
              backdropFilter: 'blur(16px)',
              border: `1px solid ${theme.colors.borderGold}`,
              borderRadius: 12,
              padding: portrait ? 22 : 28,
              boxShadow: theme.shadows.cardElevated,
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>Diện tích</div>
              <div style={{ fontSize: portrait ? 40 : 48, fontWeight: 700, color: theme.colors.textPrimary, fontFamily: theme.fonts.serif, marginTop: 4 }}>
                {p.specs.areaM2} <span style={{ fontSize: 20, color: theme.colors.gold }}>m²</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>Mặt tiền × Dài</div>
              <div style={{ fontSize: portrait ? 32 : 38, fontWeight: 700, color: theme.colors.textPrimary, marginTop: 6 }}>
                {p.specs.widthM} × {p.specs.lengthM} <span style={{ fontSize: 18, color: theme.colors.gold }}>m</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>Quy mô</div>
              <div style={{ fontSize: portrait ? 32 : 38, fontWeight: 700, color: theme.colors.textPrimary, marginTop: 6 }}>
                {p.specs.stories ? `${p.specs.stories} Tầng` : 'Đất nền'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>Pháp lý & Hiện trạng</div>
              <div style={{ fontSize: portrait ? 20 : 24, fontWeight: 600, color: '#90d4b8', marginTop: 10 }}>
                Sẵn sàng giao dịch
              </div>
            </div>
          </div>

          {/* Tiện ích nổi bật (nếu có) */}
          {p.amenities.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>Kết nối:</span>
              {p.amenities.slice(0, 4).map((a, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${theme.colors.borderLight}`,
                    borderRadius: 20,
                    padding: '6px 14px',
                    fontSize: portrait ? 15 : 17,
                    color: theme.colors.textSecondary,
                  }}
                >
                  {a.name} <b style={{ color: theme.colors.gold }}>({a.distanceM} m)</b>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Liên hệ & Hotline độc quyền */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${theme.colors.borderLight}`,
            paddingTop: 24,
            gap: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>Đơn vị tư vấn & Hẹn xem nhà</div>
            <div style={{ fontSize: portrait ? 24 : 28, fontWeight: 600, color: theme.colors.textPrimary, marginTop: 4 }}>
              {p.contact.name}
            </div>
            <div style={{ fontSize: 15, color: theme.colors.textMuted, marginTop: 2 }}>
              {posterFootnote(p)}
            </div>
          </div>

          {p.contact.phone && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(223, 195, 122, 0.2) 0%, rgba(223, 195, 122, 0.05) 100%)',
                border: `1.5px solid ${theme.colors.gold}`,
                borderRadius: 14,
                padding: portrait ? '12px 20px' : '16px 28px',
                textAlign: 'right',
                boxShadow: theme.shadows.goldGlow,
              }}
            >
              <div style={{ fontSize: 11, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase' }}>HOTLINE TƯ VẤN 24/7</div>
              <div style={{ fontSize: portrait ? 32 : 40, fontWeight: 800, color: theme.colors.gold, letterSpacing: 1, marginTop: 2 }}>
                {p.contact.phone}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
