// Hình học thuần cho lớp vẽ lên ảnh vệ tinh 2D. Không phụ thuộc React/Remotion để test được bằng số.
// Chuỗi chiếu: LatLng → pixel ảnh (projectToImage) → pixel màn hình (cover + pan/zoom).
import {projectToImage, toLocalMeters, type GeoFrame, type LatLng} from '../geo';

export type Point = {x: number; y: number};

/**
 * Cách ảnh bản đồ được hiển thị trong khung hình.
 * - `fit`: `cover` (mặc định, phủ kín khung như `object-fit: cover`) hoặc `contain`.
 * - `zoom`: nhân thêm vào tỉ lệ fit (1 = vừa khít).
 * - `focus`: tọa độ được đưa về giữa khung (pan). Mặc định là tâm ảnh.
 * - `clamp`: với `cover`, giữ ảnh luôn phủ kín khung (không lộ mép) — focus sát mép ảnh sẽ lệch khỏi tâm khung.
 */
export type ImageView = {
  frame: GeoFrame;
  viewport: {width: number; height: number};
  fit?: 'cover' | 'contain';
  zoom?: number;
  focus?: LatLng;
  clamp?: boolean;
};

/** screen = image · scale + offset */
export type ImageTransform = {scale: number; offsetX: number; offsetY: number};

export function imageTransform(view: ImageView): ImageTransform {
  const {frame, viewport, fit = 'cover', zoom = 1, clamp = true} = view;
  const sx = viewport.width / frame.width;
  const sy = viewport.height / frame.height;
  const scale = (fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)) * zoom;
  const focus = view.focus ? projectToImage(frame, view.focus) : {x: frame.width / 2, y: frame.height / 2};
  let offsetX = viewport.width / 2 - focus.x * scale;
  let offsetY = viewport.height / 2 - focus.y * scale;
  const w = frame.width * scale;
  const h = frame.height * scale;
  if (clamp) {
    // Ảnh lớn hơn khung: không để lộ mép. Ảnh nhỏ hơn khung (contain): căn giữa.
    offsetX = w >= viewport.width ? Math.min(0, Math.max(viewport.width - w, offsetX)) : (viewport.width - w) / 2;
    offsetY = h >= viewport.height ? Math.min(0, Math.max(viewport.height - h, offsetY)) : (viewport.height - h) / 2;
  }
  return {scale, offsetX, offsetY};
}

/** Vị trí/kích thước CSS cho thẻ ảnh để khớp đúng với các lớp vẽ (dùng chung một transform). */
export function imageBox(view: ImageView) {
  const t = imageTransform(view);
  return {left: t.offsetX, top: t.offsetY, width: view.frame.width * t.scale, height: view.frame.height * t.scale};
}

export function geoToScreen(view: ImageView, p: LatLng, t: ImageTransform = imageTransform(view)): Point {
  const img = projectToImage(view.frame, p);
  return {x: img.x * t.scale + t.offsetX, y: img.y * t.scale + t.offsetY};
}

export function geoPathToScreen(view: ImageView, pts: LatLng[]): Point[] {
  const t = imageTransform(view);
  return pts.map((p) => geoToScreen(view, p, t));
}

/**
 * Số pixel màn hình cho 1 mét mặt đất tại `at`, theo hai trục (đông, bắc).
 * Mercator bảo giác nên x ≈ y; ảnh equirectangular cho hai giá trị khác nhau (vòng tròn thành ellipse).
 */
export function pixelsPerMeter(view: ImageView, at: LatLng): {x: number; y: number} {
  const d = 1e-4; // ~11 m: đủ nhỏ để tuyến tính, đủ lớn để tránh sai số làm tròn
  const t = imageTransform(view);
  const p0 = geoToScreen(view, at, t);
  const pe = geoToScreen(view, {lat: at.lat, lng: at.lng + d}, t);
  const pn = geoToScreen(view, {lat: at.lat + d, lng: at.lng}, t);
  return {
    x: Math.abs(pe.x - p0.x) / Math.abs(toLocalMeters(at, {lat: at.lat, lng: at.lng + d}).x),
    y: Math.abs(pn.y - p0.y) / Math.abs(toLocalMeters(at, {lat: at.lat + d, lng: at.lng}).y),
  };
}

/** Bán kính mét → bán kính pixel (rx theo trục đông, ry theo trục bắc). */
export function radiusToPixels(view: ImageView, center: LatLng, radiusM: number): {rx: number; ry: number} {
  const ppm = pixelsPerMeter(view, center);
  return {rx: radiusM * ppm.x, ry: radiusM * ppm.y};
}

// ---------- Polyline ----------

/** Độ dài tích lũy tại từng đỉnh; phần tử cuối là tổng độ dài. */
export function cumulativeLengths(pts: Point[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return out;
}

export function polylineLength(pts: Point[]) {
  const c = cumulativeLengths(pts);
  return c[c.length - 1];
}

/** Điểm và hướng (radian, 0 = sang phải, chiều kim đồng hồ trên màn hình) tại khoảng cách `d` dọc tuyến. */
export function pointAtLength(pts: Point[], d: number): Point & {angle: number} {
  if (pts.length === 0) return {x: 0, y: 0, angle: 0};
  if (pts.length === 1) return {...pts[0], angle: 0};
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1];
  const dd = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < dd) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = cum[i] - cum[i - 1];
  const u = seg === 0 ? 0 : (dd - cum[i - 1]) / seg;
  return {x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x)};
}

