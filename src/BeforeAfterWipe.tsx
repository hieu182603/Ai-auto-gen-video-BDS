import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Property} from './schema';
import {theme, glassCardStyle, badgeStyle} from './theme';
import {House} from './House';

/**
 * Phân cảnh Before & After Wipe Slider:
 * So sánh trực quan giữa Hiện trạng đất trống (Before) và Phối cảnh tương lai (After)
 */
export function BeforeAfterWipe({
  property: p,
  duration,
  portrait = false,
}: {
  property: Property;
  duration: number;
  portrait?: boolean;
}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  // Vị trí thanh trượt quét từ trái qua phải (18% -> 82%)
  const wipeProgress = interpolate(frame, [0, duration], [0.18, 0.82], {
    extrapolateRight: 'clamp',
  });
  const wipeX = wipeProgress * width;

  // Ảnh hiện trạng (aerialImage hoặc propertyImage)
  const beforeImg = p.media.aerialImage || p.media.propertyImage;

  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#091513'}}>
      {/* LỚP 1: HIỆN TRẠNG (BEFORE) - Nằm bên trái thanh trượt */}
      <AbsoluteFill>
        {beforeImg ? (
          <Img
            src={staticFile(beforeImg)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          /* Nếu không có ảnh chụp thực tế, hiển thị khuôn đất 3D sơ đồ trước khi xây dựng */
          <House property={p} duration={duration} build={false} />
        )}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(8,20,18,0.65) 0%, transparent 40%, rgba(5,12,11,0.85) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* LỚP 2: PHỐI CẢNH QUY HOẠCH (AFTER) - Bị clip theo đường quét wipeX */}
      <AbsoluteFill
        style={{
          clipPath: `inset(0 0 0 ${wipeProgress * 100}%)`,
        }}
      >
        <House property={p} duration={duration} build={true} />
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(8,20,18,0.55) 0%, transparent 40%, rgba(5,12,11,0.85) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* THANH TRƯỢT WIPE (GLOWING GOLD DIVIDER LINE) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: wipeX - 2,
          width: 4,
          background: 'linear-gradient(180deg, #dfc37a 0%, #ffffff 50%, #dfc37a 100%)',
          boxShadow: '0 0 24px #dfc37a, 0 0 8px #ffffff',
          zIndex: 10,
        }}
      >
        {/* Nút cầm trượt ở giữa thanh (Handle Knob) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: portrait ? 44 : 52,
            height: portrait ? 44 : 52,
            borderRadius: '50%',
            background: 'rgba(12, 29, 25, 0.95)',
            border: `2px solid ${theme.colors.gold}`,
            boxShadow: '0 0 20px rgba(223, 195, 122, 0.8), 0 8px 16px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.colors.gold,
            fontSize: portrait ? 18 : 22,
            fontWeight: 800,
            letterSpacing: 2,
          }}
        >
          ◂ ▸
        </div>
      </div>

      {/* FLOATING BADGES: HIỆN TRẠNG vs PHỐI CẢNH TƯƠNG LAI */}
      <div
        style={{
          position: 'absolute',
          top: portrait ? 90 : 50,
          left: portrait ? 40 : 60,
          right: portrait ? 40 : 60,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 15,
        }}
      >
        {/* Badge Trước (Before) */}
        <div
          style={{
            ...glassCardStyle(false),
            padding: portrait ? '10px 18px' : '12px 24px',
            borderColor: 'rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{width: 8, height: 8, borderRadius: '50%', background: '#94a3b8'}} />
          <span
            style={{
              fontSize: portrait ? 14 : 16,
              fontWeight: 700,
              color: '#f8fafc',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            ◀ HIỆN TRẠNG ĐẤT NỀN
          </span>
        </div>

        {/* Badge Sau (After) */}
        <div
          style={{
            ...glassCardStyle(true),
            padding: portrait ? '10px 18px' : '12px 24px',
            borderColor: theme.colors.borderGold,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: portrait ? 14 : 16,
              fontWeight: 700,
              color: theme.colors.gold,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            QUY HOẠCH HOÀN THIỆN ▶
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: theme.colors.gold,
              boxShadow: '0 0 10px #dfc37a',
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
