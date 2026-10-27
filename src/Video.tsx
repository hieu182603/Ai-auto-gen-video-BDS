import type {CSSProperties} from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {House} from './House';
import {Panorama} from './Panorama';
import {BeforeAfterWipe} from './BeforeAfterWipe';
import {Map3DScene} from './Map3DScene';
import {
  MetallicTitle,
  GoldMetalTitle,
  NeonTitle,
  SoldStampBadge,
  TwoLegSignboard,
  RealEstateSignboard,
  BrokerCard,
} from './components/RealEstateTextFX';
import {timeline, type Scene} from './timeline';
import type {Property} from './schema';
import {theme, glassCardStyle, badgeStyle} from './theme';
import {usesOsmData} from './osm';



/** Bento Grid cho Phân cảnh 2: Thông số & Không gian */
function BentoPlotScene({p, frame, portrait}: {p: Property; frame: number; portrait: boolean}) {
  // Counter animation: Đếm số diện tích mượt mà
  const animatedArea = Math.round(
    interpolate(frame, [0, 24], [0, p.specs.areaM2], {extrapolateRight: 'clamp'})
  );

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20, marginTop: 24, maxWidth: portrait ? '100%' : 880}}>
      {/* Bento Grid Container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: portrait ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {/* Card 1: Hero Diện tích vàng */}
        <div
          style={{
            ...glassCardStyle(true),
            gridColumn: portrait ? 'span 2' : 'span 2',
            padding: portrait ? '24px 28px' : '28px 34px',
            borderColor: theme.colors.borderGold,
          }}
        >
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: 13, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600}}>
              TỔNG DIỆN TÍCH KHUÔN ĐẤT
            </span>
            <span style={{fontSize: 12, color: theme.colors.textMuted, background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4}}>
              CHÍNH XÁC
            </span>
          </div>
          <div style={{fontFamily: theme.fonts.serif, fontSize: portrait ? 68 : 82, fontWeight: 400, color: theme.colors.textPrimary, margin: '8px 0'}}>
            {animatedArea}
            <span style={{fontSize: portrait ? 32 : 38, color: theme.colors.gold, marginLeft: 8}}>m²</span>
          </div>
          <div style={{fontSize: 15, color: theme.colors.textSecondary}}>
            Thế đất vuông vắn · Phù hợp xây dựng an cư & đầu tư sinh lời
          </div>
        </div>

        {/* Card 2: Quy mô xây dựng */}
        <div style={{...glassCardStyle(), padding: portrait ? '20px 24px' : '28px 26px'}}>
          <div style={{fontSize: 13, color: theme.colors.gold, letterSpacing: 2, textTransform: 'uppercase'}}>Quy mô tầng</div>
          <div style={{fontSize: portrait ? 42 : 52, fontWeight: 700, color: theme.colors.textPrimary, marginTop: 8}}>
            {p.specs.stories ? `${p.specs.stories}` : '—'}
            <span style={{fontSize: 20, color: theme.colors.textMuted, marginLeft: 6}}>Tầng</span>
          </div>
          <div style={{fontSize: 13, color: theme.colors.textMuted, marginTop: 4}}>Mô hình 3D tham khảo</div>
        </div>

        {/* Card 3: Chiều ngang mặt tiền */}
        <div style={{...glassCardStyle(), padding: portrait ? '20px 24px' : '22px 26px'}}>
          <div style={{fontSize: 13, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5}}>Mặt tiền</div>
          <div style={{fontSize: portrait ? 36 : 42, fontWeight: 700, color: theme.colors.textPrimary, marginTop: 6}}>
            {p.specs.widthM} <span style={{fontSize: 18, color: theme.colors.gold}}>m</span>
          </div>
          <div style={{fontSize: 12, color: theme.colors.textSecondary, marginTop: 4}}>Mặt tiền thoáng rộng</div>
        </div>

        {/* Card 4: Chiều dài thửa đất */}
        <div style={{...glassCardStyle(), padding: portrait ? '20px 24px' : '22px 26px'}}>
          <div style={{fontSize: 13, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5}}>Chiều dài</div>
          <div style={{fontSize: portrait ? 36 : 42, fontWeight: 700, color: theme.colors.textPrimary, marginTop: 6}}>
            {p.specs.lengthM} <span style={{fontSize: 18, color: theme.colors.gold}}>m</span>
          </div>
          <div style={{fontSize: 12, color: theme.colors.textSecondary, marginTop: 4}}>Chiều sâu lý tưởng</div>
        </div>

        {/* Card 5: Tỷ lệ khuôn đất */}
        <div
          style={{
            ...glassCardStyle(),
            gridColumn: portrait ? 'span 2' : 'span 1',
            padding: portrait ? '20px 24px' : '22px 26px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{fontSize: 13, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5}}>Hình thái khuôn đất</div>
          <div style={{fontSize: 20, fontWeight: 600, color: theme.colors.gold, marginTop: 6}}>
            {p.specs.widthM}m × {p.specs.lengthM}m
          </div>
          <div style={{fontSize: 12, color: '#90d4b8', marginTop: 4}}>Cấu trúc chuẩn phong thủy</div>
        </div>
      </div>
    </div>
  );
}

