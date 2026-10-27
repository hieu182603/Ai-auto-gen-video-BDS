import {z} from 'zod';

// Media references are relative to public/. No remote fetches during a render.
const assetPath = z.string().min(1).refine(
  (v) => !v.includes(':') && !v.includes('\\') && !v.startsWith('/') &&
    !v.split('/').some((p) => p === '..' || p === '.' || p === '') && !/[?#%]/.test(v),
  'Dùng đường dẫn tương đối trong public/, ví dụ media/nha.jpg',
);
const text = (max: number) => z.string().trim().min(1).max(max);
export const coordinatePointSchema = z.union([
  z.object({lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180)}),
  z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]).transform(([lat, lng]) => ({lat, lng})),
]);
export type CoordinatePoint = z.infer<typeof coordinatePointSchema>;

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

// Vùng bao phủ của một ảnh bản đồ đã tải (xem src/geo.ts). Do fetch-map ghi, không nhập tay.
export const geoFrameSchema = z.object({
  projection: z.enum(['mercator', 'equirectangular']),
  west: lng, south: lat, east: lng, north: lat,
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
}).strict().refine((f) => f.west < f.east && f.south < f.north, 'Vùng ảnh phải có west < east và south < north');

export const amenitySchema = z.object({
  name: text(65),
  // Đường chim bay từ gps nếu lấy từ scan-amenities; theo người đăng nếu nhập tay.
  distanceM: z.number().nonnegative().max(100000),
  lat: lat.optional(),
  lng: lng.optional(),
  category: z.enum(['education', 'health', 'shopping', 'leisure', 'other']).optional(),
  image: assetPath.optional(),
}).strict().refine((a) => (a.lat === undefined) === (a.lng === undefined), 'Tiện ích cần đủ cả lat và lng, hoặc bỏ cả hai');

// Ranh phường/xã/tỉnh do fetch-boundary lấy từ OSM. Khác boundaryPolygon (ranh thửa đất).
// Vòng đa giác hở: không lặp lại điểm đầu ở cuối.
export const adminBoundarySchema = z.object({
  name: text(180),
  adminLevel: z.number().int().min(1).max(12).optional(),
  osmId: z.number().int().positive().optional(),
  polygon: z.array(coordinatePointSchema).min(3).max(300).refine((pts) => {
    const first = pts[0];
    const last = pts[pts.length - 1];
    return !(first.lat === last.lat && first.lng === last.lng);
  }, 'adminBoundary.polygon không được lặp lại điểm đầu ở cuối'),
}).strict();
export type AdminBoundary = z.infer<typeof adminBoundarySchema>;

export const propertySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  title: text(100),
  address: text(180),
  gps: z.object({lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180)}),
  // Ranh thửa đất (sổ đỏ/đo đạc), nhập tay. Không ghi ranh hành chính vào đây.
  boundaryPolygon: z.array(coordinatePointSchema).min(3).max(300).optional(),
  adminBoundary: adminBoundarySchema.optional(),
  specs: z.object({
    areaM2: z.number().positive().max(1000000),
    widthM: z.number().positive().max(1000),
    lengthM: z.number().positive().max(1000),
    stories: z.number().int().min(0).max(20),
  }),
  amenities: z.array(amenitySchema).max(6).default([]),
  routes: z.array(z.object({
    name: text(80),
    path: z.array(coordinatePointSchema).min(2).max(500),
    distanceKm: z.number().nonnegative().optional(),
    durationMin: z.number().nonnegative().optional(),
  })).max(4).optional(),
  branding: z.object({
    logo: assetPath.optional(),
    name: text(80).optional(),
    slogan: text(120).optional(),
  }).optional(),
  badge: z.object({
    text: text(40),
    price: text(30).optional(),
    status: text(30).optional(),
    style: z.enum([
      'gold24k',
      'platinum',
      'bronze',
      'emerald',
      'signboard',
      'two_legs',
      'sold_stamp',
      'neon',
    ]).default('signboard'),
  }).optional(),
  contact: z.object({name: text(70), cta: text(100), phone: text(35).optional()}),
  video: z.object({
    format: z.enum(['landscape', 'portrait']).default('landscape'),
    durationSeconds: z.number().int().min(12).max(120).default(60),
    fps: z.union([z.literal(24), z.literal(30)]).default(24),
  }).default({format: 'landscape', durationSeconds: 60, fps: 24}),
  media: z.object({
    spaceImage: assetPath.optional(),
    cityImage: assetPath.optional(),
    aerialImage: assetPath.optional(),
    propertyImage: assetPath.optional(),
    streetVideo: assetPath.optional(),
    panorama: assetPath.optional(),
    model3d: assetPath.optional(),
    voiceover: assetPath.optional(),
    sceneVoiceovers: z.array(assetPath).length(5).optional(),
    music: assetPath.optional(),
    attribution: text(200).optional(),
    geo: z.object({
      spaceImage: geoFrameSchema.optional(),
      cityImage: geoFrameSchema.optional(),
      aerialImage: geoFrameSchema.optional(),
    }).strict().optional(),
  }).default({}),
  dataSources: z.array(z.enum(['osm'])).max(5).optional(),
  disclaimer: text(160).default('PHỐI CẢNH MINH HỌA · THÔNG TIN DO NGƯỜI ĐĂNG CUNG CẤP'),
}).strict();
export type Property = z.infer<typeof propertySchema>;

export function dimensions(format: Property['video']['format']) {
  return format === 'portrait' ? {width: 1080, height: 1920} : {width: 1920, height: 1080};
}
