import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {LatLng} from '../geo';
import {formatMeters, geoToScreen, progress, radiusToPixels} from './geometry';
import {OverlaySvg, useGeoView} from './GeoStage';
import {overlayColors, overlayFont} from './palette';

export type GeoRadiusProps = {
  center: LatLng;
  /** Bán kính mặt đất thật (mét), quy đổi sang pixel theo tỉ lệ ảnh tại `center`. */
  radiusM: number;
  startFrame?: number;
  /** Số frame quét hết một vòng. */
  durationFrames?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  /** Nhãn trên đỉnh vòng; mặc định "Bán kính <r>". `false` để ẩn. */
  label?: string | false;
};

/** Vòng bán kính quét dần theo chiều kim đồng hồ từ hướng bắc, kèm tia quét kiểu radar. */
export const GeoRadius = ({center, radiusM, startFrame = 0, durationFrames = 30, color = overlayColors.mainRoad, fillOpacity = 0.14, strokeWidth = 5, label}: GeoRadiusProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const view = useGeoView();
  if (frame < startFrame || radiusM <= 0) return null;
  const c = geoToScreen(view, center);
  const {rx, ry} = radiusToPixels(view, center, radiusM);
  const p = Easing.inOut(Easing.cubic)(progress(frame, startFrame, durationFrames));
  const theta = -Math.PI / 2 + p * 2 * Math.PI;
  const sweepOpacity = interpolate(frame - startFrame, [durationFrames, durationFrames + 8], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // Ellipse bắt đầu ở đỉnh (bắc), hai cung nửa vòng theo chiều kim đồng hồ.
  const ring = `M ${c.x} ${c.y - ry} A ${rx} ${ry} 0 1 1 ${c.x} ${c.y + ry} A ${rx} ${ry} 0 1 1 ${c.x} ${c.y - ry}`;
  // Hình quạt đã quét (fill) — một cung duy nhất, cờ large-arc theo góc đã quét.
  const end = {x: c.x + rx * Math.cos(theta), y: c.y + ry * Math.sin(theta)};
  const wedge = p >= 1
    ? ring
    : `M ${c.x} ${c.y} L ${c.x} ${c.y - ry} A ${rx} ${ry} 0 ${p > 0.5 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
  const text = label === false ? undefined : label ?? `Bán kính ${formatMeters(radiusM)}`;
  const pop = spring({frame: frame - startFrame - durationFrames, fps, config: {damping: 14}});
  return (
    <>
      <OverlaySvg>
        {(glowId) => (
          <>
            {p > 0 ? <path d={wedge} fill={color} fillOpacity={fillOpacity} /> : null}
            <path d={ring} pathLength={1} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={`${p} 1`} strokeLinecap="round" filter={`url(#${glowId})`} />
            <line x1={c.x} y1={c.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={3} opacity={sweepOpacity * 0.9} filter={`url(#${glowId})`} />
            <circle cx={c.x} cy={c.y} r={7} fill={color} />
          </>
        )}
      </OverlaySvg>
      {text && frame >= startFrame + durationFrames ? (
        <div
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y - ry,
            transform: `translate(-50%, -50%) scale(${pop})`,
            padding: '8px 18px',
            borderRadius: 999,
            border: `3px solid ${color}`,
            background: 'rgba(5, 12, 16, 0.82)',
            color: overlayColors.white,
            fontFamily: overlayFont,
            fontWeight: 800,
            fontSize: 32,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      ) : null}
    </>
  );
};
