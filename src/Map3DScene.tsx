import React, {useLayoutEffect, useMemo} from 'react';
import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import type {Property} from './schema';
import {BoundaryPolygon3D} from './Boundary3D';
import {useSatelliteTexture} from './satellite-texture';
import {LoadedModel} from './House';
import {theme, glassCardStyle} from './theme';
import {groundPlaneForFrame, type GeoFrame, type LatLng} from './geo';

/**
 * Bầu trời sao trong không gian vũ trụ
 */
function EarthStars({count = 250}: {count?: number}) {
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1200;
      pos[i * 3 + 1] = Math.random() * 600 + 100;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1200;
    }
    return pos;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={2.5} color="#e0f2fe" transparent opacity={0.8} />
    </points>
  );
}

/**
 * Camera Zoom điện ảnh: Từ ngoài không gian vũ trụ -> Lao xuyên mây -> Khoanh vùng địa điểm -> Đi sâu vào lô đất
 */
function EarthZoomCamera({progress, span}: {progress: number; span: number}) {
  const {camera} = useThree();

  useLayoutEffect(() => {
    let x = 0;
    let y = 0;
    let z = 0;
    let targetY = 0;

    if (progress < 0.28) {
      // GIAI ĐOẠN 1: Từ ngoài vũ trụ lao dốc siêu tốc (Space Descent)
      const t = progress / 0.28;
      const easeT = t * t; // Tăng tốc rơi tự do
      y = interpolate(easeT, [0, 1], [span * 52, span * 14]);
      z = interpolate(easeT, [0, 1], [span * 34, span * 9]);
      x = interpolate(easeT, [0, 1], [span * 8, span * 1.5]);
      targetY = span * 0.2;
    } else if (progress < 0.65) {
      // GIAI ĐOẠN 2: Tiếp cận thành phố & khoanh vùng địa bàn hành chính
      const t = (progress - 0.28) / (0.65 - 0.28);
      y = interpolate(t, [0, 1], [span * 14, span * 3.8]);
      z = interpolate(t, [0, 1], [span * 9, span * 3.2]);
      x = interpolate(t, [0, 1], [span * 1.5, span * 0.8]);
      targetY = span * 0.15;
    } else {
      // GIAI ĐOẠN 3: Đi sâu sát vào lô đất & Xoay vòng Orbit 360 độ
      const t = (progress - 0.65) / 0.35;
      const orbitAngle = t * Math.PI * 1.15 - 0.35;
      const height = interpolate(t, [0, 1], [span * 3.8, span * 1.15], {extrapolateRight: 'clamp'});
      const distance = interpolate(t, [0, 1], [span * 3.2, span * 1.55], {extrapolateRight: 'clamp'});
      x = Math.sin(orbitAngle) * distance;
      y = height;
      z = Math.cos(orbitAngle) * distance;
      targetY = span * 0.1;
    }

    camera.position.set(x, y, z);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
  }, [camera, progress, span]);

  return null;
}

/** Mặt phẳng ảnh theo vùng bao phủ thật (media.geo); không có metadata thì dùng kích thước minh họa cũ, căn giữa gps. */
function groundPlane(geo: GeoFrame | undefined, origin: LatLng, fallback: [number, number]) {
  return geo ? groundPlaneForFrame(geo, origin) : {width: fallback[0], height: fallback[1], x: 0, z: 0};
}

/**
 * Tầng bản đồ vệ tinh đa cấp độ (Multi-Zoom Crossfade Planes)
 */
