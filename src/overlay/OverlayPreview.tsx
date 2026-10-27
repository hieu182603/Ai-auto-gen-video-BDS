// Composition xem thử bộ primitive geo overlay (không phải video sản phẩm).
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import sample from '../../examples/ho-tay.json';
import {distanceMeters, staticImageFrame, type LatLng} from '../geo';
import fixture from './fixtures/ho-tay-lines.json';
import {GeoDashedLine, GeoLineLabel, GeoPin, GeoPolygon, GeoRadius, GeoStage, MapAttribution, PhotoCard, formatKm, overlayColors, safeZone} from './index';

export const OVERLAY_PREVIEW_FRAMES = 240;

const plot: LatLng = sample.gps;
const boundary: LatLng[] = sample.boundaryPolygon;

/**
 * KHUNG MINH HỌA: ảnh demo `ho-tay-satellite.jpg` không có metadata địa lý, nên khung dưới đây chỉ là
 * vùng Web Mercator z16 (256px tile, @2x) căn giữa tại gps ví dụ — không phải tọa độ đo của ảnh.
 * Các tuyến OSM vì vậy đúng vị trí tương đối với nhau nhưng KHÔNG khớp với ảnh nền.
 */
const ILLUSTRATIVE_FRAME = staticImageFrame({center: plot, zoom: 16, width: 800, height: 500, scale: 2, tileSize: 256});

const line = (name: string): LatLng[] => {
  const found = fixture.lines.find((l) => l.name === name);
  if (!found) throw new Error(`Fixture thiếu tuyến ${name}`);
  return found.coords.map(([lat, lng]) => ({lat, lng}));
};

const auCo = line('Đường Âu Cơ');
const xuanDieu = line('Đường Xuân Diệu');
const quangAn = line('Phố Quảng An');
// Điểm đích minh họa: đỉnh OSM của Phố Quảng An xa nhất trong phạm vi 260 m (vẫn nằm trong khung dọc).
const target = quangAn
  .filter((p) => distanceMeters(plot, p) <= 260)
  .reduce((a, b) => (distanceMeters(plot, a) > distanceMeters(plot, b) ? a : b));
const straightKm = distanceMeters(plot, target) / 1000;

export const OverlayPreview = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, OVERLAY_PREVIEW_FRAMES], [1, 1.35], {easing: Easing.inOut(Easing.cubic)});
  const zone = safeZone({width: 1080, height: 1920});
  return (
    <AbsoluteFill>
      <GeoStage src="media/ho-tay-satellite.jpg" frame={ILLUSTRATIVE_FRAME} focus={plot} zoom={zoom}>
        <GeoLineLabel path={auCo} text="Đường Âu Cơ" startFrame={6} highlight={overlayColors.mainRoad} glowColor={overlayColors.mainRoad} />
        <GeoLineLabel path={xuanDieu} text="Đường Xuân Diệu" startFrame={20} fontSize={36} />
        <GeoPolygon points={boundary} startFrame={40} />
        <GeoPin at={plot} label="VỊ TRÍ ĐẤT" startFrame={66} labelBackground={overlayColors.route} labelColor={overlayColors.ink} />
        <GeoRadius center={plot} radiusM={300} startFrame={96} />
        <GeoDashedLine path={[plot, target]} startFrame={136} durationFrames={28} label={`${formatKm(straightKm)} chim bay`} labelOffset={-150} />
        <PhotoCard anchor={target} src="media/ho-tay-plot.jpg" title="Phố Quảng An" subtitle="Ảnh minh họa" cardCenter={{x: 720, y: 1330}} startFrame={176} />
        <MapAttribution text="Ảnh nền demo · khung tọa độ minh họa · Đường: © OpenStreetMap contributors" />
      </GeoStage>
      <div style={{position: 'absolute', left: zone.left, top: zone.bottom - 120, padding: '8px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'sans-serif', fontWeight: 700, fontSize: 26}}>
        MINH HỌA · OverlayPreview
      </div>
    </AbsoluteFill>
  );
};
