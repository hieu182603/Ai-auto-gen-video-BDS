import {useMemo} from 'react';
import * as THREE from 'three';
import {interpolate, useCurrentFrame} from 'remotion';
import type {Property, CoordinatePoint} from './schema';
import {theme} from './theme';
import {toLocalMeters} from './geo';

export interface LocalVertex {
  x: number;
  z: number;
  lengthToNextM: number;
}

/**
 * Chuyển đổi mảng tọa độ GPS (hoặc kích thước width x length) thành các đỉnh 3D cục bộ (mét)
 */
export function getLocalBoundaryVertices(property: Property): LocalVertex[] {
  const {widthM: w, lengthM: l} = property.specs;

  // Nếu có boundaryPolygon được cấp theo tọa độ GIS/Sổ đỏ
  if (property.boundaryPolygon && property.boundaryPolygon.length >= 3) {
    const pts = property.boundaryPolygon.map((pt) => {
      const coord = Array.isArray(pt) ? {lat: pt[0], lng: pt[1]} : pt;
      const m = toLocalMeters(property.gps, coord);
      return {x: m.x, z: -m.y};
    });

    return pts.map((p, i) => {
      const next = pts[(i + 1) % pts.length];
      const dist = Math.hypot(next.x - p.x, next.z - p.z);
      return {
        x: p.x,
        z: p.z,
        lengthToNextM: Math.round(dist * 10) / 10,
      };
    });
  }

  // Tự động sinh hình chữ nhật chuẩn từ widthM và lengthM
  const halfW = w / 2;
  const halfL = l / 2;
  const rectPts = [
    {x: -halfW, z: -halfL},
    {x: halfW, z: -halfL},
    {x: halfW, z: halfL},
    {x: -halfW, z: halfL},
  ];

  return rectPts.map((p, i) => {
    const next = rectPts[(i + 1) % rectPts.length];
    const dist = Math.hypot(next.x - p.x, next.z - p.z);
    return {
      x: p.x,
      z: p.z,
      lengthToNextM: Math.round(dist * 10) / 10,
    };
  });
}

/**
 * Vẽ khung viền ranh đất phát sáng (GIS Boundary Line & Fill) trong không gian 3D Three.js
 */
export function BoundaryPolygon3D({
  property,
  duration,
  yOffset = 0.18,
}: {
  property: Property;
  duration: number;
  yOffset?: number;
}) {
  const frame = useCurrentFrame();
  const vertices = useMemo(() => getLocalBoundaryVertices(property), [property]);

  // Tạo Shape cho mặt phẳng lòng thửa đất
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (vertices.length < 3) return s;
    s.moveTo(vertices[0].x, -vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
      s.lineTo(vertices[i].x, -vertices[i].z);
    }
    s.closePath();
    return s;
  }, [vertices]);

  // Tạo mảng vector cho đường viền kín
  const linePoints = useMemo(() => {
    const pts = vertices.map((v) => new THREE.Vector3(v.x, yOffset, v.z));
    if (pts.length > 0) {
      pts.push(new THREE.Vector3(vertices[0].x, yOffset, vertices[0].z)); // đóng vòng
    }
    return pts;
  }, [vertices, yOffset]);

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(linePoints);
  }, [linePoints]);

  // Hiệu ứng viền vẽ dần (Draw in animation) và nhấp nháy phát sáng (Pulsing Glow)
  const drawProgress = interpolate(frame, [0, Math.min(25, duration * 0.4)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const glow = 1.0 + Math.sin(frame * 0.18) * 0.35;

  return (
    <group scale={[drawProgress, 1, drawProgress]}>
      {/* 1. Mặt phẳng tô màu phát sáng nhẹ trong lòng thửa đất */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, yOffset - 0.02, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color="#dfc37a"
          transparent
          opacity={0.22 * glow}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Đường viền phát sáng Champagne Neon Line */}
      <lineLoop geometry={lineGeometry}>
        <lineBasicMaterial color="#f0d58c" linewidth={3} transparent opacity={0.95} />
      </lineLoop>

      {/* 3. Cột mốc địa chính tại các góc đỉnh (Corner Milestone Stakes) */}
      {vertices.map((v, i) => (
        <group key={i} position={[v.x, yOffset, v.z]}>
          {/* Cọc mốc */}
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 0.5, 8]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
          </mesh>
          {/* Đỉnh phát sáng */}
          <mesh position={[0, 0.52, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial
              color="#dfc37a"
              emissive="#dfc37a"
              emissiveIntensity={1.2 * glow}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
