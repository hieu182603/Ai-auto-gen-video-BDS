import {useId} from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import type {LatLng} from '../geo';
import {geoPathToScreen, longestRunInside, polylineLength, progress, readableDirection, safeZone, svgId, toSvgPath} from './geometry';
import {OverlaySvg, useGeoView} from './GeoStage';
import {overlayColors, overlayFont} from './palette';

export type GeoLineLabelProps = {
  /** Polyline của đường/sông (OSM). Chữ đặt giữa tuyến, tự đảo chiều để không lộn ngược. */
  path: LatLng[];
  text: string;
  startFrame?: number;
  /** Số frame chữ hiện ra. */
  durationFrames?: number;
  color?: string;
  glowColor?: string;
  fontSize?: number;
  /** Phần tuyến đang thấy quá ngắn khiến chữ nhỏ hơn mức này thì ẩn chữ (vẫn vẽ vệt sáng). */
  minFontSize?: number;
  /** Tô vệt sáng chạy dọc tuyến trước khi chữ hiện (màu, hoặc `false`). */
  highlight?: string | false;
  highlightFrames?: number;
  highlightWidth?: number;
};

/** Tên đường/sông uốn theo tuyến bằng `textPath`, có thể kèm vệt sáng chạy dọc tuyến. */
export const GeoLineLabel = ({path, text, startFrame = 0, durationFrames = 14, color = overlayColors.white, glowColor = overlayColors.route, fontSize = 40, minFontSize = 26, highlight = false, highlightFrames = 24, highlightWidth = 10}: GeoLineLabelProps) => {
  const frame = useCurrentFrame();
  const view = useGeoView();
  const pathId = svgId('line-label', useId());
  if (frame < startFrame || path.length < 2) return null;
  const screen = geoPathToScreen(view, path);
  const d = toSvgPath(screen);
  // Chữ đặt trên phần tuyến nằm trong vùng an toàn, không phải giữa toàn tuyến (có thể ở ngoài khung).
  const visible = longestRunInside(screen, safeZone(view.viewport));
  const pts = readableDirection(visible.length >= 2 ? visible : screen);
  const labelPath = toSvgPath(pts);
  const sweep = Easing.inOut(Easing.cubic)(progress(frame, startFrame, highlightFrames));
  const textStart = highlight ? startFrame + Math.round(highlightFrames * 0.6) : startFrame;
  const t = progress(frame, textStart, durationFrames);
  // Thu nhỏ chữ nếu tuyến trên màn hình ngắn hơn chữ (textPath sẽ cắt phần thừa).
  const size = Math.min(fontSize, (polylineLength(pts) * 0.9) / Math.max(1, text.length * 0.6));
  return (
    <OverlaySvg>
      {(glowId) => (
        <>
          <path id={pathId} d={labelPath} fill="none" stroke="none" />
          {highlight ? (
            <path d={d} pathLength={1} fill="none" stroke={highlight} strokeWidth={highlightWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${sweep} 1`} opacity={0.9} filter={`url(#${glowId})`} />
          ) : null}
          {frame >= textStart && size >= minFontSize ? (
            <text
              fontFamily={overlayFont}
              fontWeight={800}
              fontSize={size}
              fill={color}
              stroke="rgba(0,0,0,0.75)"
              strokeWidth={size * 0.14}
              paintOrder="stroke"
              letterSpacing={interpolate(t, [0, 1], [size * 0.35, size * 0.04])}
              opacity={t}
              dy={-(highlight ? highlightWidth / 2 + size * 0.25 : 0)}
              style={{filter: `drop-shadow(0 0 6px ${glowColor})`}}
            >
              <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                {text}
              </textPath>
            </text>
          ) : null}
        </>
      )}
    </OverlaySvg>
  );
};
