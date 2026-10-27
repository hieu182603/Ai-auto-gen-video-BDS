import type {Property} from './schema';

/**
 * Kiểm tra xem BĐS có sử dụng dữ liệu từ mạng lưới OpenStreetMap hay không
 * (từ dataSources, tuyến đường OSRM hoặc tiện ích có tọa độ).
 */
export function usesOsmData(p: Property): boolean {
  if (p.dataSources?.includes('osm')) return true;
  if (p.routes && p.routes.length > 0) return true;
  if (p.amenities && p.amenities.some((a) => a.lat !== undefined && a.lng !== undefined)) return true;
  return false;
}
