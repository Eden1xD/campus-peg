import type { QualityTier } from "./types";
import { QUALITY } from "./config";

/** Everything here is generated in-browser: no external texture CDN, no licensing ambiguity. */

type Ctx = CanvasRenderingContext2D;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  return { canvas, ctx };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const big = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(big >> 16) & 255, (big >> 8) & 255, big & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r + amount)},${clamp(g + amount)},${clamp(b + amount)})`;
}

function speckle(ctx: Ctx, size: number, rand: () => number, count: number, colors: string[], maxR = 2.4, alpha = 0.4) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = rgba(colors[Math.floor(rand() * colors.length)], alpha * (0.35 + rand() * 0.65));
    const r = 0.4 + rand() * maxR;
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, r, r * (0.6 + rand() * 0.8), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function blotches(ctx: Ctx, size: number, rand: () => number, count: number, colors: string[], maxR: number, alpha: number) {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.03 + rand() * maxR);
    const color = colors[Math.floor(rand() * colors.length)];
    const center = rgba(color, alpha);
    const edge = rgba(color, 0);
    // Continua a mancha na borda oposta quando a textura se repete.
    for (let cy = y - size; cy <= y + size; cy += size) {
      if (cy + r <= 0 || cy - r >= size) continue;
      for (let cx = x - size; cx <= x + size; cx += size) {
        if (cx + r <= 0 || cx - r >= size) continue;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, center);
        gradient.addColorStop(1, edge);
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }
}

/** height map derived from luminance -> tangent-space normal map */
function normalFromCanvas(source: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = source.width;
  const sctx = source.getContext("2d");
  if (!sctx) throw new Error("Canvas indisponível");
  const data = sctx.getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i += 1) {
    height[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }
  const { canvas, ctx } = makeCanvas(size);
  const out = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    const above = (y === 0 ? size - 1 : y - 1) * size;
    const below = (y + 1 === size ? 0 : y + 1) * size;
    for (let x = 0; x < size; x += 1) {
      const dx = (height[row + (x + 1 === size ? 0 : x + 1)] - height[row + (x === 0 ? size - 1 : x - 1)]) * strength;
      const dy = (height[below + x] - height[above + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      out.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127);
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// The same grains and joints visible in the colour map modulate the finish.
function roughnessCanvas(color: HTMLCanvasElement, base: number, variance: number, seed: number,
  extra?: (ctx: Ctx, size: number, rand: () => number) => void): HTMLCanvasElement {
  const size = color.width;
  const source = color.getContext("2d")!.getImageData(0, 0, size, size).data;
  const { canvas, ctx } = makeCanvas(size);
  const map = ctx.createImageData(size, size);
  const rand = mulberry32(seed + 91);
  let mean = 0;
  for (let i = 0; i < source.length; i += 4) mean += source[i + 1];
  mean /= size * size;
  for (let i = 0; i < source.length; i += 4) {
    const grain = (mean - source[i + 1]) / 64;
    const value = base + variance * (grain * 0.75 + (rand() - 0.5) * 0.38);
    map.data[i] = map.data[i + 1] = map.data[i + 2] = value;
    map.data[i + 3] = 255;
  }
  ctx.putImageData(map, 0, 0);
  if (extra) extra(ctx, size, rand);
  return canvas;
}

export interface TextureSet {
  map: HTMLCanvasElement;
  normalMap: HTMLCanvasElement;
  roughnessMap: HTMLCanvasElement;
  tile: number;
}

type Painter = (size: number) => { color: HTMLCanvasElement; normal: number; roughness: number; roughVariance?: number; seed: number; tile: number; roughExtra?: (ctx: Ctx, size: number, rand: () => number) => void };

const cache = new Map<string, TextureSet>();

const PAINTERS: Record<string, Painter> = {
  asphalt: (size) => {
    const seed = 12;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#3a3b3e";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 26, ["#4a4b4d", "#2d2e31", "#545556"], 0.16, 0.5);
    speckle(ctx, size, rand, size * 9, ["#5b5c60", "#26272a", "#6a6b6d", "#1e1f21"], 1.4, 0.55);
    // aggregate
    for (let i = 0; i < size * 1.2; i += 1) {
      ctx.fillStyle = rgba(rand() > 0.5 ? "#77787c" : "#242529", 0.35 + rand() * 0.35);
      const r = 0.5 + rand() * 1.6;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // tar repairs
    ctx.strokeStyle = "rgba(23,24,26,0.24)";
    ctx.lineWidth = size * 0.022;
    ctx.beginPath();
    ctx.moveTo(size * 0.1, size * 0.82);
    ctx.bezierCurveTo(size * 0.3, size * 0.7, size * 0.5, size * 0.95, size * 0.78, size * 0.78);
    ctx.stroke();
    // cracks
    ctx.strokeStyle = "rgba(15,16,18,0.40)";
    const crack = (x: number, y: number, len: number, angle: number, width: number) => {
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x;
      let cy = y;
      for (let s = 0; s < len; s += 1) {
        cx += Math.cos(angle + (rand() - 0.5) * 0.9) * size * 0.03;
        cy += Math.sin(angle + (rand() - 0.5) * 0.9) * size * 0.03;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    };
    crack(size * 0.62, size * 0.1, 9, Math.PI * 0.6, Math.max(1, size * 0.0035));
    crack(size * 0.2, size * 0.35, 7, Math.PI * 0.1, Math.max(1, size * 0.003));
    speckle(ctx, size, rand, size * 0.4, ["#8a8b8f"], 1.1, 0.25);
    return { color: canvas, normal: 2.4, roughness: 208, roughVariance: 26, seed, tile: 5 };
  },
  sidewalk: (size) => {
    const seed = 41;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#b7b1a5";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 30, ["#c6c0b3", "#a49d90", "#cfc9bc"], 0.14, 0.55);
    speckle(ctx, size, rand, size * 5, ["#9c968a", "#d3cec3", "#8b8579"], 1.2, 0.4);
    // joint lines (4 slabs per texture)
    ctx.strokeStyle = "rgba(120,114,103,0.85)";
    ctx.lineWidth = Math.max(1.5, size * 0.006);
    for (let k = 0; k <= 4; k += 1) {
      ctx.beginPath();
      ctx.moveTo((size / 4) * k, 0);
      ctx.lineTo((size / 4) * k, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (size / 4) * k);
      ctx.lineTo(size, (size / 4) * k);
      ctx.stroke();
    }
    // stains near joints
    blotches(ctx, size, rand, 12, ["#847e72"], 0.06, 0.3);
    return { color: canvas, normal: 1.4, roughness: 196, roughVariance: 20, seed, tile: 2.4 };
  },
  concrete: (size) => {
    const seed = 55;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#cfc9bd";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 22, ["#dcd6ca", "#bdb6a9", "#c5bfb2"], 0.2, 0.5);
    speckle(ctx, size, rand, size * 6, ["#a9a397", "#e3ded3", "#8f897d"], 1.5, 0.35);
    ctx.strokeStyle = "rgba(126,120,110,0.5)";
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.beginPath();
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    return { color: canvas, normal: 1.1, roughness: 200, roughVariance: 22, seed, tile: 2.6 };
  },
  plaster: (size) => {
    const seed = 71;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#eae3d5";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 20, ["#f2ecdf", "#ded6c7", "#d3cabb"], 0.22, 0.5);
    speckle(ctx, size, rand, size * 4, ["#d8d0c1", "#f5f0e5"], 1.1, 0.35);
    // trowel marks
    for (let i = 0; i < 26; i += 1) {
      ctx.strokeStyle = rgba("#cfc7b8", 0.16);
      ctx.lineWidth = size * 0.006;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, size * (0.05 + rand() * 0.2), rand() * Math.PI, rand() * Math.PI + 1.4);
      ctx.stroke();
    }
    // hairline crack
    ctx.strokeStyle = "rgba(120,112,100,0.16)";
    ctx.lineWidth = Math.max(1, size * 0.0022);
    ctx.beginPath();
    ctx.moveTo(size * 0.72, size * 0.18);
    ctx.lineTo(size * 0.7, size * 0.4);
    ctx.lineTo(size * 0.74, size * 0.58);
    ctx.stroke();
    return { color: canvas, normal: 0.7, roughness: 214, roughVariance: 10, seed, tile: 2 };
  },
  brick: (size) => {
    const seed = 88;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#cabfae";
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const bh = size / rows;
    for (let r = 0; r < rows; r += 1) {
      const offset = r % 2 === 0 ? 0 : size / 8;
      for (let c = -1; c < 5; c += 1) {
        const bx = c * (size / 4) + offset + size * 0.008;
        const by = r * bh + size * 0.008;
        const tone = shade("#a5644b", Math.round((rand() - 0.5) * 34));
        ctx.fillStyle = tone;
        ctx.fillRect(bx, by, size / 4 - size * 0.016, bh - size * 0.016);
        speckle(ctx, size, rand, 14, ["#8d4f3b", "#c1866c", "#743f30"], 0.9, 0.25);
      }
    }
    return { color: canvas, normal: 3.2, roughness: 205, roughVariance: 30, seed, tile: 1.6 };
  },
  wood: (size) => {
    const seed = 101;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#b08150";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i += 1) {
      const y = (i + rand()) * size / 90;
      const phase = rand() * 2 * Math.PI;
      ctx.strokeStyle = rgba(rand() > 0.5 ? "#805b3b" : "#d4ad87", 0.12 + rand() * 0.18);
      ctx.lineWidth = size * (0.001 + rand() * 0.002);
      ctx.beginPath();
      for (let step = 0; step <= 32; step += 1) {
        const angle = step * Math.PI / 16;
        const bend = Math.sin(angle + phase) + 0.35 * Math.sin(2 * angle + phase);
        const py = y + bend * size * 0.007;
        if (step === 0) ctx.moveTo(0, py);
        else ctx.lineTo(size * step / 32, py);
      }
      ctx.stroke();
    }
    for (let k = 0; k < 3; k += 1) {
      const kx = rand() * size;
      const ky = rand() * size;
      for (let ring = 1; ring < 6; ring += 1) {
        ctx.strokeStyle = rgba("#7a512e", 0.25);
        ctx.beginPath();
        ctx.ellipse(kx, ky, ring * size * 0.006, ring * size * 0.004, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // plank joints
    ctx.strokeStyle = "rgba(84,56,32,0.4)";
    ctx.lineWidth = Math.max(1, size * 0.004);
    for (let k = 0; k <= 4; k += 1) {
      ctx.beginPath();
      ctx.moveTo(0, (size / 4) * k);
      ctx.lineTo(size, (size / 4) * k);
      ctx.stroke();
    }
    return { color: canvas, normal: 1.6, roughness: 150, roughVariance: 26, seed, tile: 2 };
  },
  grass: (size) => {
    const seed = 131;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#5d7a41";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 30, ["#6b8b4a", "#4e6b37", "#77934f", "#57693a"], 0.19, 0.36);
    const bladeColors = ["#7fa055", "#4a6532", "#6d8c46", "#8aa85e", "#435c2e"];
    for (let i = 0; i < size * 7; i += 1) {
      ctx.strokeStyle = rgba(bladeColors[Math.floor(rand() * bladeColors.length)], 0.35 + rand() * 0.4);
      ctx.lineWidth = 0.7 + rand() * 0.9;
      const x = rand() * size;
      const y = rand() * size;
      const len = size * (0.004 + rand() * 0.011);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * len * 0.7, y - len);
      ctx.stroke();
    }
    blotches(ctx, size, rand, 8, ["#9a9a53"], 0.12, 0.22);
    return { color: canvas, normal: 1.5, roughness: 235, roughVariance: 18, seed, tile: 3.4 };
  },
  dirt: (size) => {
    const seed = 149;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#8a6c4d";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 24, ["#9c7c58", "#6f5539", "#a98a63"], 0.22, 0.6);
    speckle(ctx, size, rand, size * 6, ["#5c452e", "#b1946b", "#7a5f40"], 1.4, 0.45);
    return { color: canvas, normal: 1.7, roughness: 232, roughVariance: 22, seed, tile: 2.4 };
  },
  tile: (size) => {
    const seed = 167;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#b4b1a8";
    ctx.fillRect(0, 0, size, size);
    const n = 4;
    const t = size / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        ctx.fillStyle = shade("#ded9cc", Math.round((rand() - 0.5) * 12));
        ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
        const bevel = Math.max(0.7, size / 320);
        ctx.fillStyle = "rgba(255,255,250,0.36)";
        ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, bevel);
        ctx.fillRect(i * t + 1.5, j * t + 1.5, bevel, t - 3);
        for (let chip = 0; chip < size / 2; chip++) {
          ctx.fillStyle = rand() < 0.6 ? "rgba(112,107,96,.24)" : "rgba(252,249,228,.6)";
          const r = (0.002 + rand() * 0.004) * size;
          ctx.fillRect(i*t + 3 + rand()*(t-7), j*t + 3 + rand()*(t-7), r, r * 0.7);
        }
      }
    }
    return { color: canvas, normal: 1.1, roughness: 108, roughVariance: 16, seed, tile: 2.6 };
  },
  roof: (size) => {
    const seed = 181;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#8d503f";
    ctx.fillRect(0, 0, size, size);
    const stripes = 10;
    for (let i = 0; i < stripes; i += 1) {
      const x = (size / stripes) * i;
      const grad = ctx.createLinearGradient(x, 0, x + size / stripes, 0);
      grad.addColorStop(0, "#7a4335");
      grad.addColorStop(0.5, "#a25c47");
      grad.addColorStop(1, "#7a4335");
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, size / stripes, size);
    }
    for (let row = 0; row < 4; row++) {
      const y = row * size / 4;
      ctx.fillStyle = "rgba(65,32,25,0.34)";
      ctx.fillRect(0, y, size, size * 0.009);
      ctx.fillStyle = "rgba(255,201,145,0.18)";
      ctx.fillRect(0, y + size * 0.009, size, size * 0.004);
    }
    speckle(ctx, size, rand, size * 2, ["#b6735c", "#68382c"], 1.4, 0.25);
    blotches(ctx, size, rand, 14, ["#5d3328", "#9a7a52"], 0.1, 0.2);
    return { color: canvas, normal: 2.2, roughness: 190, roughVariance: 18, seed, tile: 1.6 };
  },
  metal: (size) => {
    const seed = 199;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 2; i += 1) {
      ctx.strokeStyle = rgba(rand() > 0.5 ? "#c0c6cc" : "#7c8288", 0.12 + rand() * 0.2);
      ctx.lineWidth = 0.8;
      const y = rand() * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
    blotches(ctx, size, rand, 8, ["#7b5a35"], 0.06, 0.18);
    return { color: canvas, normal: 0.6, roughness: 88, roughVariance: 22, seed, tile: 1.4 };
  },
  tactile: (size) => {
    const seed = 211;
    const { canvas, ctx } = makeCanvas(size);
    ctx.fillStyle = "#dfb93c";
    ctx.fillRect(0, 0, size, size);
    const dots = 6;
    for (let i = 0; i < dots; i += 1) {
      for (let j = 0; j < dots; j += 1) {
        const x = ((i + 0.5) / dots) * size;
        const y = ((j + 0.5) / dots) * size;
        ctx.fillStyle = "#c9a52f";
        ctx.beginPath();
        ctx.arc(x, y + size * 0.004, size * 0.028, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f2d268";
        ctx.beginPath();
        ctx.arc(x, y - size * 0.004, size * 0.024, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    speckle(ctx, size, mulberry32(seed), size * 2, ["#b5952c", "#efd47a"], 1, 0.3);
    return { color: canvas, normal: 3.4, roughness: 176, roughVariance: 14, seed, tile: 1 };
  },
  court: (size) => {
    const seed = 229;
    const { canvas, ctx } = makeCanvas(size);
    const rand = mulberry32(seed);
    ctx.fillStyle = "#4a7a63";
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 26, ["#548a70", "#3f6a56", "#5d9179"], 0.2, 0.5);
    speckle(ctx, size, rand, size * 4, ["#356050", "#6ba38b"], 1.2, 0.3);
    return { color: canvas, normal: 1, roughness: 168, roughVariance: 20, seed, tile: 4 };
  },
};

export function getTextureSet(key: string, quality: QualityTier): TextureSet | null {
  if (typeof document === "undefined") return null;
  const size = QUALITY[quality].texture;
  const cacheKey = `${key}:${size}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const painter = PAINTERS[key];
  if (!painter) return null;
  const result = painter(size);
  const set: TextureSet = {
    map: result.color,
    normalMap: normalFromCanvas(result.color, result.normal),
    roughnessMap: roughnessCanvas(result.color, result.roughness, result.roughVariance ?? 20, result.seed, result.roughExtra),
    tile: result.tile,
  };
  cache.set(cacheKey, set);
  return set;
}

