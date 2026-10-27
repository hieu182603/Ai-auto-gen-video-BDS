import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fromRoot} from './project';

// Polyfill FileReader for Node.js environment
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onload: ((e: {target: NodeFileReader}) => void) | null = null;
  onloadend: ((e: {target: NodeFileReader}) => void) | null = null;

  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onload) this.onload({target: this});
      if (this.onloadend) this.onloadend({target: this});
    });
  }
}
// @ts-expect-error polyfill
globalThis.FileReader = NodeFileReader;

export async function createSampleVillaModel(): Promise<Buffer> {
  const root = new THREE.Group();
  root.name = 'LuxuryVilla';

  // 1. Đế móng đá & Sàn gỗ ngoài trời (Terrace Deck)
  const deckGeo = new THREE.BoxGeometry(6.4, 0.25, 9.2);
  const deckMat = new THREE.MeshStandardMaterial({
    color: '#8b5a2b',
    roughness: 0.65,
    metalness: 0.05,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(0, 0.125, 0);
  root.add(deck);

  // Lối đi lát đá bước dạo (Paver walkway)
  const paverMat = new THREE.MeshStandardMaterial({color: '#4a5568', roughness: 0.8});
  for (let i = 0; i < 4; i++) {
    const paver = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), paverMat);
    paver.position.set(0, 0.03, 5.0 + i * 0.9);
    root.add(paver);
  }

  // 2. Tầng 1 - Khối chính (Ground Floor Main Body)
  const f1BodyGeo = new THREE.BoxGeometry(5.6, 3.2, 7.8);
  const f1WallMat = new THREE.MeshStandardMaterial({color: '#e2e8f0', roughness: 0.35});
  const f1Body = new THREE.Mesh(f1BodyGeo, f1WallMat);
  f1Body.position.set(0, 1.85, -0.4);
  root.add(f1Body);

  // Mảng tường đá ốp than chì tạo điểm nhấn (Charcoal accent wall)
  const accentWall = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 3.2, 0.2),
    new THREE.MeshStandardMaterial({color: '#1a202c', roughness: 0.7})
  );
  accentWall.position.set(-1.8, 1.85, 3.52);
  root.add(accentWall);

  // Cửa kính trượt Tầng 1 (Tinted Sliding Glass Door)
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    roughness: 0.1,
    metalness: 0.6,
    transparent: true,
    opacity: 0.85,
  });
  const frameMat = new THREE.MeshStandardMaterial({color: '#111827', roughness: 0.2});

  const f1Glass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.08), glassMat);
  f1Glass.position.set(0.9, 1.6, 3.52);
  root.add(f1Glass);

  // Khung nhôm đen cửa kính
  const f1Frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.7, 0.06), frameMat);
  f1Frame.position.set(0.9, 1.6, 3.5);
  root.add(f1Frame);

  // 3. Tầng 2 - Khối biệt thự vươn ra (Cantilevered 2nd Floor)
  const f2BodyGeo = new THREE.BoxGeometry(5.8, 3.2, 7.2);
  const f2WallMat = new THREE.MeshStandardMaterial({color: '#f8fafc', roughness: 0.3});
  const f2Body = new THREE.Mesh(f2BodyGeo, f2WallMat);
  f2Body.position.set(0, 5.05, 0.2); // vươn nhẹ ra trước tạo khối console hiện đại
  root.add(f2Body);

  // Ban công tầng 2 (Balcony slab)
  const balconySlab = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 0.2, 2.2),
    new THREE.MeshStandardMaterial({color: '#cbd5e1', roughness: 0.4})
  );
  balconySlab.position.set(0, 3.55, 4.2);
  root.add(balconySlab);

  // Lan can kính ban công (Glass Balustrade)
  const balustrade = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 1.05, 0.05),
    new THREE.MeshStandardMaterial({color: '#93c5fd', transparent: true, opacity: 0.65, roughness: 0.1, metalness: 0.5})
  );
  balustrade.position.set(0, 4.15, 5.25);
  root.add(balustrade);

  // Tay vịn kim loại vàng Champagne (Gold Railing Cap)
  const handrail = new THREE.Mesh(
    new THREE.BoxGeometry(5.7, 0.06, 0.08),
    new THREE.MeshStandardMaterial({color: '#dfc37a', metalness: 0.8, roughness: 0.2})
  );
  handrail.position.set(0, 4.7, 5.25);
  root.add(handrail);

  // Cửa kính lớn Tầng 2 phòng ngủ Master
  const f2Glass = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.4, 0.08), glassMat);
  f2Glass.position.set(0, 4.9, 3.82);
  root.add(f2Glass);

  // Thanh lam trang trí gỗ mặt tiền Tầng 2 (Architectural Louvers)
  const louverMat = new THREE.MeshStandardMaterial({color: '#a0522d', roughness: 0.5});
  for (let i = 0; i < 7; i++) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.8, 0.15), louverMat);
    louver.position.set(-2.4 + i * 0.16, 5.0, 3.85);
    root.add(louver);
  }

  // 4. Mái bằng hiện đại có viền đua (Modern Flat Roof Overhang)
  const roofSlab = new THREE.Mesh(
    new THREE.BoxGeometry(6.6, 0.25, 8.8),
    new THREE.MeshStandardMaterial({color: '#1e293b', roughness: 0.5})
  );
  roofSlab.position.set(0, 6.75, 0.2);
  root.add(roofSlab);

  // Lam che nắng sân thượng Pergola (Rooftop Pergola Slats)
  for (let i = 0; i < 8; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.1, 0.12), frameMat);
    slat.position.set(0, 7.3, -2.5 + i * 0.65);
    root.add(slat);
  }

  // 5. Cây xanh & Bồn hoa trang trí (Planter boxes & Greenery)
  const planterMat = new THREE.MeshStandardMaterial({color: '#334155'});
  const foliageMat = new THREE.MeshStandardMaterial({color: '#2e7d32', roughness: 0.8});

  // Bồn hoa bên trái
  const planterL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 3.2), planterMat);
  planterL.position.set(-3.2, 0.35, 1.5);
  root.add(planterL);

  for (let i = 0; i < 3; i++) {
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1), foliageMat);
    bush.position.set(-3.2, 0.85, 0.5 + i * 1.0);
    root.add(bush);
  }

  // Bồn hoa bên phải
  const planterR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 3.2), planterMat);
  planterR.position.set(3.2, 0.35, 1.5);
  root.add(planterR);

  for (let i = 0; i < 3; i++) {
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1), foliageMat);
    bush.position.set(3.2, 0.85, 0.5 + i * 1.0);
    root.add(bush);
  }

  // Export sang Binary GLTF (.glb)
  return new Promise<Buffer>((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      root,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          resolve(Buffer.from(gltf));
        } else {
          reject(new Error('GLTFExporter không trả về binary ArrayBuffer'));
        }
      },
      (err) => reject(err),
      {binary: true}
    );
  });
}

async function main() {
  console.log('🏗️ Đang tạo mô hình 3D biệt thự mẫu (Luxury Modern Villa GLB)...');
  const buffer = await createSampleVillaModel();

  const assetsDir = fromRoot('assets/models');
  const publicDir = fromRoot('public/models');

  await mkdir(assetsDir, {recursive: true});
  await mkdir(publicDir, {recursive: true});

  const assetsPath = path.join(assetsDir, 'sample-villa.glb');
  const publicPath = path.join(publicDir, 'sample-villa.glb');

  await writeFile(assetsPath, buffer);
  await writeFile(publicPath, buffer);

  console.log(`✅ Đã xuất mô hình 3D thành công:`);
  console.log(`   - ${assetsPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`   - ${publicPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('Lỗi tạo mô hình 3D:', err);
  process.exit(1);
});
