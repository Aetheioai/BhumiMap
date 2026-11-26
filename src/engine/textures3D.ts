import * as THREE from 'three';
import { LightingPreset } from '../types/building';

export interface PBRTexturePair {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

const pairCache = new Map<string, PBRTexturePair>();
const skyCache = new Map<LightingPreset, THREE.CanvasTexture>();

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Authentic Bangladeshi kiln-fired terracotta exposed red brick running bond */
export function getExposedBrickTextures(): PBRTexturePair {
  const key = 'exposed-brick';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 512;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(1971);

  // Recessed warm gray mortar background
  ctxC.fillStyle = '#c8bfb3';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#262626';
  ctxB.fillRect(0, 0, size, size);

  const rows = 12;
  const cols = 5;
  const mortar = 5;
  const rowH = size / rows;
  const colW = size / cols;

  const brickTones = [
    [168, 72, 46],
    [154, 62, 40],
    [178, 82, 52],
    [142, 56, 36],
    [162, 68, 44],
    [130, 52, 34],
  ];

  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 1 ? colW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset + mortar * 0.5;
      const by = r * rowH + mortar * 0.5;
      const bw = colW - mortar;
      const bh = rowH - mortar;

      const base = brickTones[Math.floor(rand() * brickTones.length)];
      const jitter = (rand() - 0.5) * 16;
      const cr = Math.max(40, Math.min(220, Math.round(base[0] + jitter)));
      const cg = Math.max(25, Math.min(180, Math.round(base[1] + jitter * 0.7)));
      const cb = Math.max(20, Math.min(140, Math.round(base[2] + jitter * 0.5)));

      ctxC.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctxC.fillRect(bx, by, bw, bh);

      // Subtle kiln variation blotches inside brick
      ctxC.fillStyle = rand() > 0.5 ? 'rgba(40,12,6,0.12)' : 'rgba(255,190,150,0.08)';
      ctxC.fillRect(bx + 2, by + 2, bw * (0.35 + rand() * 0.5), bh - 4);

      const bumpLum = Math.round(188 + rand() * 48);
      ctxB.fillStyle = `rgb(${bumpLum},${bumpLum},${bumpLum})`;
      ctxB.fillRect(bx, by, bw, bh);
    }
  }

  // Fine mineral grain
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctxC.fillStyle = rand() > 0.5 ? 'rgba(255,245,235,0.08)' : 'rgba(30,15,10,0.09)';
    ctxC.fillRect(x, y, 2, 2);
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 1, 1),
    bumpMap: finalizeTexture(cBmp, false, 1, 1),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Warm Bangladeshi sand-cement plastered white/off-white exterior stucco */
export function getPlasterTextures(): PBRTexturePair {
  const key = 'plaster';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 256;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(2024);

  ctxC.fillStyle = '#f5f1ea';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#808080';
  ctxB.fillRect(0, 0, size, size);

  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 2.2;
    const dark = rand() > 0.5;
    ctxC.fillStyle = dark ? 'rgba(140,132,120,0.06)' : 'rgba(255,255,255,0.12)';
    ctxC.fillRect(x, y, r, r);
    const v = dark ? 112 : 144;
    ctxB.fillStyle = `rgba(${v},${v},${v},0.32)`;
    ctxB.fillRect(x, y, r, r);
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 1, 1),
    bumpMap: finalizeTexture(cBmp, false, 1, 1),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Architectural board-formed fair-faced concrete (signature Dhaka / Louis Kahn inspired) */
export function getFairConcreteTextures(): PBRTexturePair {
  const key = 'fair-concrete';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 512;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(3005);

  ctxC.fillStyle = '#d3d7dc';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#888888';
  ctxB.fillRect(0, 0, size, size);

  // Subtle shuttering panel bands
  const bands = 4;
  const bandH = size / bands;
  for (let b = 0; b < bands; b++) {
    const shade = Math.round(205 + (rand() - 0.5) * 14);
    ctxC.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
    ctxC.fillRect(0, b * bandH, size, bandH - 2);

    // Formwork seam line
    ctxC.fillStyle = 'rgba(70,78,88,0.38)';
    ctxC.fillRect(0, b * bandH, size, 2);
    ctxB.fillStyle = '#383838';
    ctxB.fillRect(0, b * bandH, size, 2);

    // Vertical panel joint + tie-rod holes
    const vx = (b % 2 === 0 ? 0.5 : 0.25) * size;
    ctxC.fillRect(vx, b * bandH, 2, bandH);
    ctxB.fillRect(vx, b * bandH, 2, bandH);

    for (const tx of [size * 0.16, size * 0.84]) {
      const ty = b * bandH + bandH * 0.5;
      ctxC.beginPath();
      ctxC.arc(tx, ty, 5, 0, Math.PI * 2);
      ctxC.fillStyle = 'rgba(72,78,86,0.45)';
      ctxC.fill();
      ctxB.beginPath();
      ctxB.arc(tx, ty, 5, 0, Math.PI * 2);
      ctxB.fillStyle = '#242424';
      ctxB.fill();
    }
  }

  for (let i = 0; i < 2800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctxC.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(50,58,68,0.06)';
    ctxC.fillRect(x, y, 2, 2);
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 1, 1),
    bumpMap: finalizeTexture(cBmp, false, 1, 1),
  };
  pairCache.set(key, pair);
  return pair;
}

