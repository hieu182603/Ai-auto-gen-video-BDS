import {useEffect, useState, useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {interpolate, useCurrentFrame, useVideoConfig, delayRender, continueRender, staticFile} from 'remotion';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Box3, Vector3, type Group} from 'three';
import {BoundaryPolygon3D} from './Boundary3D';
import {SatellitePlane} from './Map3DScene';
import type {Property} from './schema';

function Camera({progress, span}: {progress: number; span: number}) {
  const {camera} = useThree();
  useLayoutEffect(() => {
    const a = 0.6 + progress * 0.65;
    camera.position.set(Math.sin(a) * span * 1.8, span * 1.25, Math.cos(a) * span * 1.8);
    camera.lookAt(0, 1, 0);
    camera.updateProjectionMatrix();
  }, [camera, progress, span]);
  return null;
}

/** Component nạp mô hình 3D (.glb / .gltf) thật sự */
export function LoadedModel({
  src,
  w,
  l,
  stories,
  rise,
}: {
  src: string;
  w: number;
  l: number;
  stories: number;
  rise: number;
}) {
  const [handle] = useState(() => delayRender(`Loading 3D model: ${src}`));
  const [model, setModel] = useState<Group | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();

    loader.load(
      staticFile(src),
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;

        // Tính toán kích thước thật của mô hình để căn chỉnh vào khuôn đất
        const box = new Box3().setFromObject(root);
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());

        // Kích thước mong muốn theo thông số khuôn đất BĐS
        const targetW = w * 0.9;
        const targetL = l * 0.8;
        const targetH = Math.max(stories * 3.2, 3.2);

        // Tỷ lệ scale đồng dạng để mô hình không bị méo
        const sX = targetW / Math.max(size.x, 0.001);
        const sZ = targetL / Math.max(size.z, 0.001);
        const sY = targetH / Math.max(size.y, 0.001);
        const finalScale = Math.min(sX, sZ, sY > 0 ? sY : sX);

        // Đặt tâm mô hình lên mặt đất (y = 0.16 trên đế móng)
        root.position.set(-center.x * finalScale, -box.min.y * finalScale + 0.16, -center.z * finalScale);
        root.scale.set(finalScale, finalScale, finalScale);

        setModel(root);
      },
      undefined,
      (err) => {
        if (!disposed) {
          console.warn(`[3D Loader] Không đọc được file ${src}, tự động chuyển sang mô hình sơ đồ:`, err);
          setFailed(true);
          continueRender(handle);
        }
      }
    );

    return () => {
      disposed = true;
    };
  }, [src, w, l, stories, handle]);

  useEffect(() => {
    if (model) {
      continueRender(handle);
    }
  }, [model, handle]);

  if (failed) {
    return <ProceduralBuilding w={w} l={l} stories={stories} rise={rise} />;
  }

  if (!model) return null;

  return (
    <group scale={[1, rise, 1]}>
      <primitive object={model} />
    </group>
  );
}

/** Mô hình nhà dựng theo thông số tham số hóa (Procedural Fallback) */
function ProceduralBuilding({
  w,
  l,
  stories,
  rise,
}: {
  w: number;
  l: number;
  stories: number;
  rise: number;
}) {
  return (
    <group scale={[1, rise, 1]}>
      {Array.from({length: stories}, (_, i) => (
        <group key={i} position={[0, i * 3.2, 0]}>
          <mesh position={[0, 1.7, 0]}>
            <boxGeometry args={[w, 3, l * 0.8]} />
            <meshStandardMaterial color={i % 2 ? '#d8d9c9' : '#a9b4a7'} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.9, l * 0.4 + 0.03]}>
            <boxGeometry args={[w * 0.72, 1.65, 0.1]} />
            <meshStandardMaterial color="#355e64" metalness={0.3} roughness={0.2} />
          </mesh>
          <mesh position={[0, 3.22, 0]}>
            <boxGeometry args={[w + 0.3, 0.18, l * 0.8 + 0.3]} />
            <meshStandardMaterial color="#eceddf" />
          </mesh>
          <mesh position={[w / 2 + 0.025, 1.9, 0]}>
            <boxGeometry args={[0.08, 1.5, l * 0.48]} />
            <meshStandardMaterial color="#355e64" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function House({property, duration, build = true}: {property: Property; duration: number; build?: boolean}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {widthM: w, lengthM: l, stories} = property.specs;
  const span = Math.max(w, l, stories * 3.2, 10) * (height > width ? 1.4 : 1);
  const rise = build ? interpolate(frame, [0, Math.max(1, duration * 0.6)], [0.001, 1], {extrapolateRight: 'clamp'}) : 1;
  const modelSrc = property.media.model3d;

  return (
    <ThreeCanvas width={width} height={height} camera={{fov: 42, near: 0.1, far: 10000}} gl={{antialias: true}}>
      <color attach="background" args={['#071614']} />
      <fog attach="fog" args={['#071614', span * 2.8, span * 7.5]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[25, 45, 25]} intensity={2.8} color="#fffcf2" />
      <directionalLight position={[-20, 25, -20]} intensity={0.9} color="#a0c8ba" />
      <Camera progress={frame / Math.max(1, duration - 1)} span={span} />

      {/* Mặt đất bản đồ vệ tinh thật (Google Maps / ArcGIS) */}
      {property.media.aerialImage && (
        <SatellitePlane src={property.media.aerialImage} size={span * 9} geo={property.media.geo?.aerialImage} origin={property.gps} />
      )}

      {/* Mặt bằng phân vị khuôn đất BĐS */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[w, 0.08, l]} />
        <meshStandardMaterial color="#dfc37a" transparent opacity={0.32} roughness={0.4} />
      </mesh>

      {/* Khung viền ranh đất phát sáng theo GIS */}
      <BoundaryPolygon3D property={property} duration={duration} yOffset={0.17} />

      {/* Hiển thị mô hình 3D (GLB) hoặc fallback sơ đồ */}
      {modelSrc ? (
        <LoadedModel src={modelSrc} w={w} l={l} stories={stories} rise={rise} />
      ) : (
        <ProceduralBuilding w={w} l={l} stories={stories} rise={rise} />
      )}
    </ThreeCanvas>
  );
}