function MultiZoomSatelliteGround({
  p,
  progress,
  span,
}: {
  p: Property;
  progress: number;
  span: number;
}) {
  // Không có ảnh thì để nền màu trơn: không lấy ảnh của BĐS khác làm ảnh vị trí.
  const spaceTex = useSatelliteTexture(p.media.spaceImage);
  const cityTex = useSatelliteTexture(p.media.cityImage);
  const plotTex = useSatelliteTexture(p.media.aerialImage);
  // Tầng vũ trụ/thành phố giữ tỉ lệ theo span để camera zoom bậc thang vẫn đọc được; chỉ tầng thửa đất cần khớp ranh.
  const plotPlane = groundPlane(p.media.aerialImage ? p.media.geo?.aerialImage : undefined, p.gps, [span * 5.5, span * 4.2]);

  // Độ mờ chuyển cảnh mượt mà giữa các tầng
  const spaceOpacity = interpolate(progress, [0.22, 0.36], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cityOpacity = interpolate(progress, [0.22, 0.32, 0.62, 0.72], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const plotOpacity = interpolate(progress, [0.60, 0.70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <group position={[0, -0.05, 0]}>
      {/* 1. Tầng Không Gian / Vũ Trụ (Zoom 4) */}
      {spaceOpacity > 0.01 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
          <planeGeometry args={[span * 75, span * 55]} />
          {spaceTex ? (
            <meshBasicMaterial key={spaceTex.uuid} map={spaceTex} transparent opacity={spaceOpacity} side={THREE.DoubleSide} />
          ) : (
            <meshBasicMaterial color="#05121b" transparent opacity={spaceOpacity} />
          )}
        </mesh>
      )}

      {/* 2. Tầng Thành Phố / Khu Vực (Zoom 12) */}
      {cityOpacity > 0.01 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
          <planeGeometry args={[span * 22, span * 16]} />
          {cityTex ? (
            <meshBasicMaterial key={cityTex.uuid} map={cityTex} transparent opacity={cityOpacity} side={THREE.DoubleSide} />
          ) : (
            <meshBasicMaterial color="#0b1c1b" transparent opacity={cityOpacity} />
          )}
        </mesh>
      )}

      {/* 3. Tầng Cận Cảnh Thửa Đất Thực Tế (Zoom 17) — đúng tỉ lệ mét nếu có media.geo để khớp ranh thửa */}
      {plotOpacity > 0.01 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[plotPlane.x, 0, plotPlane.z]}>
          <planeGeometry args={[plotPlane.width, plotPlane.height]} />
          {plotTex ? (
            <meshBasicMaterial key={plotTex.uuid} map={plotTex} transparent opacity={plotOpacity} side={THREE.DoubleSide} />
          ) : (
            <meshBasicMaterial color="#0d2823" transparent opacity={plotOpacity} />
          )}
        </mesh>
      )}
    </group>
  );
}

/**
 * Mặt phẳng ảnh vệ tinh đơn lẻ (hỗ trợ tương thích ngược cho Scene 2)
 */
export function SatellitePlane({src, size, geo, origin}: {src?: string; size: number; geo?: GeoFrame; origin: LatLng}) {
  const tex = useSatelliteTexture(src);
  const plane = groundPlane(geo, origin, [size, size * 0.75]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[plane.x, -0.01, plane.z]}>
      <planeGeometry args={[plane.width, plane.height]} />
      {tex ? (
        <meshBasicMaterial key={tex.uuid} map={tex} side={THREE.DoubleSide} />
      ) : (
        <meshBasicMaterial color="#0f231c" />
      )}
    </mesh>
  );
}

/**
 * Hiệu ứng sóng radar & cột sáng định vị
 */
