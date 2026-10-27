import {Easing, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {LatLng} from '../geo';
import {formatKm, geoPathToScreen, offsetPerpendicular, marchingDashOffset, pointAtLength, polylineLength, polylineMidpoint, progress, slicePolyline, toSvgPath} from './geometry';
import {OverlaySvg, useGeoView} from './GeoStage';
import {overlayColors, overlayFont} from './palette';

export type GeoDashedLineProps = {
  /** Tuyến A→B (ít nhất 2 điểm). Dùng geometry OSRM/OSM khi có; đường thẳng 2 điểm là "đường chim bay". */
  path: LatLng[];
  startFrame?: number;
  /** Số frame nét đứt chạy từ A tới B. */
  durationFrames?: number;
  /** Khoảng cách đã có nguồn (OSRM, người dùng). Không truyền thì không hiện nhãn km — component không tự tính. */
  distanceKm?: number;
  /** Ghi đè chữ nhãn giữa tuyến (ví dụ "1,2 km · đường bộ"). */
  label?: string;
  /** Dịch nhãn vuông góc với tuyến (px, dương = bên trái theo chiều A→B trên màn hình) để không che vật khác. */
  labelOffset?: number;
  color?: string;
  labelColor?: string;
  strokeWidth?: number;
  dash?: number;
  gap?: number;
  arrow?: boolean;
  glow?: boolean;
};

/** Nét đứt chạy A→B theo polyline, đầu mũi tên, nhãn km ở giữa tuyến. */
export const GeoDashedLine = ({path, startFrame = 0, durationFrames = 30, distanceKm, label, labelOffset = 0, color = overlayColors.route, labelColor = overlayColors.ink, strokeWidth = 6, dash = 24, gap = 16, arrow = true, glow = true}: GeoDashedLineProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const view = useGeoView();
  if (frame < startFrame || path.length < 2) return null;
  const pts = geoPathToScreen(view, path);
  const total = polylineLength(pts);
  const p = Easing.out(Easing.cubic)(progress(frame, startFrame, durationFrames));
  const drawn = slicePolyline(pts, total * p);
  const tip = pointAtLength(pts, total * p);
  const arrowSize = strokeWidth * 3.2;
  const text = label ?? (distanceKm !== undefined ? formatKm(distanceKm) : undefined);
  const mid = offsetPerpendicular(polylineMidpoint(pts), labelOffset);
  // Nhãn bật ra khi nét đứt đã qua giữa tuyến.
  const labelStart = startFrame + Math.ceil(durationFrames / 2);
  const pop = spring({frame: frame - labelStart, fps, config: {damping: 14, stiffness: 180}});
  return (
    <>
      <OverlaySvg>
        {(glowId) => (
          <g filter={glow ? `url(#${glowId})` : undefined}>
            <path
              d={toSvgPath(drawn)}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeLinejoin="round"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={marchingDashOffset(frame - startFrame, 1.2, dash, gap)}
            />
            {arrow && p > 0 ? (
              <polygon
                points={`${arrowSize},0 ${-arrowSize * 0.7},${arrowSize * 0.75} ${-arrowSize * 0.7},${-arrowSize * 0.75}`}
                fill={color}
                transform={`translate(${tip.x} ${tip.y}) rotate(${(tip.angle * 180) / Math.PI})`}
              />
            ) : null}
          </g>
        )}
      </OverlaySvg>
      {text && frame >= labelStart ? (
        <div
          style={{
            position: 'absolute',
            left: mid.x,
            top: mid.y,
            transform: `translate(-50%, -50%) scale(${pop})`,
            padding: '8px 18px',
            borderRadius: 999,
            background: color,
            color: labelColor,
            fontFamily: overlayFont,
            fontWeight: 800,
            fontSize: 36,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          }}
        >
          {text}
        </div>
      ) : null}
    </>
  );
};
