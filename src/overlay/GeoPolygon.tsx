import {Easing, useCurrentFrame} from 'remotion';
import type {LatLng} from '../geo';
import {geoPathToScreen, progress, toSvgPath} from './geometry';
import {OverlaySvg, useGeoView} from './GeoStage';
import {overlayColors} from './palette';

export type GeoPolygonProps = {
  points: LatLng[];
  startFrame?: number;
  /** Số frame vẽ viền chạy quanh (skill: 18–24). */
  drawFrames?: number;
  /** Số frame fill hiện dần sau khi viền khép kín (skill: 8). */
  fillFrames?: number;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  glow?: boolean;
};

/** Polygon gắn tọa độ: viền vẽ dần bằng dash theo frame, glow 2 lớp, fill fade sau đó. */
export const GeoPolygon = ({points, startFrame = 0, drawFrames = 22, fillFrames = 8, color = overlayColors.plot, fillColor, fillOpacity = 0.4, strokeWidth = 6, glow = true}: GeoPolygonProps) => {
  const frame = useCurrentFrame();
  const view = useGeoView();
  if (frame < startFrame || points.length < 3) return null;
  const draw = Easing.inOut(Easing.cubic)(progress(frame, startFrame, drawFrames));
  const fill = progress(frame, startFrame + drawFrames, fillFrames);
  const d = toSvgPath(geoPathToScreen(view, points), true);
  return (
    <OverlaySvg>
      {(glowId) => (
        <>
          <path d={d} fill={fillColor ?? color} fillOpacity={fillOpacity * fill} stroke="none" />
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={`${draw} 1`}
            filter={glow ? `url(#${glowId})` : undefined}
          />
        </>
      )}
    </OverlaySvg>
  );
};
