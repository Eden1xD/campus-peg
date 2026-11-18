"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CENTER_PARCEL, GATE, PARCELS, PLOT } from "../config";
import { getOwnedParcels } from "../nav";
import { parcelHint, parcelPrice } from "../progression";
import { GeoBuilder } from "../geometry";
import { doorZone, footprintOf, isWalled, rectOverlap, type Rect } from "../layout";
import { resolveMaterial } from "../materials";
import { cosmetic, directorAccessory, entranceBanners, prog, roomLabelFor } from "../progression";
import { getSim } from "../sim";
import { useGame } from "../store";
import type { BuildingInstance, QualityTier } from "../types";
import { SignLabel } from "./shared";

/** Muro do perímetro sobre a borda exata da grade de navegação (PLOT). Aberturas: portão principal (frente) e serviço (leste). */
export const SERVICE_GATE = { x: PLOT.maxX, z0: 8, z1: 12 };
const C = CENTER_PARCEL;

/** Muro calculado a partir das parcelas compradas: trechos internos entre lotes da escola não existem. */
function buildPerimeter(detail: number, owned: Rect[]) {
  const b = new GeoBuilder();
  const wall = (x0: number, z0: number, x1: number, z1: number, grille: boolean) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.2) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const size = (h: number, t: number): [number, number, number] => (alongX ? [len, h, t] : [t, h, len]);
    b.box("brick", size(0.6, 0.3), [cx, 0.3, cz], { tile: 1.6 });
    b.box("concrete", size(0.08, 0.36), [cx, 0.64, cz], { tile: 2 });
    if (grille) {
      const n = Math.round(len / 0.5);
      if (detail > 0) for (let k = 0; k < n; k += 1) {
        const t = (k + 0.5) / n;
        b.cylinder("metal", 0.025, 0.025, 1.5, [x0 + (x1 - x0) * t, 1.43, z0 + (z1 - z0) * t], { segments: 5 });
      }
      b.box("metal", size(0.05, 0.06), [cx, 2.16, cz], { tile: 1 });
    } else {
      b.box("plaster", size(1.55, 0.22), [cx, 1.45, cz], { tile: 2 });
      b.box("#6d4aa8", size(0.08, 0.24), [cx, 2.18, cz], { tile: 1 });
    }
    const pillars = Math.floor(len / 3);
    for (let k = 0; k <= pillars; k += 1) {
      const t = pillars ? k / pillars : 0;
      b.box("concrete", [0.42, 2.45, 0.42], [x0 + (x1 - x0) * t, 1.22, z0 + (z1 - z0) * t], { tile: 1.2 });
    }
  };
  const has = (x: number, z: number) => owned.some((r) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ);
  const eastMost = Math.max(...owned.filter((r) => r.minZ < SERVICE_GATE.z0 && r.maxZ > SERVICE_GATE.z1).map((r) => r.maxX));
  for (const r of owned) {
    const front = r.minZ <= C.minZ + 0.01;
    // frente: o campus original já tem o portão principal (environment); os outros lotes recebem gradil
    if (front && !(r.minX === C.minX && r.maxX === C.maxX)) wall(r.minX, -22.6, r.maxX, -22.6, true);
    if (!front && !has((r.minX + r.maxX) / 2, r.minZ - 0.5)) wall(r.minX, r.minZ, r.maxX, r.minZ, false);
    if (!has((r.minX + r.maxX) / 2, r.maxZ + 0.5)) wall(r.minX, r.maxZ, r.maxX, r.maxZ, false);
    for (const [x, outward] of [[r.minX, -0.5], [r.maxX, 0.5]] as const) {
      if (has(x + outward, (r.minZ + r.maxZ) / 2)) continue;
      const z0 = front ? -22.6 : r.minZ;
      if (front) wall(x, z0, x, z0 + 12, true);
      const start = front ? z0 + 12 : z0;
      if (x === eastMost && outward > 0 && SERVICE_GATE.z0 > start && SERVICE_GATE.z1 < r.maxZ) {
        wall(x, start, x, SERVICE_GATE.z0, false);
        wall(x, SERVICE_GATE.z1, x, r.maxZ, false);
        for (let k = 0; k < 9; k += 1) b.box("#41484b", [0.05, 1.9, 0.05], [x + 0.05, 1.05, SERVICE_GATE.z0 + 0.25 + k * 0.44]);
        b.box("#41484b", [0.08, 0.08, 4], [x + 0.05, 1.95, (SERVICE_GATE.z0 + SERVICE_GATE.z1) / 2]);
      } else wall(x, start, x, r.maxZ, false);
    }
  }
  // corredores pavimentados do campus original
  b.plane("sidewalk", 3.2, C.maxZ - 2 - (-0.6), [0, 0.082, (-0.6 + C.maxZ - 2) / 2], { tile: 2.4 });
  b.plane("sidewalk", C.maxX - C.minX - 4, 2.6, [0, 0.086, 15], { tile: 2.4 });
  return b.build();
}

