/**
 * Barulho e conforto: uma única fonte de dados usada pela simulação (efeito gradual nos alunos),
 * pela prévia de construção (efeito previsto) e pelo Raio-X. Cálculo leve, sem nada por quadro.
 */
import { BUILDABLE_BY_KIND, phaseFor } from "./config";
import { footprintOf, isWalled } from "./layout";
import { prog } from "./progression";
import type { Sim } from "./sim";
import type { BuildingInstance, BuildingKind, GameWorld } from "./types";

export interface NoiseSource { x: number; z: number; level: number; label: string }
const SENSITIVE: BuildingKind[] = ["library", "classroom", "study"];
const LOUD: Partial<Record<BuildingKind, { level: number; label: string; phases?: string[] }>> = {
  court: { level: 1.0, label: "Quadra", phases: ["break", "lunch", "activity"] },
  makerspace: { level: 0.7, label: "Oficina maker" },
  patio: { level: 0.6, label: "Pátio", phases: ["break", "lunch", "activity", "arrival"] },
  canteen: { level: 0.45, label: "Cantina", phases: ["lunch", "break"] },
  auditorium: { level: 0.4, label: "Auditório", phases: ["activity"] },
  arts: { level: 0.35, label: "Sala de artes" },
  media: { level: 0.25, label: "Sala de mídia" },
};
export function isSensitive(kind: BuildingKind) { return SENSITIVE.includes(kind); }
export function noiseSources(world: GameWorld, minutes = world.minutes, extra?: Pick<BuildingInstance, "kind" | "x" | "z">): NoiseSource[] {
  const phase = phaseFor(minutes);
  const out: NoiseSource[] = [{ x: 0, z: -30, level: 0.5, label: "Rua" }];
  const list: Pick<BuildingInstance, "kind" | "x" | "z" | "progress">[] = [...world.buildings, ...(extra ? [{ ...extra, progress: 1 }] : [])];
  for (const b of list) {
    const l = LOUD[b.kind];
    if (!l || b.progress < 1) continue;
    const active = !l.phases || l.phases.includes(phase);
    out.push({ x: b.x, z: b.z, level: active ? l.level : l.level * 0.25, label: l.label });
  }
  return out;
}
/** 0 = silencioso · 1 = muito barulhento. Árvores (paisagismo) e distância atenuam. */
export function noiseAt(world: GameWorld, x: number, z: number, sources = noiseSources(world), ignore?: { x: number; z: number }) {
  const trees = prog(world).landscape >= 2 ? 0.12 : prog(world).landscape >= 1 ? 0.05 : 0;
  let total = 0;
  let top: { label: string; dist: number; part: number } | null = null;
  for (const s of sources) {
    if (ignore && Math.abs(s.x - ignore.x) < 0.01 && Math.abs(s.z - ignore.z) < 0.01) continue;
    const dist = Math.hypot(s.x - x, s.z - z);
    const part = s.level * Math.max(0, 1 - dist / 22);
    total += part;
    if (part > 0.05 && (!top || part > top.part)) top = { label: s.label, dist, part };
  }
  return { level: Math.max(0, Math.min(1, total - trees)), top };
}
export function noiseLabel(v: number) { return v > 0.65 ? "alto" : v > 0.4 ? "médio" : "baixo"; }
/** Sombra: árvores do paisagismo, jardins, pérgola do pátio, bancos cobertos, corredores e quadra coberta. */
export function shadeAt(world: GameWorld, x: number, z: number) {
  let best = 0;
  let by = "";
  for (const b of world.buildings) {
    if (b.progress < 1) continue;
    const fp = footprintOf(b);
    const inside = x >= fp.minX - 1 && x <= fp.maxX + 1 && z >= fp.minZ - 1 && z <= fp.maxZ + 1;
    if (!inside) continue;
    const v = b.kind === "corridor" ? 0.9 : b.kind === "garden" ? 0.6 : b.kind === "patio" ? (b.upgrades?.includes("bancosCobertos") ? 0.8 : 0.45) : b.kind === "court" ? (b.upgrades?.includes("coberturaQuadra") ? 0.9 : 0) : isWalled(b) ? 1 : 0;
    if (v > best) { best = v; by = BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind; }
  }
  const trees = prog(world).landscape >= 2 && Math.abs(x) < 6 ? 0.55 : 0;
  if (trees > best) { best = trees; by = "Árvores do eixo central"; }
  return { shade: best, by };
}
/** Efeito previsto antes de construir (mostrado na prévia). */
export function predictNoise(world: GameWorld, kind: BuildingKind, x: number, z: number): string | null {
  const sources = noiseSources(world, 600);
  if (isSensitive(kind)) {
    const n = noiseAt(world, x, z, sources);
    if (n.level < 0.25) return "Barulho previsto: baixo — bom para estudar.";
    return `Barulho previsto: ${noiseLabel(n.level)}${n.top ? ` (${n.top.label} a ${Math.round(n.top.dist)} m)` : ""} — aprendizagem −${Math.round(n.level * 12)}% nos horários barulhentos.`;
  }
  if (LOUD[kind]) {
    const ext = noiseSources(world, 600, { kind, x, z });
    const hit = world.buildings.filter((b) => b.progress >= 1 && isSensitive(b.kind)).map((b) => ({ b, n: noiseAt(world, b.x, b.z, ext).level - noiseAt(world, b.x, b.z, sources).level })).filter((v) => v.n > 0.12);
    if (!hit.length) return "Barulho: não atinge salas nem a biblioteca.";
    return `Barulho: vai atrapalhar ${hit.map((h) => BUILDABLE_BY_KIND[h.b.kind]?.name).slice(0, 2).join(" e ")} (+${Math.round(Math.max(...hit.map((h) => h.n)) * 100)}%). Afaste ou plante árvores.`;
  }
  return null;
}
let lastSample = -999;
const cache = new Map<string, number>();
/** Efeito gradual e recuperável: amostrado a cada 3 minutos de jogo. */
export function noiseComfortTick(sim: Sim, dtMinutes: number) {
  const w = sim.world;
  const t = w.day * 1440 + w.minutes;
  if (t - lastSample >= 3 || t < lastSample) {
    lastSample = t;
    cache.clear();
    const sources = noiseSources(w);
    for (const b of w.buildings) if (b.progress >= 1 && isSensitive(b.kind)) cache.set(b.id, noiseAt(w, b.x, b.z, sources, { x: b.x, z: b.z }).level);
  }
  const sunny = w.weather === "sun" && w.minutes > 600 && w.minutes < 900;
  for (const a of w.agents) {
    if (a.role !== "student" || !a.active) continue;
    const n = a.buildingId ? cache.get(a.buildingId) : undefined;
    if (n !== undefined && n > 0.4 && a.seatKey && a.path.length === 0) {
      a.needs.learning = Math.max(0, a.needs.learning - dtMinutes * 0.03 * (n - 0.4));
      a.needs.comfort = Math.max(0, a.needs.comfort - dtMinutes * 0.02 * (n - 0.4));
    }
    if (sunny && !a.seatKey && a.state !== "walk") {
      const sh = shadeAt(w, a.x, a.z).shade;
      a.needs.comfort = Math.max(0, Math.min(100, a.needs.comfort + dtMinutes * (sh > 0.4 ? 0.02 : -0.03)));
    }
  }
}
export function buildingNoise(id: string) { return cache.get(id); }
