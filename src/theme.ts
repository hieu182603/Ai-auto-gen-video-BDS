import type { CSSProperties } from 'react';

/**
 * Design Tokens: Luxury & Editorial Real Estate System
 * Trích xuất và tối ưu hóa từ design-systems/luxury và editorial của OpenDesign
 */
export const theme = {
  colors: {
    // Nền đen than chì ánh lục bảo sâu (Deep Charcoal Emerald)
    bg: '#091513',
    bgDark: '#050c0b',
    bgMesh: 'radial-gradient(circle at 50% 20%, #152d27 0%, #091513 70%, #050c0b 100%)',

    // Thẻ mờ kính (Glassmorphism Cards)
    cardBg: 'rgba(15, 34, 30, 0.72)',
    cardBgHover: 'rgba(21, 48, 42, 0.85)',
    cardBgGold: 'rgba(218, 187, 114, 0.08)',

    // Vàng kim Champagne & Ánh kim (Champagne Gold Accents)
    gold: '#dfc37a',
    goldLight: '#f4e3b5',
    goldDark: '#9f8540',
    goldGlow: 'rgba(223, 195, 122, 0.35)',

    // Typography
    textPrimary: '#fbfcfb',       // Trắng ngọc trai
    textSecondary: '#c5d7ce',     // Xám ngọc bích nhạt
    textMuted: '#7f998d',         // Xanh rêu xám
    textGold: '#e8d39c',          // Chữ ánh kim

    // Viền (Borders)
    borderLight: 'rgba(197, 215, 206, 0.15)',
    borderGold: 'rgba(223, 195, 122, 0.38)',
    borderGoldGlow: 'rgba(223, 195, 122, 0.65)',

    // Điểm nhấn phụ
    emeraldAccent: '#23584c',
    danger: '#e06c75',
  },

  fonts: {
    serif: '"Map Serif", "Noto Serif", "Times New Roman", serif',
    sans: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif',
  },

  shadows: {
    glass: '0 12px 40px 0 rgba(0, 0, 0, 0.45)',
    goldGlow: '0 0 30px rgba(223, 195, 122, 0.22)',
    cardElevated: '0 20px 48px -10px rgba(0, 0, 0, 0.6)',
  },

  springs: {
    snappy: { damping: 18, stiffness: 220 },
    smooth: { damping: 24, stiffness: 140 },
    gentle: { damping: 30, stiffness: 90 },
  },
};

/** Style tiện ích cho thẻ mờ kính Bento Grid */
export const glassCardStyle = (isGold = false): CSSProperties => ({
  background: isGold ? theme.colors.cardBgGold : theme.colors.cardBg,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${isGold ? theme.colors.borderGold : theme.colors.borderLight}`,
  borderRadius: 14,
  boxShadow: theme.shadows.glass,
  transition: 'transform 0.2s ease, border-color 0.2s ease',
  position: 'relative',
  overflow: 'hidden',
});

/** Badge danh mục phong cách luxury */
export const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 3,
  textTransform: 'uppercase',
  color: theme.colors.gold,
  background: 'rgba(223, 195, 122, 0.12)',
  border: `1px solid ${theme.colors.borderGold}`,
  padding: '6px 14px',
  borderRadius: 30,
};
