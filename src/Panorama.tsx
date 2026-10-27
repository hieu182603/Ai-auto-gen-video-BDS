import {useEffect, useState} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {BackSide, SRGBColorSpace, Texture, TextureLoader} from 'three';
import {cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

// Readiness is explicit: a frame cannot finish before its panorama is decoded.
export function Panorama({src, duration}: {src: string; duration: number}) {
  const [handle] = useState(() => delayRender('Loading panorama'));
  const [texture, setTexture] = useState<Texture | null>(null);
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  useEffect(() => {
    let disposed = false;
    let loaded: Texture | undefined;
    new TextureLoader().load(staticFile(src), (t) => {
      loaded = t;
      if (disposed) {t.dispose(); return;}
      if (Math.abs(t.image.width / t.image.height - 2) > 0.03) {
        cancelRender(new Error('Ảnh panorama phải là equirectangular 2:1.')); return;
      }
      t.colorSpace = SRGBColorSpace;
      setTexture(t);
    }, undefined, (e) => {if (!disposed) cancelRender(new Error(`Không đọc được panorama: ${String(e)}`));});
    return () => {disposed = true; loaded?.dispose();};
  }, [src]);
  // Continue after React has committed the material with its loaded texture.
  useEffect(() => {if (texture) continueRender(handle);}, [texture, handle]);
  return <ThreeCanvas width={width} height={height} camera={{fov: 72, position: [0, 0, 0]}}>
    {texture && <mesh rotation={[0, frame / Math.max(1, duration - 1) * Math.PI * 2, 0]} scale={[-1, 1, 1]}>
      <sphereGeometry args={[100, 64, 32]}/><meshBasicMaterial map={texture} side={BackSide}/>
    </mesh>}
  </ThreeCanvas>;
}
