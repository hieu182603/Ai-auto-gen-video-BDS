import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';

export type MetallicVariant = 'gold24k' | 'platinum' | 'bronze' | 'emerald';

/**
 * 1. Chữ Kim Loại 3D (Metallic 3D Title)
 * Hỗ trợ 4 phong cách kim loại từ MapEffect:
 * - gold24k: Vàng 24K ánh kim quét sáng
 * - platinum: Bạch kim / Chrome sáng bóng
 * - bronze: Đồng cổ vintage hoàng gia
 * - emerald: Ngọc lục bảo quý phái
 */
export function MetallicTitle({
  text,
  variant = 'gold24k',
  fontSize = 82,
  fontFamily = theme.fonts.serif,
  delay = 0,
}: {
  text: string;
  variant?: MetallicVariant;
  fontSize?: number;
  fontFamily?: string;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - delay);

  // Ánh sáng quét từ trái sang phải
  const shinePos = interpolate(relFrame, [10, 50], [-100, 220], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = interpolate(relFrame, [0, 20], [0.94, 1], {
    extrapolateRight: 'clamp',
  });

  const opacity = interpolate(relFrame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Cấu hình bảng màu theo từng biến thể
  const gradients: Record<MetallicVariant, string> = {
    gold24k: `linear-gradient(110deg, #bfa054 0%, #fae69e 25%, #fff6cc ${shinePos}%, #dfc37a 65%, #9b7e36 100%)`,
    platinum: `linear-gradient(110deg, #8a9ba8 0%, #d8e2dc 25%, #ffffff ${shinePos}%, #b0bec5 65%, #546e7a 100%)`,
    bronze: `linear-gradient(110deg, #8c531b 0%, #d38c42 25%, #fde0b2 ${shinePos}%, #945a27 65%, #4a2c0f 100%)`,
    emerald: `linear-gradient(110deg, #005a40 0%, #10ac84 25%, #c8f7dc ${shinePos}%, #1dd1a1 65%, #004d35 100%)`,
  };

  const shadows: Record<MetallicVariant, string> = {
    gold24k: `
      0 1px 0 rgba(155,126,54,0.7),
      0 2px 0 rgba(120,95,35,0.6),
      0 3px 0 rgba(80,60,20,0.5),
      0 8px 24px rgba(0,0,0,0.85)
    `,
    platinum: `
      0 1px 0 rgba(176,190,197,0.8),
      0 2px 0 rgba(120,144,156,0.6),
      0 3px 0 rgba(84,110,122,0.5),
      0 8px 24px rgba(0,0,0,0.85)
    `,
    bronze: `
      0 1px 0 rgba(140,83,27,0.8),
      0 2px 0 rgba(100,55,15,0.6),
      0 3px 0 rgba(60,30,8,0.5),
      0 8px 24px rgba(0,0,0,0.85)
    `,
    emerald: `
      0 1px 0 rgba(16,172,132,0.8),
      0 2px 0 rgba(10,120,95,0.6),
      0 3px 0 rgba(5,70,55,0.5),
      0 8px 24px rgba(0,0,0,0.85)
    `,
  };

  return (
    <div
      style={{
        display: 'inline-block',
        fontFamily,
        fontSize,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: 2,
        transform: `scale(${scale})`,
        opacity,
        background: gradients[variant],
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textShadow: shadows[variant],
      }}
    >
      {text}
    </div>
  );
}

/** Tương thích ngược với tên gọi cũ */
export const GoldMetalTitle = (props: React.ComponentProps<typeof MetallicTitle>) => (
  <MetallicTitle {...props} variant={props.variant || 'gold24k'} />
);

/**
 * 2. Chữ Neon Lộ Sáng (Neon Glow Title)
 * Phong cách tiêu đề Neon rực rỡ với hiệu ứng nhấp nháy dòng điện
 */
export function NeonTitle({
  text,
  fontSize = 76,
  delay = 0,
}: {
  text: string;
  fontSize?: number;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - delay);

  // Hiệu ứng flicker chớp sáng lúc khởi động
  const flicker =
    relFrame < 15
      ? [0.2, 0.9, 0.4, 1, 0.7, 0.3, 1][Math.floor(relFrame / 2) % 7]
      : 1;

  return (
    <div
      style={{
        display: 'inline-block',
        fontFamily: theme.fonts.sans,
        fontSize,
        fontWeight: 800,
        letterSpacing: 3,
        color: '#ffffff',
        opacity: flicker,
        textShadow: `
          0 0 5px #fff,
          0 0 10px #00b4e6,
          0 0 20px #00b4e6,
          0 0 40px #0077b6,
          0 0 80px #0077b6
        `,
      }}
    >
      {text}
    </div>
  );
}

/**
 * 3. Dấu Mộc ĐÃ BÁN / SOLD (Rubber Stamp Slam Badge)
 * Hiệu ứng dập dấu mộc đỏ BĐS với hiệu ứng va chạm nảy chấn động (stamp slam)
 */
export function SoldStampBadge({
  text = 'ĐÃ BÁN',
  subText = 'CHÍNH THỨC CHỐT CỌC',
  delay = 10,
}: {
  text?: string;
  subText?: string;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const relFrame = Math.max(0, frame - delay);

  // Hiệu ứng rơi dập từ trên cao xuống
  const slamScale = spring({
    frame: relFrame,
    fps,
    config: {damping: 12, mass: 0.6, stiffness: 220},
    from: 2.5,
    to: 1,
  });

  const opacity = interpolate(relFrame, [0, 4], [0, 0.95], {
    extrapolateRight: 'clamp',
  });

  if (relFrame <= 0) return null;

  return (
    <div
      style={{
        display: 'inline-block',
        transform: `scale(${slamScale}) rotate(-14deg)`,
        opacity,
        border: '5px double #b3122a',
        borderRadius: 8,
        padding: '10px 24px',
        background: 'rgba(179, 18, 42, 0.12)',
        color: '#b3122a',
        fontFamily: theme.fonts.sans,
        textAlign: 'center',
        boxShadow: '0 0 20px rgba(179, 18, 42, 0.4), inset 0 0 12px rgba(179, 18, 42, 0.2)',
        textTransform: 'uppercase',
        letterSpacing: 4,
        position: 'relative',
        maskImage: 'radial-gradient(circle, black 80%, transparent 100%)',
      }}
    >
      <div style={{fontSize: 38, fontWeight: 900, lineHeight: 1}}>★ {text} ★</div>
      {subText && (
        <div style={{fontSize: 13, fontWeight: 700, marginTop: 4, letterSpacing: 2}}>
          {subText}
        </div>
      )}
    </div>
  );
}

/**
 * 4. Biển Rao Cắm Cọc 2 Chân BĐS (Two-Leg Stake Real Estate Signboard)
 * Mô phỏng biển cắm cọc 2 chân thép cắm sâu vào nền đất thực tế
 */
export function TwoLegSignboard({
  title = 'BÁN ĐẤT NỀN CHÍNH CHỦ',
  sub = 'DIỆN TÍCH ĐẸP · SỔ ĐỎ CÔNG CHỨNG NGAY',
  price,
  phone,
  portrait = false,
  delay = 5,
}: {
  title?: string;
  sub?: string;
  price?: string;
  phone?: string;
  portrait?: boolean;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - delay);

  const translateY = interpolate(relFrame, [0, 16], [-60, 0], {
    extrapolateRight: 'clamp',
  });
  const sway = interpolate(relFrame, [16, 28, 40, 52], [2.5, -1.5, 0.6, 0], {
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(relFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: `translateY(${translateY}px) rotate(${sway}deg)`,
        opacity,
        transformOrigin: 'bottom center',
        position: 'relative',
      }}
    >
      {/* Tấm biển chính */}
      <div
        style={{
          background: 'linear-gradient(145deg, #180507 0%, #300c10 50%, #150608 100%)',
          border: '3px solid #dfc37a',
          borderRadius: 12,
          padding: portrait ? '16px 24px' : '20px 34px',
          boxShadow: '0 18px 45px rgba(0,0,0,0.9), inset 0 0 16px rgba(223,195,122,0.2)',
          position: 'relative',
          zIndex: 2,
          maxWidth: portrait ? '100%' : 680,
          textAlign: 'center',
        }}
      >
        {/* Banner nhãn đỏ */}
        <div
          style={{
            display: 'inline-block',
            background: 'linear-gradient(90deg, #b3122a 0%, #e52d48 100%)',
            color: '#ffffff',
            fontSize: portrait ? 12 : 14,
            fontWeight: 800,
            letterSpacing: 2,
            padding: '3px 14px',
            borderRadius: 4,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          🚩 THÔNG TIN BẤT ĐỘNG SẢN 🚩
        </div>

        <div
          style={{
            fontSize: portrait ? 28 : 38,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: 1,
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: portrait ? 14 : 16,
            color: '#dfc37a',
            marginTop: 6,
            fontWeight: 600,
          }}
        >
          {sub}
        </div>

        {(price || phone) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 20,
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(223,195,122,0.25)',
            }}
          >
            {price && (
              <div style={{fontSize: portrait ? 24 : 28, fontWeight: 900, color: '#fdd835'}}>
                💰 {price}
              </div>
            )}
            {phone && (
              <div style={{fontSize: portrait ? 18 : 22, fontWeight: 700, color: '#ffffff'}}>
                📞 {phone}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2 Chân cắm cọc gỗ/kim loại vươn dài xuống dưới */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '70%',
          marginTop: -4,
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 14,
            height: 90,
            background: 'linear-gradient(90deg, #423024 0%, #6d503c 50%, #2f2017 100%)',
            borderRadius: '0 0 4px 4px',
            boxShadow: '2px 4px 10px rgba(0,0,0,0.6)',
          }}
        />
        <div
          style={{
            width: 14,
            height: 90,
            background: 'linear-gradient(90deg, #423024 0%, #6d503c 50%, #2f2017 100%)',
            borderRadius: '0 0 4px 4px',
            boxShadow: '2px 4px 10px rgba(0,0,0,0.6)',
          }}
        />
      </div>
    </div>
  );
}

/**
 * 5. Biển Rao Bất Động Sản Điện Ảnh (Real Estate Signboard phong cách chuẩn)
 */
export function RealEstateSignboard({
  title = 'BÁN ĐẤT THỔ CƯ',
  sub = 'SỔ ĐỎ CHÍNH CHỦ · CÔNG CHỨNG NGAY',
  price,
  phone,
  portrait = false,
  delay = 5,
}: {
  title?: string;
  sub?: string;
  price?: string;
  phone?: string;
  portrait?: boolean;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - delay);

  const translateY = interpolate(relFrame, [0, 16], [-50, 0], {
    extrapolateRight: 'clamp',
  });
  const swingAngle = interpolate(
    relFrame,
    [16, 26, 36, 48],
    [3.5, -2, 0.8, 0],
    {extrapolateRight: 'clamp'}
  );
  const opacity = interpolate(relFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'inline-block',
        transform: `translateY(${translateY}px) rotate(${swingAngle}deg)`,
        opacity,
        transformOrigin: 'top center',
        background: 'linear-gradient(145deg, #1c150a 0%, #0d211d 100%)',
        border: '3px solid #dfc37a',
        borderRadius: 14,
        padding: portrait ? '16px 26px' : '22px 36px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.85), inset 0 0 20px rgba(223,195,122,0.15)',
        position: 'relative',
        maxWidth: portrait ? '100%' : 700,
      }}
    >
      {/* 4 Đinh tán mạ vàng ở 4 góc */}
      {[{top: 8, left: 8}, {top: 8, right: 8}, {bottom: 8, left: 8}, {bottom: 8, right: 8}].map(
        (pos, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              ...pos,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#dfc37a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}
          />
        )
      )}

      {/* Ruy băng nhãn đỏ BĐS */}
      <div
        style={{
          display: 'inline-block',
          background: 'linear-gradient(90deg, #b3122a 0%, #d82b45 100%)',
          color: '#ffffff',
          fontSize: portrait ? 13 : 15,
          fontWeight: 800,
          letterSpacing: 2,
          padding: '4px 14px',
          borderRadius: 4,
          textTransform: 'uppercase',
          marginBottom: 8,
          boxShadow: '0 2px 8px rgba(179,18,42,0.5)',
        }}
      >
        ★ BẤT ĐỘNG SẢN NỔI BẬT ★
      </div>

      <div
        style={{
          fontSize: portrait ? 32 : 44,
          fontWeight: 800,
          color: '#ffffff',
          lineHeight: 1.15,
          letterSpacing: 1.5,
          fontFamily: theme.fonts.sans,
          textShadow: '0 2px 10px rgba(0,0,0,0.9)',
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: portrait ? 15 : 18,
          color: theme.colors.gold,
          marginTop: 6,
          fontWeight: 600,
          letterSpacing: 1,
        }}
      >
        {sub}
      </div>

      {(price || phone) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid rgba(223,195,122,0.3)',
          }}
        >
          {price && (
            <div style={{fontSize: portrait ? 24 : 30, fontWeight: 900, color: '#fdd835'}}>
              💰 {price}
            </div>
          )}
          {phone && (
            <div style={{fontSize: portrait ? 20 : 24, fontWeight: 700, color: '#ffffff'}}>
              📞 {phone}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 6. Card Môi Giới Chuyên Nghiệp (Broker Lowerthird Card)
 */
export function BrokerCard({
  name,
  phone,
  cta = 'LIÊN HỆ XEM ĐẤT & BÁO GIÁ',
  delay = 5,
}: {
  name: string;
  phone?: string;
  cta?: string;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - delay);
  const opacity = interpolate(relFrame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  const translateX = interpolate(relFrame, [0, 15], [-30, 0], {extrapolateRight: 'clamp'});

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 24px',
        background: 'rgba(10, 26, 22, 0.9)',
        border: '1.5px solid rgba(223, 195, 122, 0.4)',
        borderRadius: 50,
        boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(10px)',
        opacity,
        transform: `translateX(${translateX}px)`,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #dfc37a 0%, #9b7e36 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          color: '#071310',
          fontWeight: 800,
        }}
      >
        👤
      </div>
      <div>
        <div style={{fontSize: 18, fontWeight: 700, color: '#ffffff'}}>{name}</div>
        <div style={{fontSize: 13, color: '#dfc37a'}}>{cta}</div>
      </div>
      {phone && (
        <div
          style={{
            marginLeft: 12,
            padding: '8px 18px',
            background: 'linear-gradient(90deg, #b3122a 0%, #d82b45 100%)',
            color: '#ffffff',
            borderRadius: 30,
            fontWeight: 800,
            fontSize: 16,
            boxShadow: '0 2px 10px rgba(179,18,42,0.6)',
          }}
        >
          📞 {phone}
        </div>
      )}
    </div>
  );
}