interface DecorItem { kind: "lamp" | "bench" | "bins" | "fountain" | "bike" | "flower" | "tree"; x: number; z: number; rot: number }
const CANDIDATES: DecorItem[] = [
  ...[-10, -2, 6, 14, 22].flatMap((z) => [{ kind: "lamp" as const, x: -2.2, z, rot: 0 }, { kind: "lamp" as const, x: 2.2, z: z + 4, rot: 0 }]),
  ...[-20, -12, 12, 20].map((x) => ({ kind: "lamp" as const, x, z: 16.6, rot: 0 })),
  { kind: "bench", x: -2.6, z: 0, rot: 1 }, { kind: "bench", x: 2.6, z: 10, rot: 3 }, { kind: "bench", x: -9, z: 16.9, rot: 2 }, { kind: "bench", x: 9, z: 16.9, rot: 2 },
  { kind: "bins", x: 2.6, z: -6, rot: 3 }, { kind: "bins", x: -2.7, z: 18, rot: 1 },
  { kind: "fountain", x: -2.5, z: -9, rot: 1 }, { kind: "fountain", x: 2.5, z: 19, rot: 3 },
  { kind: "bike", x: -6, z: -20.2, rot: 0 },
];
const LAND1: DecorItem[] = [-16, -8, 8, 16, 24].flatMap((x) => [{ kind: "flower" as const, x, z: 13.2, rot: 0 }, { kind: "flower" as const, x: x * 0.5 + 0.5, z: 18, rot: 0 }]);
const LAND2: DecorItem[] = [-6, 2, 10, 18, 26].map((z) => ({ kind: "tree" as const, x: z % 2 === 0 ? -3.4 : 3.4, z, rot: 0 }));

function blocked(it: { x: number; z: number }, r: number, buildings: BuildingInstance[]) {
  const box: Rect = { minX: it.x - r, maxX: it.x + r, minZ: it.z - r, maxZ: it.z + r };
  const gate: Rect = { minX: GATE.x - 1.9, maxX: GATE.x + 1.9, minZ: -23, maxZ: -15 };
  if (rectOverlap(box, gate)) return true;
  for (const b of buildings) {
    const fp = footprintOf(b);
    if (rectOverlap(box, { minX: fp.minX - 0.4, maxX: fp.maxX + 0.4, minZ: fp.minZ - 0.4, maxZ: fp.maxZ + 0.4 })) return true;
    if (isWalled(b) && b.kind !== "path" && b.kind !== "tactile" && rectOverlap(box, doorZone(b))) return true;
  }
  return false;
}

function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, items: DecorItem[], y: number, scale: [number, number, number] = [1, 1, 1]) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, y, it.z);
      o.rotation.set(0, (it.rot * Math.PI) / 2, 0);
      o.scale.set(...scale);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, ref, y, scale]);
}