/** Bento Grid cho Phân cảnh 3: Kết nối & Tiện ích */
function BentoAmenitiesScene({p, frame, portrait}: {p: Property; frame: number; portrait: boolean}) {
  const maxDist = Math.max(...p.amenities.map(a => a.distanceM), 1000);

  return (
    <div style={{marginTop: 24, maxWidth: portrait ? '100%' : 1050}}>
      <h1 style={{fontFamily: theme.fonts.serif, fontSize: portrait ? 60 : 76, fontWeight: 400, margin: '12px 0 28px'}}>
        Tâm điểm kết nối hoàn hảo.
      </h1>

      {p.amenities.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: portrait ? '1fr' : 'repeat(2, 1fr)',
            gap: 14,
          }}
        >
          {p.amenities.map((a, i) => {
            // Stagger animation: card sau xuất hiện chậm hơn card trước 3 frames
            const cardFade = interpolate(frame - i * 3, [0, 10], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const progress = interpolate(frame - i * 3, [5, 25], [0, (a.distanceM / maxDist) * 100], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });

            return (
              <div
                key={i}
                style={{
                  ...glassCardStyle(),
                  padding: portrait ? '18px 22px' : '20px 26px',
                  opacity: cardFade,
                  transform: `translateY(${(1 - cardFade) * 15}px)`,
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'rgba(223, 195, 122, 0.15)',
                        border: `1px solid ${theme.colors.borderGold}`,
                        color: theme.colors.gold,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      0{i + 1}
                    </span>
                    <span style={{fontSize: portrait ? 24 : 26, fontWeight: 600, color: theme.colors.textPrimary}}>
                      {a.name}
                    </span>
                  </div>

                  <span style={{fontSize: portrait ? 24 : 26, fontWeight: 700, color: theme.colors.gold, whiteSpace: 'nowrap'}}>
                    {a.distanceM} <span style={{fontSize: 16, fontWeight: 400}}>m</span>
                  </span>
                </div>

                {/* Thanh đo cự ly trực quan (Visual Distance Bar) */}
                <div style={{marginTop: 14, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden'}}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #dfc37a 0%, #f4e3b5 100%)',
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{fontSize: 28, color: theme.colors.textMuted}}>Chưa có dữ liệu tiện ích lân cận.</p>
      )}

      <div style={{color: theme.colors.textMuted, fontSize: 15, marginTop: 20}}>
        Khoảng cách đường chim bay, theo dữ liệu được cung cấp.
      </div>
    </div>
  );
}

function Content({p, scene}: {p: Property; scene: Scene}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const portrait = height > width;
  const inset = portrait ? 60 : 90;
  const fade = interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  const sceneProgress = frame / Math.max(1, scene.duration - 1);
  const isBeforeAfter = scene.id === 'media' && !p.media.panorama && !p.media.streetVideo && Boolean((p.media.aerialImage || p.media.propertyImage) && p.media.model3d);
  const isHouse = scene.id === 'plot' || (scene.id === 'media' && !p.media.panorama && !p.media.streetVideo && !p.media.propertyImage && !isBeforeAfter);

  return (
    <AbsoluteFill>
      {/* Nền bản đồ vệ tinh thực tế Google Maps cho phân cảnh Tiện ích & Liên hệ */}
      {(scene.id === 'amenities' || scene.id === 'contact') && p.media.aerialImage && (
        <AbsoluteFill style={{overflow: 'hidden'}}>
          <Img
            src={staticFile(p.media.aerialImage)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0.32) contrast(1.15) saturate(1.1)',
              transform: `scale(${interpolate(frame, [0, scene.duration], [1.02, 1.1], {extrapolateRight: 'clamp'})})`,
            }}
          />
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(180deg, rgba(6,16,14,0.85) 0%, rgba(6,16,14,0.6) 45%, rgba(4,10,8,0.92) 100%)',
            }}
          />
        </AbsoluteFill>
      )}

      {scene.id === 'location' && <Map3DScene property={p} duration={scene.duration} portrait={portrait} />}
      {isHouse && <House property={p} duration={scene.duration} build={scene.id === 'plot'} />}
      {scene.id === 'media' &&
        (p.media.panorama ? (
          <Panorama src={p.media.panorama} duration={scene.duration} />
        ) : p.media.streetVideo ? (
          <AbsoluteFill>
            <OffthreadVideo src={staticFile(p.media.streetVideo)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            {/* AI Flycam Tracking Target Box */}
            <div
              style={{
                position: 'absolute',
                top: '40%',
                left: portrait ? '25%' : '38%',
                width: portrait ? 240 : 300,
                height: portrait ? 160 : 200,
                border: '2px dashed #dfc37a',
                borderRadius: 8,
                boxShadow: '0 0 24px rgba(223,195,122,0.45)',
                transform: `scale(${interpolate(frame % 30, [0, 15, 30], [1, 1.03, 1])})`,
                pointerEvents: 'none',
              }}
            >
              <div style={{position: 'absolute', top: -22, left: 0, fontSize: 11, color: '#dfc37a', fontWeight: 700, letterSpacing: 1.5, background: 'rgba(7,19,16,0.85)', padding: '2px 8px', borderRadius: 4}}>
                🎯 AI DRONE TRACKING · THỬA ĐẤT
              </div>
              <div style={{position: 'absolute', bottom: -20, right: 0, fontSize: 11, color: '#f1f5f9', background: 'rgba(7,19,16,0.85)', padding: '2px 8px', borderRadius: 4}}>
                {p.specs.areaM2} m² · KHUÔN ĐẤT THỰC ĐỊA
              </div>
            </div>
          </AbsoluteFill>
        ) : isBeforeAfter ? (
          <BeforeAfterWipe property={p} duration={scene.duration} portrait={portrait} />
        ) : p.media.propertyImage ? (
          <Img src={staticFile(p.media.propertyImage)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        ) : null)}

      {/* Lớp nội dung chữ & Bento UI */}
      <div
        style={{
          position: 'absolute',
          top: portrait ? 240 : 170,
          left: inset,
          right: inset,
          opacity: fade,
          transform: `translateY(${(1 - fade) * 20}px)`,
        }}
      >
        {/* Badge phân cảnh */}
        <div style={badgeStyle}>
          <span style={{width: 6, height: 6, borderRadius: '50%', background: theme.colors.gold}} />
          {String(['location', 'plot', 'amenities', 'media', 'contact'].indexOf(scene.id) + 1).padStart(2, '0')} / {scene.label}
        </div>

        {/* Scene 1: Vị trí (Đồng bộ hóa 3 giai đoạn: Không Gian -> Khoanh Vùng Địa Bàn -> Đi Sâu Vào Lô Đất) */}
        {scene.id === 'location' && (
          <div style={{marginTop: 20}}>
            {/* GIAI ĐOẠN 1: KHÔNG GIAN VŨ TRỤ (progress < 0.28) */}
            {sceneProgress < 0.28 && (
              <div
                style={{
                  opacity: interpolate(sceneProgress, [0.22, 0.28], [1, 0], {extrapolateRight: 'clamp'}),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                  <span style={{fontSize: 16}}>🛰️</span>
                  <span style={{fontSize: portrait ? 15 : 18, color: theme.colors.gold, letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase'}}>
                    HỆ THỐNG ĐỊNH VỊ VỆ TINH TOÀN CẦU (WGS-84)
                  </span>
                </div>
                <div style={{fontFamily: theme.fonts.serif, fontSize: portrait ? 44 : 58, color: '#f8fafc', fontWeight: 800, textShadow: '0 4px 24px rgba(0,0,0,0.8)'}}>
                  TIẾP CẬN KHÔNG PHẬN VIỆT NAM
                </div>
                <div style={{fontSize: portrait ? 20 : 24, color: theme.colors.textSecondary}}>
                  TỌA ĐỘ MỤC TIÊU: <b style={{color: theme.colors.gold}}>{Math.abs(p.gps.lat).toFixed(4)}° {p.gps.lat >= 0 ? 'BẮC' : 'NAM'} · {Math.abs(p.gps.lng).toFixed(4)}° {p.gps.lng >= 0 ? 'ĐÔNG' : 'TÂY'}</b>
                </div>
              </div>
            )}

            {/* GIAI ĐOẠN 2: KHOANH VÙNG ĐỊA BÀN HÀNH CHÍNH (0.28 <= progress < 0.62) */}
            {sceneProgress >= 0.28 && sceneProgress < 0.62 && (
              <div
                style={{
                  opacity: interpolate(
                    sceneProgress,
                    [0.28, 0.33, 0.57, 0.62],
                    [0, 1, 1, 0],
                    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
                  ),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                  <span style={{fontSize: 16}}>📍</span>
                  <span style={{fontSize: portrait ? 15 : 17, color: '#38bdf8', letterSpacing: 2.5, fontWeight: 700, textTransform: 'uppercase'}}>
                    KHOANH VÙNG ĐỊA BÀN HÀNH CHÍNH
                  </span>
                </div>
                <div style={{fontFamily: theme.fonts.serif, fontSize: portrait ? 46 : 62, color: '#f8fafc', fontWeight: 800, textShadow: '0 4px 24px rgba(0,0,0,0.8)'}}>
                  {p.address.split('·')[0].trim()}
                </div>
                <div style={{fontSize: portrait ? 18 : 22, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8}}>
                  <span style={{width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8'}} />
                  <span>RANH GIỚI BẢN ĐỒ VỆ TINH ĐANG ĐƯỢC ĐÁNH DẤU</span>
                </div>

                {/* Tuyến đường kết nối giao thông (Routes) */}
                {p.routes && p.routes.length > 0 && (
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12}}>
                    {p.routes.slice(0, 2).map(r => (
                      <div
                        key={r.name}
                        style={{
                          ...glassCardStyle(),
                          padding: '8px 16px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 10,
                          borderColor: 'rgba(56, 189, 248, 0.4)',
                        }}
                      >
                        <span style={{fontSize: 16}}>🚗</span>
                        <div>
                          <div style={{fontSize: 13, color: '#38bdf8', fontWeight: 600}}>{r.name}</div>
                          <div style={{fontSize: 12, color: theme.colors.textMuted}}>
                            {r.distanceKm ? `${r.distanceKm} km` : ''} {r.durationMin ? `· ~${r.durationMin} phút di chuyển` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GIAI ĐOẠN 3: ĐI SÂU VÀO LÔ ĐẤT & MÔ HÌNH 3D (progress >= 0.62) */}
            {sceneProgress >= 0.62 && (
              <div
                style={{
                  opacity: interpolate(sceneProgress, [0.62, 0.68], [0, 1], {extrapolateLeft: 'clamp'}),
                  display: 'flex',
                  flexDirection: 'column',
                  transform: `translateY(${interpolate(sceneProgress, [0.62, 0.68], [15, 0], {extrapolateLeft: 'clamp'})}px)`,
                }}
              >
                {/* Tiêu đề Kim Loại Vàng 3D lướt sáng */}
                <div style={{margin: '6px 0 10px 0'}}>
                  <GoldMetalTitle text={p.title} fontSize={portrait ? 58 : 74} />
                </div>
                <div style={{fontSize: portrait ? 24 : 28, color: theme.colors.textSecondary, maxWidth: 950}}>
                  📍 {p.address}
                </div>

                {/* Biển BĐS nổi bật (Hỗ trợ 8 phong cách hiệu ứng từ MapEffect) */}
                {p.badge && (
                  <div style={{marginTop: 16}}>
                    {p.badge.style === 'sold_stamp' ? (
                      <SoldStampBadge text={p.badge.text} subText={p.badge.status} />
                    ) : p.badge.style === 'two_legs' ? (
                      <TwoLegSignboard
                        title={p.badge.text}
                        sub={p.badge.status}
                        price={p.badge.price}
                        phone={p.contact.phone}
                        portrait={portrait}
                      />
                    ) : p.badge.style === 'neon' ? (
                      <NeonTitle text={p.badge.text} fontSize={portrait ? 46 : 60} />
                    ) : ['platinum', 'bronze', 'emerald'].includes(p.badge.style || '') ? (
                      <MetallicTitle
                        text={p.badge.text}
                        variant={p.badge.style as any}
                        fontSize={portrait ? 46 : 60}
                      />
                    ) : (
                      <RealEstateSignboard
                        title={p.badge.text}
                        sub={p.badge.status}
                        price={p.badge.price}
                        phone={p.contact.phone}
                        portrait={portrait}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scene 2: Thông số & Không gian (Bento Grid) */}
        {scene.id === 'plot' && <BentoPlotScene p={p} frame={frame} portrait={portrait} />}

        {/* Scene 3: Tiện ích (Bento Grid) */}
        {scene.id === 'amenities' && <BentoAmenitiesScene p={p} frame={frame} portrait={portrait} />}

        {/* Scene 4: Góc nhìn tư liệu thực & Before-After */}
        {scene.id === 'media' && (
          <div style={{marginTop: 30}}>
            <h1 style={{fontFamily: theme.fonts.serif, fontSize: portrait ? 60 : 74, fontWeight: 400, textShadow: '0 4px 20px #000'}}>
              {p.media.panorama ? 'Trải nghiệm không gian 360°.' : isBeforeAfter ? 'Hiện trạng & Quy hoạch tương lai.' : 'Góc nhìn cận cảnh thực tế.'}
            </h1>
            <p style={{fontSize: 22, color: theme.colors.textSecondary, marginTop: 14}}>
              {isBeforeAfter ? 'So sánh trực quan giữa hiện trạng khu đất và mô hình kiến trúc hoàn thiện.' : 'Tư liệu chuẩn xác do chủ sở hữu cung cấp.'}
            </p>
          </div>
        )}

        {/* Scene 5: Hẹn gặp & Kêu gọi hành động */}
        {scene.id === 'contact' && (
          <div style={{paddingTop: portrait ? 160 : 30, maxWidth: 1100}}>
            <div style={{width: 80, height: 3, background: theme.colors.gold, marginBottom: 36}} />
            <h1
              style={{
                fontFamily: theme.fonts.serif,
                fontSize: portrait ? 76 : 92,
                fontWeight: 400,
                lineHeight: 1.15,
                margin: '18px 0 32px',
                color: theme.colors.textPrimary,
              }}
            >
              {p.contact.cta}
            </h1>

            {p.contact.phone && (
              <div
                style={{
                  ...glassCardStyle(true),
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: portrait ? '16px 28px' : '20px 36px',
                  marginBottom: 24,
                }}
              >
                <span style={{fontSize: portrait ? 36 : 46, fontWeight: 800, color: theme.colors.gold, letterSpacing: 2}}>
                  📞 {p.contact.phone}
                </span>
              </div>
            )}

            <div style={{fontSize: 26, color: theme.colors.textSecondary, fontWeight: 500, marginBottom: 20}}>
              Chuyên viên phụ trách: <b style={{color: theme.colors.textPrimary}}>{p.contact.name}</b>
            </div>

            {/* Card Môi Giới Chuyên Nghiệp */}
            <div>
              <BrokerCard
                name={p.contact.name}
                phone={p.contact.phone}
                cta={p.contact.cta}
              />
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function PropertyVideo({property: p}: {property: Property}) {

  const frame = useCurrentFrame();
  const {width, height, durationInFrames} = useVideoConfig();
  const portrait = height > width;
  const scenes = timeline(p);
  const active = scenes.find(s => frame >= s.from && frame < s.from + s.duration)!;
  const inset = portrait ? 60 : 90;

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg, color: theme.colors.textPrimary, fontFamily: theme.fonts.sans}}>
      {/* 5 Phân cảnh theo Timeline */}
      {scenes.map(scene => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.duration} name={scene.label}>
          <Content p={p} scene={scene} />
        </Sequence>
      ))}

      {/* Hiệu ứng Vignette ở viền khung hình (Film Aesthetic) */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 65%, rgba(4,9,8,0.7) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header thương hiệu */}
      <div
        style={{
          position: 'absolute',
          left: inset,
          right: inset,
          top: portrait ? 90 : 60,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${theme.colors.borderLight}`,
          paddingBottom: 20,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          {p.branding?.logo && (
            <Img src={staticFile(p.branding.logo)} style={{height: 32, objectFit: 'contain'}} />
          )}
          <span style={{fontSize: 24, letterSpacing: 4, fontWeight: 700}}>
            {p.branding?.name || (
              <>MAP <b style={{color: theme.colors.gold}}>BĐS</b></>
            )}
          </span>
        </div>
        <span style={{fontSize: 14, color: theme.colors.gold, letterSpacing: 3, fontWeight: 600}}>
          {p.branding?.slogan || 'PREMIER COLLECTION'}
        </span>
      </div>

      {/* Intro Logo Overlay mở đầu (nếu có cấu hình branding) */}
      {p.branding && frame < 36 && (
        <AbsoluteFill
          style={{
            zIndex: 100,
            opacity: interpolate(frame, [22, 34], [1, 0], {extrapolateRight: 'clamp'}),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              transform: `scale(${interpolate(frame, [0, 30], [0.92, 1], {extrapolateRight: 'clamp'})})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
            }}
          >
            {p.branding.logo && (
              <Img src={staticFile(p.branding.logo)} style={{maxHeight: 110, objectFit: 'contain'}} />
            )}
            {p.branding.name && (
              <div style={{fontFamily: theme.fonts.serif, fontSize: portrait ? 44 : 54, color: theme.colors.textPrimary, letterSpacing: 4, fontWeight: 700}}>
                {p.branding.name}
              </div>
            )}
            {p.branding.slogan && (
              <div style={{fontSize: portrait ? 16 : 18, color: theme.colors.gold, letterSpacing: 6, textTransform: 'uppercase', fontWeight: 600}}>
                {p.branding.slogan}
              </div>
            )}
          </div>
        </AbsoluteFill>
      )}

      {/* Thanh phụ đề Glassmorphism */}
      <div
        style={{
          position: 'absolute',
          left: inset,
          right: inset,
          bottom: portrait ? 180 : 95,
          textAlign: 'center',
          fontSize: portrait ? 27 : 26,
          lineHeight: 1.5,
          background: 'rgba(7, 18, 16, 0.88)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${theme.colors.borderLight}`,
          padding: '16px 28px',
          borderRadius: 10,
          boxShadow: theme.shadows.glass,
        }}
      >
        {active.caption}
      </div>

      {/* Footer thông tin & Bộ đếm thời gian */}
      <div
        style={{
          position: 'absolute',
          left: inset,
          right: inset,
          bottom: portrait ? 110 : 50,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 20,
          color: theme.colors.textMuted,
          fontSize: portrait ? 13 : 14,
        }}
      >
        <span>
          {p.disclaimer}
          {usesOsmData(p) ? ' · Dữ liệu bản đồ © OpenStreetMap contributors' : ''}
          {p.media.attribution ? ` · ${p.media.attribution}` : ''}
        </span>
        <span style={{whiteSpace: 'nowrap', color: theme.colors.gold, fontWeight: 600}}>
          {String(Math.floor(frame / p.video.fps)).padStart(2, '0')} / {p.video.durationSeconds}s
        </span>
      </div>

      {/* Thanh tiến trình ánh kim (Progress Bar) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          height: 4,
          background: `linear-gradient(90deg, ${theme.colors.goldDark} 0%, ${theme.colors.gold} 100%)`,
          width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`,
          boxShadow: theme.shadows.goldGlow,
        }}
      />

      {/* Âm thanh thuyết minh & nhạc nền */}
      {p.media.sceneVoiceovers ? (
        p.media.sceneVoiceovers.map((src, i) => (
          <Sequence key={src} from={scenes[i].from} durationInFrames={scenes[i].duration}>
            <Audio src={staticFile(src)} />
          </Sequence>
        ))
      ) : (
        p.media.voiceover && <Audio src={staticFile(p.media.voiceover)} />
      )}
      {p.media.music && (
        <Audio
          src={staticFile(p.media.music)}
          loop
          volume={f => 0.12 * Math.min(1, f / p.video.fps, (durationInFrames - f) / p.video.fps)}
        />
      )}
    </AbsoluteFill>
  );
}