const labelCache = new Map<string, HTMLCanvasElement>();

export function labelCanvas(
  text: string,
  options: { width?: number; height?: number; background?: string; color?: string; sub?: string; font?: string; border?: string } = {},
): HTMLCanvasElement {
  const width = options.width ?? 512;
  const height = options.height ?? 256;
  const key = `${text}|${options.sub ?? ""}|${width}x${height}|${options.background}|${options.color}|${options.border}|${options.font}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = options.background ?? "#f4efe6";
  ctx.fillRect(0, 0, width, height);
  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = Math.max(6, height * 0.045);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
  }
  const font = options.font ?? "600";
  ctx.fillStyle = options.color ?? "#332a45";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  const face = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  ctx.font = `${font} 100px ${face}`;
  const measured = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
  const lineHeight = height * (options.sub ? 0.55 : 0.78) / (lines.length * 1.12);
  const mainSize = Math.min(height * (options.sub ? 0.3 : 0.42), width * 86 / measured, lineHeight);
  lines.forEach((line, index) => {
    ctx.font = `${font} ${mainSize}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    const y = height / 2 + (index - (lines.length - 1) / 2) * mainSize * 1.12 - (options.sub ? height * 0.08 : 0);
    ctx.fillText(line, width / 2, y);
  });
  if (options.sub) {
    ctx.font = `500 ${Math.min(height * 0.13, (width * 0.8) / Math.max(options.sub.length, 1) * 1.7)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = options.color ?? "#5a4b73";
    ctx.fillText(options.sub, width / 2, height * 0.83, width * 0.86);
  }
  labelCache.set(key, canvas);
  return canvas;
}

export function preloadTextures(quality: QualityTier, onProgress: (value: number) => void): void {
  const keys = Object.keys(PAINTERS);
  keys.forEach((key, index) => {
    getTextureSet(key, quality);
    onProgress(Math.round(((index + 1) / keys.length) * 100));
  });
}

export function textureKeys(): string[] {
  return Object.keys(PAINTERS);
}
