import * as THREE from "three";
import { getTextureSet } from "./textures";
import type { QualityTier } from "./types";

let activeQuality: QualityTier = "medium";
const materials = new Map<string, THREE.MeshStandardMaterial>();

interface Surface {
  roughness: number;
  metalness: number;
  relief: number;
}

// Normal e rugosidade já contêm o detalhe pintado em textures.ts.
const surfaces: Record<string, Surface> = {
  asphalt:  { roughness: 0.99, metalness: 0, relief: 0.72 },
  sidewalk: { roughness: 0.98, metalness: 0, relief: 0.72 },
  concrete: { roughness: 0.97, metalness: 0, relief: 0.82 },
  plaster:  { roughness: 0.98, metalness: 0, relief: 0.60 },
  brick:    { roughness: 0.97, metalness: 0, relief: 0.90 },
  wood:     { roughness: 0.98, metalness: 0, relief: 0.65 },
  tile:     { roughness: 0.92, metalness: 0, relief: 0.55 },
  grass:    { roughness: 1.00, metalness: 0, relief: 0.65 },
  dirt:     { roughness: 1.00, metalness: 0, relief: 0.90 },
  roof:     { roughness: 0.98, metalness: 0, relief: 0.85 },
  metal:    { roughness: 0.93, metalness: 0.58, relief: 0.60 },
  tactile:  { roughness: 0.94, metalness: 0, relief: 1.10 },
  court:    { roughness: 0.98, metalness: 0, relief: 0.58 },
  terrazzo: { roughness: 0.7, metalness: 0, relief: 0.4 },
  ceramic:  { roughness: 0.55, metalness: 0, relief: 0.5 },
  wallTile: { roughness: 0.45, metalness: 0, relief: 0.6 },
  vinyl:    { roughness: 0.75, metalness: 0, relief: 0.35 },
  carpet:   { roughness: 1.0, metalness: 0, relief: 0.8 },
  darkwood: { roughness: 0.8, metalness: 0, relief: 0.6 },
  woodWall: { roughness: 0.85, metalness: 0, relief: 0.6 },
  courtPaint: { roughness: 0.85, metalness: 0, relief: 0.3 },
};

interface SurfaceMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture | null;
}

const mapsBySurface = new Map<string, SurfaceMaps>();
export const MATERIAL_TILE: Record<string, number> = {};

export function setMaterialQuality(quality: QualityTier) {
  if (quality === activeQuality) return;
  for (const material of materials.values()) material.dispose();
  for (const maps of mapsBySurface.values()) {
    maps.map.dispose();
    maps.normalMap?.dispose();
    maps.roughnessMap?.dispose();
  }
  materials.clear();
  mapsBySurface.clear();
  surfaceUsers.clear();
  externalState.clear();
  activeQuality = quality;
}

export function getActiveQuality(): QualityTier {
  return activeQuality;
}

function texture(canvas: HTMLCanvasElement, color: boolean) {
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = activeQuality === "high" ? 8 : activeQuality === "medium" ? 4 : 1;
  return map;
}

function surfaceMaps(key: string) {
  const existing = mapsBySurface.get(key);
  if (existing) return existing;
  const set = getTextureSet(key, activeQuality);
  if (!set) return null;
  const detailed = activeQuality !== "low";
  const maps: SurfaceMaps = {
    map: texture(set.map, true),
    normalMap: detailed ? texture(set.normalMap, false) : null,
    roughnessMap: detailed ? texture(set.roughnessMap, false) : null,
  };
  MATERIAL_TILE[key] = set.tile;
  mapsBySurface.set(key, maps);
  return maps;
}

// ------------------------------------------------------------------ PBR externo (CC0, ambientCG)
/** repeat = quantas vezes a imagem se repete por unidade de UV do GeoBuilder (UV em metros/tile) */
const EXTERNAL_PBR: Record<string, number> = {
  asphalt: 1.5, sidewalk: 2, concrete: 1, plaster: 1.2, brick: 2, wood: 1.4, tile: 2.5,
  grass: 2, dirt: 1.5, roof: 1.5, metal: 1, court: 1,
  terrazzo: 1, ceramic: 2.5, wallTile: 2.5, vinyl: 2, carpet: 1.5, darkwood: 1.4, woodWall: 1.2, courtPaint: 0.6,
};
const surfaceUsers = new Map<string, THREE.MeshStandardMaterial[]>();
const externalState = new Map<string, "loading" | "ok" | "fail">();
const loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;