function WaterRipples3D({frame, span}: {frame: number; span: number}) {
  const ringCount = 3;

  return (
    <group position={[0, 0.05, 0]}>
      <mesh position={[0, span * 0.6, 0]}>
        <cylinderGeometry args={[0.08, 0.25, span * 1.2, 16]} />
        <meshStandardMaterial
          color="#dfc37a"
          emissive="#dfc37a"
          emissiveIntensity={1.5}
          transparent
          opacity={0.35}
        />
      </mesh>

      {Array.from({length: ringCount}).map((_, i) => {
        const offset = i * 14;
        const loopFrames = 42;
        const loopProgress = ((frame + offset) % loopFrames) / loopFrames;
        const radius = interpolate(loopProgress, [0, 1], [span * 0.08, span * 0.95]);
        const opacity = interpolate(loopProgress, [0, 0.3, 1], [0.75, 0.35, 0]);

        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(0.01, radius * 0.96), radius, 48]} />
            <meshBasicMaterial
              color="#dfc37a"
              side={THREE.DoubleSide}
              transparent
              opacity={opacity}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Scene Bản đồ 3D vệ tinh chân thực: Cú Zoom từ Vũ Trụ -> Khoanh vùng địa điểm -> Đi sâu vào Lô đất
 */
export function Map3DScene({
  property: p,
  duration,
  portrait = false,
}: {
  property: Property;
  duration: number;
  portrait?: boolean;
}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  const progress = frame / Math.max(1, duration - 1);
  const span = Math.max(p.specs.widthM, p.specs.lengthM, 25);

  // Tính toán thông số bay thực tế theo giai đoạn
  let telemetryStage = '1/3 · KHÔNG GIAN VŨ TRỤ';
  let telemetryAction = 'Lao dốc siêu tốc xuyên khí quyển';
  let simulatedAlt = Math.round(interpolate(progress, [0, 0.28], [350000, 15000], {extrapolateRight: 'clamp'}));

  if (progress >= 0.28 && progress < 0.65) {
    telemetryStage = '2/3 · KHOANH VÙNG ĐỊA ĐIỂM';
    telemetryAction = 'Định vị ranh giới hành chính';
    simulatedAlt = Math.round(interpolate(progress, [0.28, 0.65], [15000, 800], {extrapolateRight: 'clamp'}));
  } else if (progress >= 0.65) {
    telemetryStage = '3/3 · TIẾP CẬN THỰC ĐỊA';
    telemetryAction = 'Hạ sát lô đất & Orbit 360°';
    simulatedAlt = Math.round(interpolate(progress, [0.65, 1], [800, 28], {extrapolateRight: 'clamp'}));
  }

  // Tỷ lệ xuất hiện của mô hình 3D ở giai đoạn 3
  const houseRise = interpolate(progress, [0.68, 0.88], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#030807'}}>
      {/* CANVAS 3D RENDER ĐIỆN ẢNH */}
      <ThreeCanvas
        width={width}
        height={height}
        camera={{fov: 46, near: 0.1, far: 8000}}
        gl={{antialias: true}}
      >
        <color attach="background" args={['#030807']} />
        <ambientLight intensity={1.9} />
        <directionalLight position={[40, 80, 40]} intensity={2.9} color="#fffcf2" />
        <directionalLight position={[-30, 40, -30]} intensity={1.1} color="#9ec5b6" />

        {/* 1. Bầu trời sao trong không gian */}
        <EarthStars count={300} />

        {/* 2. Camera Zoom từ ngoài không gian vào */}
        <EarthZoomCamera progress={progress} span={span} />

        {/* 3. Mặt đất vệ tinh 3 tầng đa độ phân giải */}
        <MultiZoomSatelliteGround p={p} progress={progress} span={span} />

        {/* 4. Khung ranh giới hành chính & lô đất (Khoanh vùng phát sáng) */}
        <BoundaryPolygon3D property={p} duration={duration} yOffset={0.12} />

        {/* 5. Cột sóng radar tỏa tròn từ tâm BĐS */}
        <WaterRipples3D frame={frame} span={span} />

        {/* 6. Mô hình 3D (Biệt thự / Shophouse) xuất hiện khi đi sâu vào lô đất */}
        {houseRise > 0.01 && p.media.model3d && (
          <group position={[0, 0, 0]}>
            <LoadedModel
              src={p.media.model3d}
              w={p.specs.widthM}
              l={p.specs.lengthM}
              stories={p.specs.stories}
              rise={houseRise}
            />
          </group>
        )}
      </ThreeCanvas>

      {/* LỚP GRADIENT ĐIỆN ẢNH VÀ THÔNG SỐ HUD */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(3,8,7,0.7) 0%, transparent 45%, rgba(2,6,5,0.92) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* HUD GÓC PHẢI TRÊN: THÔNG SỐ BAY FLIGHT TELEMETRY THEO THỜI GIAN THẬT */}
      <div
        style={{
          position: 'absolute',
          top: portrait ? 240 : 170,
          right: portrait ? 40 : 90,
          ...glassCardStyle(false),
          padding: portrait ? '12px 18px' : '14px 22px',
          borderColor: 'rgba(223, 195, 122, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 20,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <span style={{width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80'}} />
          <span style={{fontSize: 12, fontWeight: 700, color: theme.colors.gold, letterSpacing: 1.5, textTransform: 'uppercase'}}>
            {telemetryStage}
          </span>
        </div>
        <div style={{fontSize: 13, color: '#f1f5f9', fontWeight: 600}}>
          Độ cao: <b style={{color: theme.colors.gold}}>{simulatedAlt >= 1000 ? `${(simulatedAlt / 1000).toFixed(1)} km` : `${simulatedAlt} m`}</b> · {telemetryAction}
        </div>
        <div style={{fontSize: 11, color: theme.colors.textMuted}}>
          Hệ thống: WGS84 GIS · Mapbox High-Res Satellite
        </div>
      </div>
    </AbsoluteFill>
  );
}
