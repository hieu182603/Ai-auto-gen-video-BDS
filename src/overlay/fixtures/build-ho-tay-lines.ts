// Sinh lại fixture tuyến đường cho composition OverlayPreview từ dữ liệu OSM local (offline).
// Chạy: MAP_BDS_OSM_DIR=<thư mục osm/vn> npx.cmd tsx src/overlay/fixtures/build-ho-tay-lines.ts
// Không import file này từ bundle Remotion (dùng fs).
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {queryLines, type LineFeature} from '../../../scripts/osm-local';

const BBOX = {west: 105.818, east: 105.838, south: 21.056, north: 21.070};
const NAMES = ['Đường Âu Cơ', 'Phố Từ Hoa', 'Đường Xuân Diệu', 'Phố Quảng An'];

const key = ([lat, lng]: [number, number]) => `${lat.toFixed(7)},${lng.toFixed(7)}`;

/** Nối các đoạn cùng tên, cùng chiều, có chung đầu mút thành chuỗi dài nhất (tham lam). */
function longestChain(parts: LineFeature[]): Array<[number, number]> {
  const pool = parts.map((p) => [...p.coords]);
  let best: Array<[number, number]> = [];
  for (let s = 0; s < pool.length; s++) {
    const used = new Set([s]);
    let chain = [...pool[s]];
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        const seg = pool[i];
        const head = key(chain[0]), tail = key(chain[chain.length - 1]);
        const a = key(seg[0]), b = key(seg[seg.length - 1]);
        // Chỉ nối cùng chiều: nối ngược sẽ ghép hai làn của đường đôi thành vòng chữ U.
        if (tail === a) chain = [...chain, ...seg.slice(1)];
        else if (head === b) chain = [...seg, ...chain.slice(1)];
        else continue;
        used.add(i);
        grown = true;
      }
    }
    if (chain.length > best.length) best = chain;
  }
  return best;
}

/** Đoạn liên tục dài nhất nằm trong BBOX (không nối tắt qua phần bị cắt). */
function longestInsideRun(chain: Array<[number, number]>) {
  let best: Array<[number, number]> = [];
  let run: Array<[number, number]> = [];
  for (const p of chain) {
    const [lat, lng] = p;
    if (lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east) run.push(p);
    else run = [];
    if (run.length > best.length) best = [...run];
  }
  return best;
}

const lines = queryLines(BBOX);
const out = NAMES.map((name) => {
  const parts = lines.filter((l) => l.name === name);
  const first = parts[0];
  return {
    name,
    kind: first.kind,
    class: first.class,
    osmWayIds: parts.map((p) => p.id),
    coords: longestInsideRun(longestChain(parts))
      .map(([lat, lng]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))]),
  };
});

const target = fileURLToPath(new URL('./ho-tay-lines.json', import.meta.url));
writeFileSync(target, JSON.stringify({
  source: 'OpenStreetMap (dữ liệu local data/osm/vn, truy vấn bằng queryLines)',
  attribution: '© OpenStreetMap contributors',
  license: 'ODbL 1.0',
  bbox: BBOX,
  lines: out,
}, null, 1) + '\n');
console.log(out.map((l) => `${l.name}: ${l.coords.length} điểm`).join('\n'));
