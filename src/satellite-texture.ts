import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { delayRender, continueRender, staticFile } from 'remotion';
import * as THREE from 'three';

const textureMap = new Map<string, THREE.Texture>();
const promiseMap = new Map<string, Promise<THREE.Texture | null>>();

/**
 * Preload ảnh vệ tinh đồng bộ với Remotion delayRender theo từng đường dẫn src
 */
export function preloadSatelliteTexture(src = 'media/ho-tay-satellite.jpg'): Promise<THREE.Texture | null> {
  if (textureMap.has(src)) return Promise.resolve(textureMap.get(src)!);
  if (promiseMap.has(src)) return promiseMap.get(src)!;

  const handle = delayRender(`Preloading satellite texture: ${src}`);

  const p = new Promise<THREE.Texture | null>((resolve) => {
    if (typeof window === 'undefined') {
      continueRender(handle);
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      textureMap.set(src, tex);
      continueRender(handle);
      resolve(tex);
    };
    img.onerror = (err) => {
      console.warn(`[SatellitePreload] Không nạp được ${src}:`, err);
      continueRender(handle);
      resolve(null);
    };
    img.src = staticFile(src);
  });

  promiseMap.set(src, p);
  return p;
}

/**
 * Texture ảnh vệ tinh cho component bên trong ThreeCanvas. Giữ render chờ (delayRender) tới khi ảnh nạp xong
 * rồi cập nhật state, để khung hình được chụp sau khi texture đã gắn — kể cả ảnh do fetch-map tải.
 */
export function useSatelliteTexture(src?: string): THREE.Texture | null {
  const initial = () => ({src, tex: src ? textureMap.get(src) ?? null : null, settled: !src || textureMap.has(src)});
  const [state, setState] = useState(initial);
  const pending = useRef<number | null>(null);
  // Khi render, ThreeCanvas chạy frameloop "never" và chỉ vẽ lại khi đổi frame: phải tự advance sau khi texture về.
  const advance = useThree((s) => s.advance);
  const release = () => {
    if (pending.current !== null) { continueRender(pending.current); pending.current = null; }
  };

  useEffect(() => {
    if (!src || textureMap.has(src)) { setState(initial()); return; }
    let cancelled = false;
    pending.current = delayRender(`Waiting for satellite texture: ${src}`);
    // tex = null nếu ảnh lỗi: vẫn settled để không treo render, mặt phẳng dùng màu nền.
    void preloadSatelliteTexture(src).then((tex) => { if (!cancelled) setState({src, tex, settled: true}); });
    return () => { cancelled = true; release(); };
  }, [src]);

  // Nhả delayRender sau khi state mới đã commit, để khung hình được chụp khi texture đã gắn.
  useEffect(() => {
    if (state.src === src && state.settled && pending.current !== null) {
      advance(performance.now());
      release();
    }
  }, [state, src, advance]);

  return state.src === src ? state.tex : null;
}

// Khởi chạy preload sẵn ảnh vệ tinh
void preloadSatelliteTexture('media/ho-tay-plot.jpg');
void preloadSatelliteTexture('media/ho-tay-city.jpg');
void preloadSatelliteTexture('media/ho-tay-space.jpg');
