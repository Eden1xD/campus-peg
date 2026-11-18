"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BUILDABLE_BY_KIND, GATE, phaseFor, WORLD } from "../config";
import { audio } from "../audio";
import { dir } from "../director";
import { entryPoint, footprintOf, specFor } from "../layout";
import { getOwnedParcels, toCell } from "../nav";
import { noiseAt, noiseLabel, noiseSources, shadeAt } from "../noise";
import { planStatus, prog, roomLabelFor } from "../progression";
import { getSim } from "../sim";
import { useGame } from "../store";
import { useHighlight } from "../ui/ManageUI";
import { usePlayerUI, type XLayer } from "../ui/PlayerUI";
import { SignLabel } from "./shared";

/** Plantas azuis do modo planejamento (vermelho quando inválido). */
export function PlanBlueprints() {
  const snapshot = useGame((s) => s.snapshot);
  const sim = getSim();
  const plans = sim ? prog(sim.world).plans : [];
  const key = plans.map((p) => p.id).join("|") + (snapshot?.buildings.length ?? 0);
  const status = useMemo(() => (sim ? planStatus(sim) : []), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {status.map((st) => {
        const spec = specFor(st.plan.kind);
        const color = st.ok ? "#4aa3ff" : "#ff5a5a";
        return (
          <group key={st.plan.id} position={[st.plan.x, 0, st.plan.z]} rotation={[0, (st.plan.rot * Math.PI) / 2, 0]}>
            <mesh position={[0, 1.4, 0]}>
              <boxGeometry args={[spec.w, 2.8, spec.d]} />
              <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
            </mesh>
            <lineSegments position={[0, 1.4, 0]}>
              <edgesGeometry args={[new THREE.BoxGeometry(spec.w, 2.8, spec.d)]} />
              <lineBasicMaterial color={color} />
            </lineSegments>
            <SignLabel text={`Plano: ${spec.name}`} sub={st.ok ? `R$ ${st.cost.toLocaleString("pt-BR")}` : st.message} width={512} height={140} position={[0, 3.4, 0]} worldWidth={3.2} worldHeight={0.85} background={st.ok ? "#163a5c" : "#5c1f24"} color="#ffffff" />
          </group>
        );
      })}
    </group>
  );
}

/** "Mostrar no mapa": destaque pulsante no local da causa. */
export function HighlightMarker() {
  const h = useHighlight((s) => s.h);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !h) return;
    const k = 1 + Math.sin(clock.elapsedTime * 5) * 0.06;
    ref.current.scale.set(k, 1, k);
    if (performance.now() > h.until) useHighlight.getState().clear();
  });
  if (!h) return null;
  return (
    <group ref={ref} position={[h.x, 0.12, h.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[h.w + 1, h.d + 1]} />
        <meshBasicMaterial color="#f2d16b" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <lineSegments position={[0, 1.5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(h.w + 1, 3, h.d + 1)]} />
        <lineBasicMaterial color="#f2d16b" />
      </lineSegments>
      <SignLabel text={h.label} width={640} height={120} position={[0, 4.2, 0]} worldWidth={3.6} worldHeight={0.68} background="#f2d16b" color="#2b2000" doubleSided />
    </group>
  );
}

