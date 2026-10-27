import {createContext, useContext, useId, type ReactNode} from 'react';
import {AbsoluteFill, Img, staticFile, useVideoConfig} from 'remotion';
import type {GeoFrame, LatLng} from '../geo';
import {GLOW_STD_DEVIATION, overlayFont} from './palette';
import {imageBox, svgId, type ImageView} from './geometry';

const GeoViewContext = createContext<ImageView | null>(null);

/** View hiện tại của ảnh bản đồ (do `GeoStage` cung cấp). Mọi primitive chiếu tọa độ qua đây. */
export function useGeoView(): ImageView {
  const v = useContext(GeoViewContext);
  if (!v) throw new Error('Primitive geo overlay phải nằm trong <GeoStage>.');
  return v;
}

export type GeoStageProps = {
  /** Đường dẫn ảnh tương đối với `public/` (giống field media trong input JSON). */
  src: string;
  /** Vùng địa lý ảnh bao phủ (thường là `media.geo`). */
  frame: GeoFrame;
  /** Tọa độ đặt vào giữa khung (pan). Truyền giá trị tính theo frame để camera chuyển động. */
  focus?: LatLng;
  zoom?: number;
  fit?: 'cover' | 'contain';
  /** Bộ lọc nền vệ tinh; mặc định theo skill: tối nhẹ, tương phản cao. */
  imageFilter?: string;
  vignette?: boolean;
  children?: ReactNode;
};

/** Ảnh vệ tinh phủ kín khung + ngữ cảnh chiếu cho các lớp vẽ con. */
export const GeoStage = ({src, frame, focus, zoom, fit, imageFilter = 'brightness(0.78) contrast(1.2) saturate(1.1)', vignette = true, children}: GeoStageProps) => {
  const {width, height} = useVideoConfig();
  const view: ImageView = {frame, viewport: {width, height}, focus, zoom, fit};
  const box = imageBox(view);
  return (
    <AbsoluteFill style={{overflow: 'hidden', backgroundColor: '#05080a'}}>
      <Img src={staticFile(src)} style={{position: 'absolute', ...box, filter: imageFilter, maxWidth: 'none'}} />
      {vignette ? <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)'}} /> : null}
      <GeoViewContext.Provider value={view}>{children}</GeoViewContext.Provider>
    </AbsoluteFill>
  );
};

/** SVG phủ toàn khung với filter glow 2 lớp; `children` nhận id filter để gắn `filter="url(#id)"`. */
export const OverlaySvg = ({children}: {children: (glowId: string) => ReactNode}) => {
  const {width, height} = useVideoConfig();
  const glowId = svgId('glow', useId());
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
      <defs>
        {/* userSpaceOnUse: tuyến nằm ngang/dọc có bbox cao 0 vẫn được lọc. */}
        <filter id={glowId} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={GLOW_STD_DEVIATION[0]} result="near" />
          <feGaussianBlur in="SourceGraphic" stdDeviation={GLOW_STD_DEVIATION[1]} result="far" />
          <feMerge>
            <feMergeNode in="far" />
            <feMergeNode in="near" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {children(glowId)}
    </svg>
  );
};

/** Nhãn nguồn ảnh/dữ liệu bản đồ — bắt buộc giữ khi dùng ảnh vệ tinh hoặc OSM. */
export const MapAttribution = ({text}: {text: string}) => {
  const {width, height} = useVideoConfig();
  return (
    <div style={{position: 'absolute', left: 24, bottom: Math.round(height * 0.2) - 44, maxWidth: width * 0.8, fontFamily: overlayFont, fontSize: 20, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px #000'}}>
      {text}
    </div>
  );
};