/** Phần đầu của tuyến dài `d` pixel (dùng để vẽ dần nét đứt mà dash vẫn giữ đúng kích thước). */
export function slicePolyline(pts: Point[], d: number): Point[] {
  if (pts.length < 2) return [...pts];
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1];
  if (d >= total) return [...pts];
  if (d <= 0) return [pts[0]];
  const out: Point[] = [pts[0]];
  let i = 1;
  while (i < pts.length && cum[i] < d) out.push(pts[i++]);
  const end = pointAtLength(pts, d);
  out.push({x: end.x, y: end.y});
  return out;
}

/** Điểm giữa theo độ dài tuyến (không phải trung bình các đỉnh) — chỗ đặt nhãn km. */
export function polylineMidpoint(pts: Point[]) {
  return pointAtLength(pts, polylineLength(pts) / 2);
}

/** Đảo chiều tuyến nếu cần để chữ chạy theo textPath không bị lộn ngược (đi từ trái sang phải). */
export function readableDirection(pts: Point[]): Point[] {
  if (pts.length < 2) return pts;
  return pts[pts.length - 1].x < pts[0].x ? [...pts].reverse() : pts;
}

export function toSvgPath(pts: Point[], closed = false) {
  if (pts.length === 0) return '';
  const body = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return closed ? `${body} Z` : body;
}

/**
 * Nét đứt chạy: số dash/gap cố định theo pixel; `offset` âm theo frame làm nét "chảy" về phía B.
 * Trả về dashoffset để dùng cho `stroke-dashoffset`.
 */
export function marchingDashOffset(frame: number, speedPxPerFrame: number, dash: number, gap: number) {
  const period = dash + gap;
  return -((frame * speedPxPerFrame) % period);
}

// ---------- Thời gian ----------

/** Tiến độ tuyến tính [0, 1] của một hiệu ứng bắt đầu ở `start`, kéo dài `duration` frame. */
export function progress(frame: number, start: number, duration: number) {
  if (duration <= 0) return frame >= start ? 1 : 0;
  return Math.max(0, Math.min(1, (frame - start) / duration));
}

// ---------- Vùng an toàn TikTok ----------

/** Vùng an toàn chữ cho khung 1080×1920 (skill map-bds-geo-reel). Tỉ lệ theo chiều rộng/cao khung khác. */
export function safeZone(viewport: {width: number; height: number}) {
  const kx = viewport.width / 1080;
  const ky = viewport.height / 1920;
  return {left: 60 * kx, right: 900 * kx, top: 220 * ky, bottom: 1500 * ky};
}

/** Dịch hộp (x, y, w, h — góc trên trái) vào trong vùng an toàn, giữ nguyên kích thước. */
export function clampBoxToSafeZone(box: {x: number; y: number; width: number; height: number}, viewport: {width: number; height: number}) {
  const z = safeZone(viewport);
  const x = Math.max(z.left, Math.min(z.right - box.width, box.x));
  const y = Math.max(z.top, Math.min(z.bottom - box.height, box.y));
  return {...box, x, y};
}

/** Định dạng bán kính thật thành nhãn, ví dụ 500 → "500 m", 1500 → "1,5 km". */
export function formatMeters(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = Math.round(m / 100) / 10;
  return `${String(km).replace('.', ',')} km`;
}

/** Nhãn km cho khoảng cách đã có nguồn (OSRM/người dùng), ví dụ 1.24 → "1,2 km", 12.6 → "13 km". */
export function formatKm(km: number) {
  const v = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${String(v).replace('.', ',')} km`;
}

/** Id an toàn cho tham chiếu SVG `url(#…)`/`href="#…"` từ `useId()` của React. */
export function svgId(prefix: string, reactId: string) {
  return `${prefix}-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Đoạn liên tục dài nhất (theo độ dài) có các đỉnh nằm trong hình chữ nhật — để đặt nhãn trên phần tuyến đang thấy. */
export function longestRunInside(pts: Point[], rect: {left: number; top: number; right: number; bottom: number}): Point[] {
  let best: Point[] = [];
  let bestLen = -1;
  let run: Point[] = [];
  const flush = () => {
    const len = run.length >= 2 ? polylineLength(run) : 0;
    if (run.length > 0 && len > bestLen) { best = run; bestLen = len; }
    run = [];
  };
  for (const p of pts) {
    if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) run.push(p);
    else flush();
  }
  flush();
  return best;
}

/** Dời điểm theo pháp tuyến của hướng `angle` (dương = bên trái khi nhìn theo hướng đi, trục y màn hình hướng xuống). */
export function offsetPerpendicular(p: Point & {angle: number}, dist: number): Point & {angle: number} {
  return {x: p.x + Math.sin(p.angle) * dist, y: p.y - Math.cos(p.angle) * dist, angle: p.angle};
}