/** 24"x24" Bangladeshi polished homogeneous porcelain floor tile grid */
export function getFloorTileTextures(): PBRTexturePair {
  const key = 'floor-tile';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 512;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(4011);

  ctxC.fillStyle = '#f3f1ec';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#dcdcdc';
  ctxB.fillRect(0, 0, size, size);

  const tiles = 4;
  const step = size / tiles;
  for (let gx = 0; gx < tiles; gx++) {
    for (let gy = 0; gy < tiles; gy++) {
      const v = Math.round(240 + (rand() - 0.5) * 6);
      ctxC.fillStyle = `rgb(${v},${v - 1},${v - 4})`;
      ctxC.fillRect(gx * step + 2, gy * step + 2, step - 4, step - 4);

      // Subtle marble vein hint
      ctxC.strokeStyle = 'rgba(180,175,168,0.16)';
      ctxC.lineWidth = 2;
      ctxC.beginPath();
      ctxC.moveTo(gx * step + rand() * step, gy * step);
      ctxC.lineTo(gx * step + rand() * step, gy * step + step);
      ctxC.stroke();
    }
  }

  // Crisp narrow grout lines
  ctxC.strokeStyle = '#cbd2da';
  ctxC.lineWidth = 2.5;
  ctxB.strokeStyle = '#404040';
  ctxB.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    const p = i * step;
    ctxC.beginPath();
    ctxC.moveTo(p, 0);
    ctxC.lineTo(p, size);
    ctxC.moveTo(0, p);
    ctxC.lineTo(size, p);
    ctxC.stroke();

    ctxB.beginPath();
    ctxB.moveTo(p, 0);
    ctxB.lineTo(p, size);
    ctxB.moveTo(0, p);
    ctxB.lineTo(size, p);
    ctxB.stroke();
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 1, 1),
    bumpMap: finalizeTexture(cBmp, false, 1, 1),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Rich Bangladeshi Segun / Burma Teak wood grain */
export function getWoodTextures(): PBRTexturePair {
  const key = 'segun-wood';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 256;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(5050);

  ctxC.fillStyle = '#8f5d38';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#808080';
  ctxB.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const wave = Math.sin(y * 0.08) * 10 + (rand() - 0.5) * 12;
    const r = Math.max(70, Math.min(185, Math.round(142 + wave)));
    const g = Math.max(42, Math.min(130, Math.round(92 + wave * 0.65)));
    const b = Math.max(24, Math.min(86, Math.round(54 + wave * 0.4)));
    ctxC.fillStyle = `rgb(${r},${g},${b})`;
    ctxC.fillRect(0, y, size, 2);

    const bv = Math.max(60, Math.min(200, Math.round(128 + wave * 1.8)));
    ctxB.fillStyle = `rgb(${bv},${bv},${bv})`;
    ctxB.fillRect(0, y, size, 2);
  }

  // Plank joint lines
  for (let i = 1; i < 4; i++) {
    const py = (size / 4) * i;
    ctxC.fillStyle = 'rgba(42,22,10,0.35)';
    ctxC.fillRect(0, py, size, 2);
    ctxB.fillStyle = '#303030';
    ctxB.fillRect(0, py, size, 2);
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 1, 1),
    bumpMap: finalizeTexture(cBmp, false, 1, 1),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Lush Bangladeshi courtyard / lawn grass */
