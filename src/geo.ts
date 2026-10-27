// Chiếu tọa độ dùng chung cho scripts (Node) và bundle Remotion. Không phụ thuộc thư viện.
// Mọi lớp vẽ lên ảnh vệ tinh (pin, polygon, tuyến đường) phải đi qua đây để cùng khớp với ảnh.

export type LatLng = {lat: number; lng: number};

/**
 * Vùng địa lý mà một ảnh bản đồ đã tải về bao phủ.
 * - `mercator`: ảnh Web Mercator (Mapbox/Google Static).
 * - `equirectangular`: ảnh tuyến tính theo độ (ESRI export với imageSR=4326).
 * `width`/`height` là kích thước pixel thật của file ảnh.
 */
export type GeoFrame = {
  projection: 'mercator' | 'equirectangular';
  west: number;
  south: number;
  east: number;
  north: number;
  width: number;
  height: number;
};

export const MAX_MERCATOR_LAT = 85.05112878;
const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Kinh độ → tọa độ Web Mercator chuẩn hóa [0, 1] (0 = 180°T). */
export function mercatorX(lng: number) {
  return (lng + 180) / 360;
}

/** Vĩ độ → tọa độ Web Mercator chuẩn hóa [0, 1] (0 = cực bắc của lưới). */
export function mercatorY(lat: number) {
  const s = Math.sin(rad(Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export function lngFromMercatorX(x: number) {
  return x * 360 - 180;
}

export function latFromMercatorY(y: number) {
  return deg(Math.atan(Math.sinh(Math.PI * (1 - 2 * y))));
}

/**
 * Vùng bao phủ của ảnh Static API căn giữa tại `center`.
 * `width`/`height` là kích thước logic gửi lên API; `scale` là hệ số @2x;
 * `tileSize` là 512 với Mapbox, 256 với Google.
 */
export function staticImageFrame(opts: {
  center: LatLng;
  zoom: number;
  width: number;
  height: number;
  scale?: number;
  tileSize: 256 | 512;
}): GeoFrame {
  const {center, zoom, width, height, scale = 1, tileSize} = opts;
  const world = tileSize * 2 ** zoom;
  const cx = mercatorX(center.lng) * world;
  const cy = mercatorY(center.lat) * world;
  return {
    projection: 'mercator',
    west: lngFromMercatorX((cx - width / 2) / world),
    east: lngFromMercatorX((cx + width / 2) / world),
    north: latFromMercatorY((cy - height / 2) / world),
    south: latFromMercatorY((cy + height / 2) / world),
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Tọa độ → pixel trên ảnh (gốc ở góc trên trái). Điểm ngoài ảnh cho giá trị ngoài [0, width]. */
export function projectToImage(frame: GeoFrame, p: LatLng): {x: number; y: number} {
  if (frame.projection === 'mercator') {
    const x0 = mercatorX(frame.west);
    const y0 = mercatorY(frame.north);
    return {
      x: ((mercatorX(p.lng) - x0) / (mercatorX(frame.east) - x0)) * frame.width,
      y: ((mercatorY(p.lat) - y0) / (mercatorY(frame.south) - y0)) * frame.height,
    };
  }
  return {
    x: ((p.lng - frame.west) / (frame.east - frame.west)) * frame.width,
    y: ((frame.north - p.lat) / (frame.north - frame.south)) * frame.height,
  };
}

/** Pixel trên ảnh → tọa độ (nghịch đảo của projectToImage). */
export function imageToLatLng(frame: GeoFrame, x: number, y: number): LatLng {
  const u = x / frame.width;
  const v = y / frame.height;
  if (frame.projection === 'mercator') {
    const x0 = mercatorX(frame.west);
    const y0 = mercatorY(frame.north);
    return {
      lng: lngFromMercatorX(x0 + u * (mercatorX(frame.east) - x0)),
      lat: latFromMercatorY(y0 + v * (mercatorY(frame.south) - y0)),
    };
  }
  return {
    lng: frame.west + u * (frame.east - frame.west),
    lat: frame.north - v * (frame.north - frame.south),
  };
}

export function frameContains(frame: GeoFrame, p: LatLng) {
  return p.lng >= frame.west && p.lng <= frame.east && p.lat >= frame.south && p.lat <= frame.north;
}

export function frameCenter(frame: GeoFrame): LatLng {
  return imageToLatLng(frame, frame.width / 2, frame.height / 2);
}

/** Khoảng cách đường chim bay (Haversine), đơn vị mét. */
export function distanceMeters(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Tọa độ → mét cục bộ quanh `origin` (x = đông, y = bắc). Xấp xỉ phẳng,
 * sai số không đáng kể trong phạm vi vài chục km — đủ cho cảnh thửa đất/khu vực.
 * Trong Three.js dùng x = east, z = -north.
 */
export function toLocalMeters(origin: LatLng, p: LatLng): {x: number; y: number} {
  const mPerDeg = (EARTH_RADIUS_M * Math.PI) / 180;
  return {
    x: (p.lng - origin.lng) * mPerDeg * Math.cos(rad(origin.lat)),
    y: (p.lat - origin.lat) * mPerDeg,
  };
}

/** Kích thước mặt đất (mét) mà ảnh bao phủ, đo qua tâm ảnh. */
export function frameGroundSize(frame: GeoFrame): {widthM: number; heightM: number} {
  const c = frameCenter(frame);
  return {
    widthM: distanceMeters({lat: c.lat, lng: frame.west}, {lat: c.lat, lng: frame.east}),
    heightM: distanceMeters({lat: frame.north, lng: c.lng}, {lat: frame.south, lng: c.lng}),
  };
}

/**
 * Đặt ảnh bản đồ lên mặt đất Three.js quanh `origin` (gps của BĐS), đơn vị mét:
 * x = đông, z = −bắc, kích thước theo mặt đất thật mà ảnh bao phủ.
 * Dùng với planeGeometry(width, height) xoay −90° quanh trục X (mép trên ảnh hướng bắc).
 */
export function groundPlaneForFrame(frame: GeoFrame, origin: LatLng): {width: number; height: number; x: number; z: number} {
  const {widthM, heightM} = frameGroundSize(frame);
  const c = toLocalMeters(origin, frameCenter(frame));
  return {width: widthM, height: heightM, x: c.x, z: -c.y};
}
