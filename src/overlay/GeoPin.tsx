import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {LatLng} from '../geo';
import {geoToScreen, safeZone} from './geometry';
import {useGeoView} from './GeoStage';
import {overlayColors, overlayFont} from './palette';

export type GeoPinProps = {
  at: LatLng;
  label?: string;
  startFrame?: number;
  /** Nhãn trượt ra sau pin bao nhiêu frame (skill: 4–6). */
  labelDelay?: number;
  color?: string;
  labelBackground?: string;
  labelColor?: string;
  /** Chiều cao pin (px). */
  size?: number;
  labelFontSize?: number;
  /** Mặc định tự chọn: bên phải, đổi sang trái nếu nhãn tràn khỏi vùng an toàn. */
  labelSide?: 'left' | 'right' | 'auto';
};

/** Pin rơi + nảy bằng spring, đầu nhọn chạm đúng tọa độ; nhãn nền đặc trượt ra sau. */
export const GeoPin = ({at, label, startFrame = 0, labelDelay = 5, color = overlayColors.route, labelBackground = overlayColors.amenity, labelColor = overlayColors.white, size = 84, labelFontSize = 38, labelSide = 'auto'}: GeoPinProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const view = useGeoView();
  if (frame < startFrame) return null;
  const p = geoToScreen(view, at);
  const drop = spring({frame: frame - startFrame, fps, config: {damping: 12}});
  const fall = interpolate(drop, [0, 1], [-320, 0]);
  const opacity = interpolate(frame - startFrame, [0, 4], [0, 1], {extrapolateRight: 'clamp'});
  const w = size * 0.75;

  const reveal = spring({frame: frame - startFrame - labelDelay, fps, config: {damping: 200}, durationInFrames: 12});
  const estWidth = label ? label.length * labelFontSize * 0.58 + 40 : 0;
  const side = labelSide !== 'auto' ? labelSide : p.x + w / 2 + 16 + estWidth > safeZone(view.viewport).right ? 'left' : 'right';
  const headY = p.y - size * 0.62; // ngang tâm đầu pin
  const gapX = w / 2 + 12;

  return (
    <>
      {/* bóng trên mặt đất co giãn theo độ cao rơi */}
      <div style={{position: 'absolute', left: p.x, top: p.y, width: w * 0.9, height: w * 0.28, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', filter: 'blur(4px)', opacity: opacity * interpolate(drop, [0, 1], [0.2, 1], {extrapolateRight: 'clamp'}), transform: 'translate(-50%, -50%)'}} />
      <svg
        width={w}
        height={size}
        viewBox="0 0 48 64"
        style={{position: 'absolute', left: p.x - w / 2, top: p.y - size + fall, opacity, overflow: 'visible', filter: `drop-shadow(0 0 8px ${color}) drop-shadow(0 6px 10px rgba(0,0,0,0.6))`}}
      >
        <path d="M24 63 C24 63 3 39 3 24 A21 21 0 1 1 45 24 C45 39 24 63 24 63 Z" fill={color} stroke="#ffffff" strokeWidth={2.5} />
        <circle cx={24} cy={23} r={8.5} fill="#ffffff" />
      </svg>
      {label && reveal > 0 ? (
        <div
          style={{
            position: 'absolute',
            top: headY,
            ...(side === 'right' ? {left: p.x + gapX} : {right: view.viewport.width - (p.x - gapX)}),
            transform: `translate(${(side === 'right' ? -1 : 1) * (1 - reveal) * 40}px, -50%)`,
            clipPath: side === 'right' ? `inset(0 ${(1 - reveal) * 100}% 0 0)` : `inset(0 0 0 ${(1 - reveal) * 100}%)`,
            padding: '10px 20px',
            borderRadius: 10,
            background: labelBackground,
            color: labelColor,
            fontFamily: overlayFont,
            fontWeight: 800,
            fontSize: labelFontSize,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
          }}
        >
          {label}
        </div>
      ) : null}
    </>
  );
};