export function getGrassTextures(): PBRTexturePair {
  const key = 'grass';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 256;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(6123);

  ctxC.fillStyle = '#5c8a47';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#808080';
  ctxB.fillRect(0, 0, size, size);

  for (let i = 0; i < 4500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const tone = rand();
    ctxC.fillStyle =
      tone < 0.35
        ? 'rgba(65,108,46,0.45)'
        : tone < 0.72
        ? 'rgba(104,148,72,0.42)'
        : 'rgba(134,168,88,0.35)';
    ctxC.fillRect(x, y, 2, 4);
    const bv = Math.round(80 + rand() * 110);
    ctxB.fillStyle = `rgb(${bv},${bv},${bv})`;
    ctxB.fillRect(x, y, 2, 3);
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 4, 4),
    bumpMap: finalizeTexture(cBmp, false, 4, 4),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Interlocking concrete driveway & parking paver blocks */
export function getPaverTextures(): PBRTexturePair {
  const key = 'paver';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 256;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(7201);

  ctxC.fillStyle = '#9aa1aa';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#383838';
  ctxB.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 1 ? rw * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const shade = Math.round(182 + (rand() - 0.5) * 26);
      const warm = rand() > 0.72 ? 12 : 0;
      ctxC.fillStyle = `rgb(${shade + warm},${shade + warm * 0.4},${shade - warm * 0.3})`;
      ctxC.fillRect(c * rw + off + 2, r * rh + 2, rw - 4, rh - 4);

      const bv = Math.round(170 + rand() * 40);
      ctxB.fillStyle = `rgb(${bv},${bv},${bv})`;
      ctxB.fillRect(c * rw + off + 2, r * rh + 2, rw - 4, rh - 4);
    }
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 3, 3),
    bumpMap: finalizeTexture(cBmp, false, 3, 3),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Dark asphalt residential Dhaka street */
export function getAsphaltTextures(): PBRTexturePair {
  const key = 'asphalt';
  const cached = pairCache.get(key);
  if (cached) return cached;

  const size = 256;
  const [cCol, ctxC] = createCanvas(size, size);
  const [cBmp, ctxB] = createCanvas(size, size);
  const rand = seededRand(8800);

  ctxC.fillStyle = '#47505c';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#808080';
  ctxB.fillRect(0, 0, size, size);

  for (let i = 0; i < 4200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const lum = Math.round(52 + rand() * 44);
    ctxC.fillStyle = `rgba(${lum},${lum + 3},${lum + 8},0.45)`;
    ctxC.fillRect(x, y, 2, 2);
    ctxB.fillStyle = `rgb(${lum + 40},${lum + 40},${lum + 40})`;
    ctxB.fillRect(x, y, 2, 2);
  }

  const pair: PBRTexturePair = {
    map: finalizeTexture(cCol, true, 4, 2),
    bumpMap: finalizeTexture(cBmp, false, 4, 2),
  };
  pairCache.set(key, pair);
  return pair;
}

/** Procedural equirectangular sky gradient backdrop for Daylight / Golden Hour / Studio */
export function getSkyBackdropTexture(preset: LightingPreset): THREE.CanvasTexture {
  const cached = skyCache.get(preset);
  if (cached) return cached;

  const w = 512;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);

  if (preset === 'daylight') {
    grad.addColorStop(0.0, '#6ba4de');
    grad.addColorStop(0.32, '#a7ccf0');
    grad.addColorStop(0.5, '#dfeefb');
    grad.addColorStop(0.56, '#eef4f8');
    grad.addColorStop(1.0, '#dde5ec');
  } else if (preset === 'golden') {
    grad.addColorStop(0.0, '#5a7ea8');
    grad.addColorStop(0.28, '#b99c8c');
    grad.addColorStop(0.46, '#f6c38d');
    grad.addColorStop(0.54, '#fce2bf');
    grad.addColorStop(1.0, '#dfd6cc');
  } else {
    // Clean bright architectural drafting studio
    grad.addColorStop(0.0, '#e8eef5');
    grad.addColorStop(0.5, '#f4f7fb');
    grad.addColorStop(1.0, '#e6ecf3');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft sunlit cloud haze for Daylight & Golden Hour
  if (preset !== 'studio') {
    const sunGrad = ctx.createRadialGradient(w * 0.72, h * 0.34, 4, w * 0.72, h * 0.34, 96);
    if (preset === 'golden') {
      sunGrad.addColorStop(0, 'rgba(255,244,214,0.85)');
      sunGrad.addColorStop(0.35, 'rgba(255,204,136,0.35)');
      sunGrad.addColorStop(1, 'rgba(255,204,136,0)');
    } else {
      sunGrad.addColorStop(0, 'rgba(255,254,245,0.65)');
      sunGrad.addColorStop(0.4, 'rgba(255,255,255,0.18)');
      sunGrad.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  skyCache.set(preset, tex);
  return tex;
}

/** Create a scaled texture clone sharing the same underlying HTMLCanvasElement without GPU leaks */
export function cloneWithRepeat(tex: THREE.CanvasTexture, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const c = tex.clone();
  c.repeat.set(Math.max(0.25, repeatX), Math.max(0.25, repeatY));
  c.needsUpdate = true;
  return c;
}
