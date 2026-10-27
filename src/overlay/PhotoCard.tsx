import {Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {LatLng} from '../geo';
import {clampBoxToSafeZone, geoToScreen, marchingDashOffset, progress, slicePolyline, polylineLength, toSvgPath} from './geometry';
import {OverlaySvg, useGeoView} from './GeoStage';
import {overlayColors, overlayFont} from './palette';

export type PhotoCardProps = {
  /** Tọa độ tiện ích (đầu nối nét đứt). */
  anchor: LatLng;
  /** Ảnh thật của tiện ích, đường dẫn tương đối với `public/`. */
  src: string;
  title: string;
  /** Dòng phụ, ví dụ khoảng cách đã có nguồn hoặc "Ảnh minh họa". */
  subtitle?: string;
  /** Tâm thẻ mong muốn (pixel khung hình); thẻ được dịch vào vùng an toàn nếu tràn. */
  cardCenter: {x: number; y: number};
  startFrame?: number;
  /** Số frame nét nối chạy từ tiện ích tới thẻ, sau đó thẻ bật lên. */
  connectFrames?: number;
  width?: number;
  imageHeight?: number;
  color?: string;
};

/** Thẻ ảnh tiện ích nối với vị trí trên bản đồ bằng nét đứt. */
export const PhotoCard = ({anchor, src, title, subtitle, cardCenter, startFrame = 0, connectFrames = 10, width = 380, imageHeight = 230, color = overlayColors.route}: PhotoCardProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const view = useGeoView();
  if (frame < startFrame) return null;
  const height = imageHeight + (subtitle ? 104 : 70);
  const box = clampBoxToSafeZone({x: cardCenter.x - width / 2, y: cardCenter.y - height / 2, width, height}, view.viewport);
  const a = geoToScreen(view, anchor);
  const target = {x: box.x + width / 2, y: box.y + height / 2};
  const line = [a, target];
  const p = Easing.out(Easing.cubic)(progress(frame, startFrame, connectFrames));
  const pop = spring({frame: frame - startFrame - connectFrames, fps, config: {damping: 13, stiffness: 160}});
  const dotScale = interpolate(frame - startFrame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <>
      <OverlaySvg>
        {(glowId) => (
          <g filter={`url(#${glowId})`}>
            <path d={toSvgPath(slicePolyline(line, polylineLength(line) * p))} fill="none" stroke={color} strokeWidth={5} strokeDasharray="18 12" strokeDashoffset={marchingDashOffset(frame - startFrame, 1.2, 18, 12)} />
            <circle cx={a.x} cy={a.y} r={11 * dotScale} fill={color} stroke="#fff" strokeWidth={3} />
          </g>
        )}
      </OverlaySvg>
      {frame >= startFrame + connectFrames ? (
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width,
            transform: `scale(${pop})`,
            // Thẻ bung ra từ phía tiện ích.
            transformOrigin: `${a.x - box.x}px ${a.y - box.y}px`,
            opacity: Math.min(1, pop * 1.5),
            borderRadius: 18,
            overflow: 'hidden',
            background: '#0d1114',
            border: `4px solid ${color}`,
            boxShadow: `0 0 24px ${color}66, 0 12px 30px rgba(0,0,0,0.55)`,
            fontFamily: overlayFont,
          }}
        >
          <Img src={staticFile(src)} style={{display: 'block', width: '100%', height: imageHeight, objectFit: 'cover'}} />
          <div style={{padding: '12px 18px 14px'}}>
            <div style={{color: overlayColors.white, fontWeight: 800, fontSize: 34, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{title}</div>
            {subtitle ? <div style={{marginTop: 6, color, fontWeight: 700, fontSize: 26}}>{subtitle}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
};