export function Campus({ quality }: { quality: QualityTier }) {
  const detail = quality === "low" ? 0 : quality === "medium" ? 1 : 2;
  const ownedKey = getOwnedParcels().map((r) => `${r.minX},${r.minZ}`).join("|");
  const parts = useMemo(() => buildPerimeter(detail, getOwnedParcels()), [detail, ownedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mats = useMemo(() => Object.fromEntries(Object.keys(parts).map((k) => [k, resolveMaterial(k)])), [parts]);
  useEffect(() => () => Object.values(parts).forEach((g) => g.dispose()), [parts]);
  const snapshot = useGame((s) => s.snapshot);
  const sim = getSim();
  const buildings = snapshot?.buildings;
  const sig = (buildings ?? []).map((b) => `${b.id}${b.x}${b.z}${b.rot}`).join("|");
  const landscape = sim ? prog(sim.world).landscape : 0;
  const decor = useMemo(() => {
    const list = [...CANDIDATES, ...(landscape >= 1 ? LAND1 : []), ...(landscape >= 2 ? LAND2 : [])];
    const limit = quality === "low" ? 18 : 60;
    return list.filter((it) => !blocked(it, it.kind === "tree" ? 0.8 : 0.7, buildings ?? [])).slice(0, limit);
  }, [sig, landscape, quality]); // eslint-disable-line react-hooks/exhaustive-deps
  const by = (k: DecorItem["kind"]) => decor.filter((d) => d.kind === k);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const lampHeads = useRef<THREE.InstancedMesh>(null);
  const benches = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const L = useMemo(() => by("lamp"), [decor]); // eslint-disable-line react-hooks/exhaustive-deps
  const B = useMemo(() => by("bench"), [decor]); // eslint-disable-line react-hooks/exhaustive-deps
  const F = useMemo(() => by("flower"), [decor]); // eslint-disable-line react-hooks/exhaustive-deps
  const T = useMemo(() => by("tree"), [decor]); // eslint-disable-line react-hooks/exhaustive-deps
  useInstances(lamps, L, 2.0);
  useInstances(lampHeads, L, 4.05);
  useInstances(benches, B, 0.45);
  useInstances(flowers, F, 0.3);
  useInstances(trunks, T, 1.2);
  useInstances(crowns, T, 3.1);
  const lampMat = resolveMaterial("lamp");
  const benchColor = sim ? cosmetic(sim.world, "banco") ?? "#b9855c" : "#b9855c";
  const ipe = sim ? cosmetic(sim.world, "jardim") : null;
  // área de expansão: primeiro retângulo candidato totalmente livre (apenas marcação no chão, sem colisão)
  const expansion = useMemo(() => {
    const cands: Rect[] = [
      { minX: -28, maxX: -12, minZ: 19, maxZ: 28 },
      { minX: 12, maxX: 28, minZ: 19, maxZ: 28 },
      { minX: -28, maxX: -16, minZ: 2, maxZ: 12 },
      { minX: 16, maxX: 28, minZ: -12, maxZ: -2 },
      ...getOwnedParcels().filter((r) => r.minX !== C.minX || r.minZ !== C.minZ).map((r) => ({ minX: r.minX + 3, maxX: r.maxX - 3, minZ: r.minZ + 3, maxZ: Math.min(r.maxZ - 3, r.minZ + 20) })),
    ];
    return cands.find((r) => !(buildings ?? []).some((b) => rectOverlap(r, footprintOf(b)))) ?? null;
  }, [sig, ownedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // placas de direção nos cruzamentos: prédios à esquerda e à direita do eixo
  const directions = useMemo(() => {
    const all = (buildings ?? []).filter((b) => b.progress >= 1 && b.kind !== "path" && b.kind !== "tactile");
    const left = all.filter((b) => b.x < 0).sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, 3).map((b) => roomLabelFor(b, all));
    const right = all.filter((b) => b.x >= 0).sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, 3).map((b) => roomLabelFor(b, all));
    const spots = [{ x: 2.4, z: -14 }, { x: -2.4, z: 13.2 }].filter((p) => !blocked(p, 0.5, buildings ?? []));
    return { left: left.join(" · "), right: right.join(" · "), spots };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const schoolName = sim?.world.schoolName ?? "Escola PEG";
  const banners = sim ? entranceBanners(sim.world) : [];
  const binsList = by("bins");
  const fountainList = by("fountain");
  return (
    <group>
      {Object.entries(parts).map(([k, g]) => (
        <mesh key={k} geometry={g} material={mats[k]} castShadow={detail > 0} receiveShadow />
      ))}
      <instancedMesh ref={lamps} args={[undefined, undefined, Math.max(1, L.length)]} castShadow={detail > 1} material={resolveMaterial("metal")}>
        <cylinderGeometry args={[0.06, 0.09, 4, 8]} />
      </instancedMesh>
      <instancedMesh ref={lampHeads} args={[undefined, undefined, Math.max(1, L.length)]} material={lampMat}>
        <boxGeometry args={[0.5, 0.12, 0.3]} />
      </instancedMesh>
      <instancedMesh ref={benches} args={[undefined, undefined, Math.max(1, B.length)]} castShadow={detail > 1}>
        <boxGeometry args={[1.8, 0.08, 0.5]} />
        <meshStandardMaterial color={benchColor} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[undefined, undefined, Math.max(1, F.length)]}>
        <boxGeometry args={[2.4, 0.5, 0.9]} />
        <meshStandardMaterial color={ipe ?? "#d65f8a"} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, Math.max(1, T.length)]} castShadow={detail > 0}>
        <cylinderGeometry args={[0.14, 0.2, 2.4, 8]} />
        <meshStandardMaterial color="#5b4433" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, Math.max(1, T.length)]} castShadow={detail > 0}>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial color={ipe ?? "#4f8540"} roughness={0.9} />
      </instancedMesh>
      {binsList.map((it, i) => (
        <group key={`b${i}`} position={[it.x, 0, it.z]} rotation={[0, (it.rot * Math.PI) / 2, 0]}>
          {["#2e6fbf", "#d64f4f", "#3c9a5f", "#f2c230"].map((c, k) => (
            <mesh key={k} position={[(k - 1.5) * 0.42, 0.4, 0]} castShadow={detail > 1}>
              <boxGeometry args={[0.38, 0.78, 0.38]} />
              <meshStandardMaterial color={c} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {fountainList.map((it, i) => (
        <mesh key={`f${i}`} position={[it.x, 0.5, it.z]} material={resolveMaterial("metal")} castShadow={detail > 1}>
          <boxGeometry args={[0.4, 1.0, 0.35]} />
        </mesh>
      ))}
      {expansion && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(expansion.minX + expansion.maxX) / 2, 0.06, (expansion.minZ + expansion.maxZ) / 2]}>
            <planeGeometry args={[expansion.maxX - expansion.minX, expansion.maxZ - expansion.minZ]} />
            <meshBasicMaterial color="#f2d16b" transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <SignLabel text="Área de expansão" sub="Livre para novas construções" width={512} height={160}
            position={[(expansion.minX + expansion.maxX) / 2, 1.3, expansion.minZ + 0.3]} worldWidth={2.6} worldHeight={0.8} background="#f2d16b" color="#3a2a00" doubleSided />
        </group>
      )}
      {directions.spots.map((p, i) => (
        <group key={`d${i}`} position={[p.x, 0, p.z]}>
          <mesh position={[0, 1.2, 0]} material={resolveMaterial("metal")}>
            <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
          </mesh>
          {directions.left && <SignLabel text={`← ${directions.left}`} width={640} height={110} position={[0, 2.25, 0]} worldWidth={2.8} worldHeight={0.42} background="#26395f" color="#ffffff" doubleSided />}
          {directions.right && <SignLabel text={`${directions.right} →`} width={640} height={110} position={[0, 1.75, 0]} worldWidth={2.8} worldHeight={0.42} background="#3f7fbf" color="#ffffff" doubleSided />}
        </group>
      ))}
      <SignLabel text={`Bem-vindos à ${schoolName}`} sub="Rota acessível: siga o piso tátil" width={768} height={220} position={[-4.6, 1.6, -19.6]} rotation={[0, 0.35, 0]} worldWidth={2.8} worldHeight={0.8} background="#6d4aa8" color="#ffffff" border="#f0b95a" doubleSided />
      <SignLabel text={schoolName.toUpperCase()} width={1024} height={120} position={[-9.4, 2.02, -22.63]} rotation={[0, Math.PI, 0]} worldWidth={5.4} worldHeight={0.36} background="#48314e" color="#fff4df" />
      {PARCELS.filter((p) => !getOwnedParcels().some((o) => o.minX === p.minX && o.minZ === p.minZ)).map((p) => (
        <group key={p.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(p.minX + p.maxX) / 2, 0.03, (p.minZ + p.maxZ) / 2]}>
            <planeGeometry args={[p.maxX - p.minX - 0.4, p.maxZ - p.minZ - 0.4]} />
            <meshBasicMaterial color="#c9b98a" transparent opacity={0.16} depthWrite={false} />
          </mesh>
          <mesh position={[(p.minX + p.maxX) / 2, 0.7, p.minZ === -23 ? -20 : p.minZ + 2]} material={resolveMaterial("wood")}><boxGeometry args={[0.1, 1.4, 0.1]} /></mesh>
          {sim && <SignLabel text={`${p.name} · à venda`} sub={`${parcelHint(p).split(" · ")[0]} · R$ ${parcelPrice(sim.world, p).toLocaleString("pt-BR")} · Gabinete › Terreno`} width={640} height={180} position={[(p.minX + p.maxX) / 2, 1.6, p.minZ === -23 ? -20 : p.minZ + 2]} worldWidth={3.4} worldHeight={0.95} background="#f6edd2" color="#3a2a00" border="#6d4aa8" doubleSided />}
        </group>
      ))}
      {sim && prog(sim.world).gremio.achievements.length > 0 && (
        <SignLabel text="Mural do Grêmio" sub={prog(sim.world).gremio.achievements.slice(0, 2).map((a) => `★ ${a}`).join("  ")} width={768} height={200} position={[-4.5, 1.9, 13.2]} worldWidth={3.2} worldHeight={0.85} background="#4b2f7a" color="#ffffff" border="#f2d16b" doubleSided />
      )}
      <SignLabel text="Entrada de serviço" width={512} height={110} position={[C.maxX - 0.3, 2.4, SERVICE_GATE.z1 + 0.4]} rotation={[0, -Math.PI / 2, 0]} worldWidth={1.6} worldHeight={0.34} background="#2b3440" color="#ffffff" doubleSided />
      {banners.map((c, i) => (
        <group key={`fl${i}`} position={[i % 2 ? 4.2 + Math.floor(i / 2) * 0.9 : -4.2 - Math.floor(i / 2) * 0.9, 0, -21.4]}>
          <mesh position={[0, 2, 0]} material={resolveMaterial("metal")}><cylinderGeometry args={[0.04, 0.04, 4, 6]} /></mesh>
          <mesh position={[0.4, 3.5, 0]}><boxGeometry args={[0.8, 0.5, 0.02]} /><meshStandardMaterial color={c} roughness={0.8} side={THREE.DoubleSide} /></mesh>
        </group>
      ))}
      <DirectorAvatar />
    </group>
  );
}

function DirectorAvatar() {
  const ref = useRef<THREE.Group>(null);
  const badge = useRef<THREE.Mesh>(null);
  const board = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const sim = getSim();
    const g = ref.current;
    if (!sim || !g) return;
    const first = useGame.getState().cameraMode === "first";
    g.visible = !first;
    g.position.set(sim.world.player.x, 0.05, sim.world.player.z);
    g.rotation.y = sim.world.player.heading;
    const acc = directorAccessory(sim.world);
    if (badge.current) badge.current.visible = acc === "acessorio-cracha";
    if (board.current) board.current.visible = acc === "acessorio-prancheta";
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.45, 0]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.9, 10]} /><meshStandardMaterial color="#2b3440" /></mesh>
      <mesh position={[0, 1.2, 0]} castShadow><capsuleGeometry args={[0.18, 0.45, 4, 10]} /><meshStandardMaterial color="#efe9dc" /></mesh>
      <mesh position={[0, 1.68, 0]} castShadow><sphereGeometry args={[0.15, 14, 12]} /><meshStandardMaterial color="#c68863" /></mesh>
      <mesh position={[0, 1.79, -0.02]}><sphereGeometry args={[0.155, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#2e1f16" /></mesh>
      <mesh ref={badge} position={[0.08, 1.25, 0.19]} visible={false}><boxGeometry args={[0.1, 0.13, 0.01]} /><meshStandardMaterial color="#6d4aa8" /></mesh>
      <mesh ref={board} position={[0.25, 1.05, 0.12]} rotation={[0.3, 0, 0]} visible={false}><boxGeometry args={[0.22, 0.3, 0.02]} /><meshStandardMaterial color="#e3b23c" metalness={0.4} roughness={0.4} /></mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.32, 0.4, 24]} /><meshBasicMaterial color="#b89cff" /></mesh>
    </group>
  );
}