function maxAnisotropy() {
  return activeQuality === "high" ? 8 : activeQuality === "medium" ? 4 : 2;
}
function loadTex(url: string, color: boolean, repeat: number): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    if (!loader) return reject(new Error("sem DOM"));
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = maxAnisotropy();
      if (color) tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    }, undefined, () => reject(new Error(url)));
  });
}
/** Material PBR a partir de color.jpg, normal.jpg e roughness.jpg. Falha → material substituto (o jogo abre). */
export function loadPBRMaterial(path: string, repeatX: number, repeatY: number, fallback = "#b9b3a6"): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.9 });
  const base = path.replace(/\/$/, "");
  Promise.all([loadTex(`${base}/color.jpg`, true, 1), loadTex(`${base}/normal.jpg`, false, 1), loadTex(`${base}/roughness.jpg`, false, 1)])
    .then(([map, normalMap, roughnessMap]) => {
      for (const t of [map, normalMap, roughnessMap]) t.repeat.set(repeatX, repeatY);
      mat.color.set("#ffffff");
      mat.map = map;
      mat.normalMap = normalMap;
      mat.roughnessMap = roughnessMap;
      mat.roughness = 1;
      mat.needsUpdate = true;
    })
    .catch(() => { /* mantém aparência substituta */ });
  return mat;
}
function applyExternal(key: string) {
  const repeat = EXTERNAL_PBR[key];
  if (!repeat || externalState.has(key)) return;
  externalState.set(key, "loading");
  const base = `/texturas/pbr/${key}`;
  Promise.all([loadTex(`${base}/color.jpg`, true, repeat), loadTex(`${base}/normal.jpg`, false, repeat), loadTex(`${base}/roughness.jpg`, false, repeat)])
    .then(([map, normalMap, roughnessMap]) => {
      externalState.set(key, "ok");
      const current = mapsBySurface.get(key);
      if (current) {
        current.map.dispose();
        current.normalMap?.dispose();
        current.roughnessMap?.dispose();
      }
      mapsBySurface.set(key, { map: map as THREE.CanvasTexture, normalMap: normalMap as THREE.CanvasTexture, roughnessMap: roughnessMap as THREE.CanvasTexture });
      for (const m of surfaceUsers.get(key) ?? []) {
        m.map = map;
        m.normalMap = normalMap;
        m.roughnessMap = roughnessMap;
        m.roughness = 1;
        m.needsUpdate = true;
      }
    })
    .catch(() => externalState.set(key, "fail"));
}
export function pbrStatus() {
  return Object.fromEntries(externalState);
}

function surfaceMaterial(key: string, color = "#ffffff") {
  const spec = surfaces[key];
  const maps = surfaceMaps(key);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    map: maps?.map ?? null,
    normalMap: maps?.normalMap ?? null,
    roughnessMap: maps?.roughnessMap ?? null,
  });
  material.normalScale.set(spec.relief, spec.relief);
  const users = surfaceUsers.get(key) ?? [];
  users.push(material);
  surfaceUsers.set(key, users);
  const ext = externalState.get(key);
  if (ext === "ok" && maps) {
    material.roughness = 1;
  } else applyExternal(key);
  return material;
}

function cached(key: string, create: () => THREE.MeshStandardMaterial) {
  const existing = materials.get(key);
  if (existing) return existing;
  const material = create();
  materials.set(key, material);
  return material;
}

function knownSurface(key: string) {
  return Object.prototype.hasOwnProperty.call(surfaces, key);
}

export function getMaterial(key: string): THREE.MeshStandardMaterial {
  const surface = knownSurface(key) ? key : "concrete";
  return cached(`tex:${surface}`, () => surfaceMaterial(surface));
}

export function paint(hex: string, roughness = 0.7, metalness = 0) {
  return cached(`paint:${hex}:${roughness}:${metalness}`, () =>
    new THREE.MeshStandardMaterial({ color: hex, roughness, metalness }),
  );
}

export function wallPaint(hex: string) {
  return cached(`wall:${hex}`, () => surfaceMaterial("plaster", hex));
}

export function emissive(hex: string, intensity = 1.2) {
  return cached(`emissive:${hex}:${intensity}`, () =>
    new THREE.MeshStandardMaterial({
      color: hex, emissive: hex, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.1,
    }),
  );
}

export function glass() {
  return cached("glass", () => new THREE.MeshStandardMaterial({
    color: "#cfe1e5", roughness: 0.16, metalness: 0,
    transparent: true, opacity: 0.38, depthWrite: false, envMapIntensity: 0.6,
  }));
}

export function resolveMaterial(key: string): THREE.Material {
  if (knownSurface(key)) return getMaterial(key);
  switch (key) {
    case "glass": return glass();
    case "screen": return emissive("#9ad7ff", 0.7);
    case "lamp": return emissive("#ffe9b8", 1.4);
    default: return paint(key.startsWith("#") ? key : "#b9b3a6");
  }
}

export function materialForColor(hex: string, roughness = 0.7, metalness = 0): THREE.Material {
  return paint(hex, roughness, metalness);
}
