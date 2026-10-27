import {theme} from '../theme';

/** Bảng màu neon trên nền vệ tinh tối (skill map-bds-geo-reel · Hệ thống thị giác). */
export const overlayColors = {
  project: '#2d9bff', // ranh dự án
  plot: '#39ff88', // thửa đất
  route: '#ffd23f', // tuyến đường / nét đứt
  mainRoad: '#22e1ff', // trục chính
  amenity: '#e5252a', // nhãn tiện ích
  white: '#ffffff',
  ink: '#0b0b0b',
} as const;

export const overlayFont = theme.fonts.sans;

/** Hai lớp bloom (bán kính ~8px và ~24px). */
export const GLOW_STD_DEVIATION = [4, 12] as const;