// ------------------------------------------------------------------ Raio-X
const TILE = 2;
const flowHeat = new Map<string, number>();
let flowAt = 0;
function sampleFlow() {
  const sim = getSim();
  if (!sim) return;
  for (const [k, v] of flowHeat) flowHeat.set(k, v * 0.85);
  for (const a of sim.world.agents) {
    if (!a.visible || !a.active || a.seatKey) continue;
    const k = `${Math.floor(a.x / TILE)},${Math.floor(a.z / TILE)}`;
    flowHeat.set(k, (flowHeat.get(k) ?? 0) + 1);
  }
}
interface TileInfo { x: number; z: number; v: number; text: string; sub: string }
function evaluate(layer: XLayer, x: number, z: number): { v: number; text: string; sub: string } | null {
  const sim = getSim();
  if (!sim) return null;
  const w = sim.world;
  const cell = toCell(sim.grid, x, z);
  const k = cell.j * sim.grid.cols + cell.i;
  const building = w.buildings.find((b) => { const f = footprintOf(b); return x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ; });
  if (layer === "fluxo") {
    const v = Math.min(1, (flowHeat.get(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`) ?? 0) / 6);
    if (v < 0.05) return null;
    return { v, text: v > 0.6 ? "Passagem congestionada" : "Fluxo moderado", sub: v > 0.6 ? "Muitas pessoas passam aqui ao mesmo tempo (troca de aula/intervalo). Sugestões: alargar com caminho ou corredor coberto, abrir outra rota, escalonar horários." : "Circulação dentro do esperado." };
  }
  if (layer === "acesso") {
    if (building && !BUILDABLE_BY_KIND[building.kind]?.open) return null;
    if (sim.grid.blocked[k]) return null;
    const ok = sim.grid.accessible[k] === 1;
    return { v: ok ? 0 : 1, text: ok ? "Rota acessível" : "Trecho sem acessibilidade", sub: ok ? "Cadeira de rodas passa aqui." : "Instale rota acessível no prédio (Melhorias) ou use piso tátil/caminho." };
  }
  if (layer === "limpeza") {
    if (building) return { v: building.dirt / 100, text: `${roomLabelFor(building, w.buildings)}: sujeira ${Math.round(building.dirt)}%`, sub: building.dirt > 55 ? "Contrate zelador ou instale kit de higiene." : "Limpeza em dia." };
    const litter = dir(w).litter.filter((l) => Math.abs(l.x - x) < TILE && Math.abs(l.z - z) < TILE).length;
    return litter ? { v: Math.min(1, litter / 3), text: `${litter} embalagem(ns) no chão`, sub: "Recolha em 1ª pessoa ou contrate zelador." } : null;
  }
  if (layer === "barulho") {
    const n = noiseAt(w, x, z, cachedSources);
    if (n.level < 0.08) return null;
    return { v: n.level, text: `Barulho ${noiseLabel(n.level)}`, sub: n.top ? `Principal fonte: ${n.top.label} a ${Math.round(n.top.dist)} m. Árvores (paisagismo 2) e distância atenuam.` : "Várias fontes próximas." };
  }
  if (layer === "conforto") {
    if (building && !BUILDABLE_BY_KIND[building.kind]?.open) return { v: building.upgrades?.includes("climatizacao") ? 0 : 0.35, text: building.upgrades?.includes("climatizacao") ? "Climatizado" : "Interior sem climatização", sub: "Ar-condicionado e ventilação melhoram o conforto." };
    const s = shadeAt(w, x, z);
    return { v: 1 - s.shade, text: s.shade > 0.4 ? `Sombra: ${s.by}` : "Sol direto", sub: s.shade > 0.4 ? "Bom lugar para o intervalo." : "Árvores, bancos cobertos ou corredores cobertos dão sombra e abrigo." };
  }
  if (layer === "servicos") {
    if (building) return null;
    const near = (kind: string) => Math.min(...w.buildings.filter((b) => b.kind === kind && b.progress >= 1).map((b) => { const e = entryPoint(b); return Math.hypot(e.x - x, e.z - z); }), 999);
    const c = near("canteen"), b = near("bathroom");
    const worst = Math.max(c, b);
    return { v: Math.min(1, worst / 60), text: `Cantina a ${c > 900 ? "—" : Math.round(c) + " m"} · banheiro a ${b > 900 ? "—" : Math.round(b) + " m"}`, sub: worst > 45 ? "Longe dos serviços: considere um segundo ponto de atendimento ou banheiro mais perto." : "Serviços ao alcance." };
  }
  return null;
}
let cachedSources: ReturnType<typeof noiseSources> = [];
export function XRay() {
  const layer = usePlayerUI((s) => s.xray);
  const ref = useRef<THREE.InstancedMesh>(null);
  const [tiles, setTiles] = useState<TileInfo[]>([]);
  const [picked, setPicked] = useState<TileInfo | null>(null);
  const timer = useRef(0);
  const MAX = 3400;
  useFrame((_, dt) => {
    flowAt += dt;
    if (flowAt > 1) { flowAt = 0; sampleFlow(); }
    if (layer === "none") return;
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 1.5; // atualiza em intervalos, nunca por quadro
    const sim = getSim();
    if (!sim) return;
    cachedSources = noiseSources(sim.world);
    const out: TileInfo[] = [];
    for (const r of getOwnedParcels()) {
      for (let x = r.minX + TILE / 2; x < r.maxX; x += TILE) for (let z = Math.max(r.minZ, -22) + TILE / 2; z < r.maxZ; z += TILE) {
        const e = evaluate(layer, x, z);
        if (e && out.length < MAX) out.push({ x, z, ...e });
      }
    }
    setTiles(out);
  });
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    tiles.forEach((t, i) => {
      o.position.set(t.x, 0.2, t.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setHSL((1 - t.v) * 0.33, 0.75, 0.5));
    });
    m.count = tiles.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [tiles]);
  useEffect(() => { setPicked(null); if (layer === "none") setTiles([]); }, [layer]);
  if (layer === "none") return null;
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}
        onClick={(e) => { if (e.delta > 10 || e.instanceId === undefined) return; e.stopPropagation(); setPicked(tiles[e.instanceId] ?? null); }}>
        <boxGeometry args={[TILE * 0.94, 0.04, TILE * 0.94]} />
        <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
      {picked && <SignLabel text={picked.text} sub={picked.sub.length > 90 ? picked.sub.slice(0, 88) + "…" : picked.sub} width={900} height={200} position={[picked.x, 2.6, picked.z]} worldWidth={5} worldHeight={1.1} background="#1d1730" color="#ffffff" border="#f2d16b" doubleSided />}
    </group>
  );
}

/** Moradores e passantes no bairro: quantidade limitada pela qualidade gráfica, sempre fora do campus. */
export function Residents({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const people = useMemo(() => Array.from({ length: count }, (_, i) => ({ t: i / count, speed: 0.012 + (i % 3) * 0.004, dir: i % 2 ? 1 : -1, color: ["#c0392b", "#2e86c1", "#27ae60", "#8e44ad", "#d35400", "#34495e"][i % 6] })), [count]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new THREE.Color();
    people.forEach((p, i) => m.setColorAt(i, c.set(p.color)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [people]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const paused = useGame.getState().paused;
    const o = new THREE.Object3D();
    people.forEach((p, i) => {
      if (!paused) p.t = (p.t + p.dir * p.speed * dt + 1) % 1;
      const x = WORLD.minX - 20 + p.t * (WORLD.maxX - WORLD.minX + 40);
      o.position.set(x, 0.85, -39.6 + (i % 2) * 0.8);
      o.rotation.set(0, p.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  if (!count) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <capsuleGeometry args={[0.22, 1.0, 4, 8]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}

/** Som por local: ouvinte = diretor (1ª pessoa) ou alvo da câmera. Atualizado 2× por segundo. */
export function ZoneAudio() {
  const { camera } = useThree();
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.5) return;
    acc.current = 0;
    const sim = getSim();
    if (!sim || !audio.isStarted()) return;
    const w = sim.world;
    const st = useGame.getState();
    const lx = st.cameraMode === "first" ? w.player.x : st.cameraView.targetX;
    const lz = st.cameraMode === "first" ? w.player.z : st.cameraView.targetZ;
    const phase = phaseFor(w.minutes);
    const near = (kind: string, r = 22) => {
      const d = Math.min(...w.buildings.filter((b) => b.kind === kind && b.progress >= 1).map((b) => Math.hypot(b.x - lx, b.z - lz)), 999);
      return Math.max(0, 1 - d / r);
    };
    const zoomFade = st.cameraMode === "first" ? 1 : Math.max(0.25, 1 - st.cameraView.distance / 140);
    const outside = Math.max(0, Math.min(1, (-(lz) - 12) / 18));
    audio.setZones({
      patio: near("patio") * (phase === "break" || phase === "lunch" || phase === "activity" ? 1 : 0.15) * zoomFade,
      aula: Math.max(near("classroom", 14), near("library", 12) * 0.5) * (phase === "class" ? 1 : 0.1) * zoomFade,
      quadra: near("court") * (phase === "break" || phase === "activity" || phase === "lunch" ? 1 : 0) * zoomFade,
      cantina: near("canteen", 16) * (phase === "lunch" || phase === "break" ? 1 : 0.1) * zoomFade,
      jardim: Math.max(near("garden", 18), prog(w).landscape >= 2 ? 0.4 : 0) * (w.weather === "rain" ? 0 : 1) * zoomFade,
      telhado: w.weather === "rain" ? Math.max(near("corridor", 12), near("patio", 14)) * zoomFade : 0,
      rua: Math.max(outside, Math.max(0, 1 - Math.hypot(lx - GATE.x, lz - GATE.z) / 25)) * 0.8 * zoomFade,
    });
    void camera;
  });
  return null;
}
