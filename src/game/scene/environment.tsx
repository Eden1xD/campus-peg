"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {} from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getSim } from "../sim";
import { useGame } from "../store";
import { PLOT, lightPhase } from "../config";
import { GeoBuilder } from "../geometry";
import { SignLabel } from "./shared";
import { resolveMaterial } from "../materials";
import type { QualityTier, Weather } from "../types";

const TREE_POSITIONS: [number, number, number][] = [
  [PLOT.minX - 4, -17, 1.15], [PLOT.maxX + 4, -14, 1.05],
  [PLOT.minX - 6, -3, 1.25], [PLOT.maxX + 5, 2, 1.12],
  [PLOT.minX - 4, 13, 1.05], [PLOT.maxX + 6, 16, 1.2],
  [-24, PLOT.maxZ + 5, 1.1], [-13, PLOT.maxZ + 7, 1.2],
  [3, PLOT.maxZ + 4, 0.98], [18, PLOT.maxZ + 6, 1.25],
];

function buildStaticStreet(detail: number): Record<string, THREE.BufferGeometry> {
  const b = new GeoBuilder();
  // road + verge
  b.plane("grass", 230, 190, [0, -0.04, 25], { tile: 4.2 });
  b.plane("asphalt", 190, 7.4, [0, 0.01, -33.2], { tile: 5 });
  b.plane("sidewalk", 190, 6.6, [0, 0.06, -26.9], { tile: 2.4 });
  // The curb stops on both sides of the pedestrian crossing.
  for (const side of [-1, 1]) {
    const x = side * 48.95;
    for (const z of [-29.9, -23.6]) {
      b.box("concrete", [94.1, 0.2, 0.4], [x, 0.11, z], { tile: 2 });
    }
    b.box("#a8a294", [94.1, 0.08, 0.5], [x, 0.04, -30.25]);
  }
  // road markings
  for (let x = -92; x < 92; x += 6) {
    b.box("#e9e4d8", [3.1, 0.02, 0.16], [x, 0.03, -33.2], { tile: 1 });
  }
  for (let i = 0; i < 7; i += 1) {
    b.box("#e9e4d8", [0.62, 0.02, 6.4], [-3.2 + i * 1.06, 0.03, -33.2], { tile: 1 });
  }
  b.box("#e9e4d8", [3.0, 0.02, 0.34], [-6.6, 0.03, -30.4], { tile: 1 });
  b.box("#e9e4d8", [3.0, 0.02, 0.34], [-6.6, 0.03, -36.0], { tile: 1 });
  // drainage grates
  for (const x of [-18, -2, 14, 28]) {
    b.box("#4b4e52", [0.9, 0.06, 0.42], [x, 0.08, -30.05], { tile: 0.6 });
  }
  // A shallow slope meets the road, then the tactile strip crosses the threshold.
  b.box("sidewalk", [3.8, 0.04, 0.9], [0, 0.026, -30.55], { rotX: -0.07 });
  b.plane("tactile", 0.72, 8, [0, 0.125, -26.05], { tile: 0.9 });
  b.plane("tactile", 3.4, 0.46, [0, 0.13, -29.8], { tile: 0.9 });
  for (const x of [-6, -3, 3, 6]) {
    b.plane("#9c978d", 0.019, 6.1, [x, 0.064, -26.75]);
  }
  b.plane("sidewalk", 32, 10.4, [0, 0.1, -17.2], { tile: 2.4 });
  b.plane("sidewalk", 3.8, 1.6, [0, 0.103, -22.9], { tile: 2.4 });
  for (const side of [-1, 1]) {
    b.box("concrete", [14.1, 0.12, 0.24], [side * 8.95, 0.14, -22.45]);
  }
  // paths from gate into the campus
  b.plane("sidewalk", 3.4, 15.5, [0, 0.09, -8.6], { tile: 2.4 });
  b.plane("sidewalk", 11, 3.2, [-11.8, 0.09, -1.6], { tile: 2.4 });
  b.plane("sidewalk", 8, 3.2, [9.5, 0.09, -1.4], { tile: 2.4 });
  b.plane("sidewalk", 8, 3.0, [-4.2, 0.09, 4.4], { tile: 2.4 });
  // fence: concrete base + bars, open at the gate
  const segments: [number, number][] = [
    [-30, -2.8],
    [2.8, 30],
  ];
  segments.forEach(([a, z]) => {
    void z;
    const len = a === -30 ? 27.2 : 27.2;
    const centre = a === -30 ? (-30 + -2.8) / 2 : (2.8 + 30) / 2;
    b.box("concrete", [len, 0.55, 0.34], [centre, 0.3, -22.6], { tile: 2 });
    for (let k = 0; k < Math.round(len / 0.55); k += 1) {
      b.cylinder("metal", 0.028, 0.028, 1.5, [a === -30 ? -30 + 0.3 + k * 0.55 : 2.8 + 0.3 + k * 0.55, 1.3, -22.6], { segments: 6 });
    }
    b.box("metal", [len, 0.06, 0.08], [centre, 2.05, -22.6], { tile: 1 });
    b.box("metal", [len, 0.05, 0.06], [centre, 0.95, -22.6], { tile: 1 });
  });
  // gate piers + sliding gate
  for (const sx of [-1, 1]) {
    b.box("concrete", [0.7, 2.7, 0.7], [sx * 2.95, 1.35, -22.6], { tile: 1.6 });
    b.box("#cabfa9", [0.9, 0.16, 0.9], [sx * 2.95, 2.78, -22.6], { tile: 1.2 });
    b.sphere("lamp", 0.12, [sx * 2.95, 2.9, -22.6], { detail: 1 });
  }
  // Sliding leaf parked behind the fence, with both rollers on the lateral rail.
  const steel = "#41484b";
  const leafZ = -22.04;
  b.box(steel, [5.45, 0.06, 0.10], [6.25, 0.14, leafZ]);
  for (const y of [0.42, 2.1]) b.box(steel, [5.1, 0.09, 0.09], [6.25, y, leafZ]);
  for (let i = 0; i <= 12; i++) {
    b.box(steel, [0.045, 1.7, 0.07], [3.73 + i * 0.42, 1.26, leafZ]);
  }
  for (const x of [4.05, 8.45]) {
    b.cylinder("metal", 0.12, 0.12, 0.09, [x, 0.28, leafZ], { rotX: Math.PI / 2, segments: 12 });
  }
  b.box("metal", [0.06, 0.27, 0.08], [3.8, 1.2, leafZ - 0.10]);
  // Intercom on the street face of the guardhouse pillar.
  b.box(steel, [0.25, 0.48, 0.08], [2.95, 1.36, -22.99]);
  for (let row = 0; row < 4; row++) {
    b.box("#171e22", [0.15, 0.013, 0.01], [2.95, 1.48 - row * 0.027, -23.034]);
  }
  b.cylinder("metal", 0.041, 0.041, 0.02, [2.95, 1.24, -23.04], { rotX: Math.PI / 2 });
  // Street sign and courtyard noticeboard share the existing brick wall.
  b.box("brick", [5.6, 1.5, 0.4], [-9.4, 0.95, -22.4], { tile: 1.6 });
  b.box("concrete", [5.94, 0.14, 0.74], [-9.4, 1.77, -22.4]);
  b.box(steel, [3.84, 1.32, 0.20], [-9.4, 1.0, -22.70]);
  b.box(steel, [1.3, 0.085, 0.35], [-9.4, 1.73, -22.85]);
  b.box("wood", [3.15, 1.17, 0.09], [-9.4, 1.01, -22.15]);
  b.box("#b28d63", [3.03, 1.05, 0.04], [-9.4, 1.01, -22.09]);
  // groundskeeper concrete bench + bins near gate
  b.box("concrete", [2.2, 0.42, 0.55], [7.6, 0.25, -19.4], { tile: 1.6 });
  b.box("wood", [2.1, 0.08, 0.5], [7.6, 0.5, -19.4], { tile: 1.2 });
  for (const x of [5.5, 6.2]) {
    b.cylinder("metal", 0.24, 0.24, 0.72, [x, 0.42, -18.4], { segments: 12 });
    b.cylinder("#3c6d4f", 0.26, 0.26, 0.06, [x, 0.8, -18.4], { segments: 12 });
  }
  // bike rack
  for (let k = 0; k < 4; k += 1) {
    b.cylinder("metal", 0.045, 0.045, 0.85, [11.4 + k * 0.75, 0.48, -20.2], { segments: 8 });
  }
  b.box("metal", [3.1, 0.05, 0.05], [12.5, 0.9, -20.2], { tile: 1 });
  // flagpole
  b.cylinder("#cbd2d8", 0.06, 0.08, 7.5, [-5.4, 3.75, -14.8], { segments: 10, tile: 1 });
  b.sphere("metal", 0.12, [-5.4, 7.55, -14.8], { detail: 1 });
  // planters / hedges / garden beds
  const beds: [number, number, number, number][] = [
    [-13, -20.6, 4.2, 1.4],
    [12.5, -20.6, 4.2, 1.4],
    [-16, -16.2, 3.2, 1.6],
    [16, -16.2, 3.2, 1.6],
    [-9.6, 12.4, 4.4, 1.8],
    [9.4, 12.6, 4.4, 1.8],
  ];
  beds.forEach(([x, z, w, d]) => {
    b.box("concrete", [w, 0.42, d], [x, 0.22, z], { tile: 1.6 });
    b.box("dirt", [w - 0.3, 0.08, d - 0.3], [x, 0.45, z], { tile: 1.6 });
    if (detail > 0) {
      for (let k = 0; k < Math.round(w / 0.7); k += 1) {
        b.sphere(k % 2 === 0 ? "#4f7d43" : "#6b9452", 0.36, [x - w / 2 + 0.5 + k * 0.7, 0.72, z + (k % 2) * 0.28 - 0.14], { detail: 1 });
      }
    }
  });
  // streetlights
  for (const x of [-19, -2.6, 15]) {
    b.cylinder("metal", 0.09, 0.11, 6.4, [x, 3.2, -28.4], { segments: 8, tile: 1 });
    b.box("metal", [0.1, 0.1, 1.4], [x, 6.3, -29.1], { tile: 1 });
    b.box("lamp", [0.5, 0.14, 0.9], [x, 6.2, -29.7], { tile: 1 });
  }
  // bus shelter
  b.box("concrete", [5.6, 0.12, 2.1], [-19.4, 0.16, -27.3], { tile: 2 });
  for (const dx of [-2.4, 2.4]) {
    b.box("metal", [0.1, 2.5, 0.1], [-19.4 + dx, 1.35, -28.1], { tile: 1 });
    b.box("metal", [0.1, 2.5, 0.1], [-19.4 + dx, 1.35, -26.5], { tile: 1 });
  }
  b.box("metal", [5.4, 0.12, 2.4], [-19.4, 2.62, -27.3], { tile: 1.6 });
  b.box("glass", [5.0, 1.9, 0.06], [-19.4, 1.45, -28.1], { tile: 1 });
  b.box("wood", [4.2, 0.1, 0.5], [-19.4, 0.62, -27.2], { tile: 1.4 });
  b.box("metal", [0.08, 0.5, 0.5], [-21.2, 0.38, -27.2], { tile: 1 });
  b.box("metal", [0.08, 0.5, 0.5], [-17.6, 0.38, -27.2], { tile: 1 });
  // trees
  TREE_POSITIONS.forEach(([x, z, scale], index) => {
    const angle = index * 2.4;
    b.cylinder("#715a43", 0.13 * scale, 0.26 * scale, 3.1 * scale,
      [x, 1.55 * scale, z], { segments: 8 });
    const leaves = ["#456846", "#5e8050", "#72905a"];
    for (let branch = 0; branch < 4; branch++) {
      const yaw = angle + branch * Math.PI / 2;
      const reach = (branch % 2 === 0 ? 1.12 : 0.82) * scale;
      const dx = Math.sin(yaw) * reach;
      const dz = Math.cos(yaw) * reach;
      const rise = 1.25 * scale;
      b.cylinder("#715a43", 0.065 * scale, 0.13 * scale, Math.hypot(reach, rise),
        [x + dx / 2, 2.05 * scale + rise / 2, z + dz / 2],
        { segments: 6, rotZ: -Math.asin(dx / Math.hypot(reach, rise)), rotX: Math.atan2(dz, rise) });
      b.sphere(leaves[branch % 3], 1.22 * scale,
        [x + dx, (3.35 + 0.17 * branch) * scale, z + dz],
        { scale: [1.16, 0.74, 1.04], detail: detail > 0 ? 1 : 0 });
    }
  });
  // outdoor benches + bollards
  for (const [x, z, rot] of [
    [-8.4, -14.4, 0],
    [8.4, -14.4, 0],
    [-6.2, 1.4, 1],
    [6.2, 1.4, 1],
  ]) {
    b.box("wood", [1.9, 0.08, 0.5], [x, 0.46, z], { rotY: rot, tile: 1.2 });
    b.box("wood", [1.9, 0.4, 0.08], [x, 0.7, z - 0.22], { rotY: rot, tile: 1.2 });
    b.box("metal", [0.08, 0.45, 0.45], [x - 0.8, 0.23, z], { rotY: rot, tile: 1 });
    b.box("metal", [0.08, 0.45, 0.45], [x + 0.8, 0.23, z], { rotY: rot, tile: 1 });
  }
  for (const x of [-3.4, -1.8, 1.8, 3.4]) {
    b.cylinder("metal", 0.07, 0.07, 0.62, [x, 0.33, -20.6], { segments: 8 });
  }
  return b.build();
}

const SIGNS = [
  { text: "30", sub: "km/h", pos: [-10.6, 2.3, -28.4] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: 0.9, h: 0.9, bg: "#f4efe6", color: "#b3392f" },
  { text: "ÁREA", sub: "ESCOLAR", pos: [10.2, 2.4, -28.4] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: 1.2, h: 1.2, bg: "#f0c53d", color: "#3a3550" },
  { text: "PONTO", sub: "de ônibus", pos: [-19.4, 2.35, -28.2] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: 2.0, h: 0.7, bg: "#2f5f8a", color: "#f3f6f8" },
  { text: "Portaria", sub: "Interfone", pos: [2.95, 1.84, -22.966] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number], w: 0.64, h: 0.27, bg: "#373344", color: "#fff5e6" },
  { text: "Entrada", sub: "Acesso de pedestres", pos: [-2.95, 1.52, -22.966] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number], w: 0.64, h: 0.32, bg: "#373344", color: "#fff5e6" },
  { text: "Grêmio Estudantil", sub: "", pos: [-9.4, 1.37, -22.061] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: 2.2, h: 0.24, bg: "#57455e", color: "#fff4e6" },
  { text: "Interclasses", sub: "Esporte na escola", pos: [-10.08, 0.91, -22.061] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: 1.18, h: 0.56, bg: "#e8ecd8", color: "#374b35" },
  { text: "Reunião do Grêmio", sub: "Participe!", pos: [-8.72, 0.91, -22.061] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: 1.2, h: 0.56, bg: "#eee3da", color: "#503946" },
];

export function StaticStreet({ quality }: { quality: QualityTier }) {
  const detail = quality === "low" ? 0 : quality === "medium" ? 1 : 2;
  const parts = useMemo(() => buildStaticStreet(detail), [detail]);
  const materials = useMemo(() => {
    const map: Record<string, THREE.Material> = {};
    Object.keys(parts).forEach((key) => {
      map[key] = resolveMaterialSafe(key);
    });
    return map;
  }, [parts]);
  return (
    <group>
      {Object.entries(parts).map(([key, geometry]) => (
        <mesh key={key} geometry={geometry} material={materials[key]} castShadow={quality !== "low"} receiveShadow />
      ))}
      {SIGNS.filter((s) => s.w > 0.2).map((sign, index) => (
        <SignLabel
          key={index}
          text={sign.text}
          sub={sign.sub}
          width={512}
          height={sign.h > 1 ? 256 : 160}
          position={sign.pos}
          rotation={sign.rot}
          worldWidth={sign.w}
          worldHeight={sign.h}
          background={sign.bg}
          color={sign.color}
          border={sign.bg === "#6d4aa8" ? "#f0b95a" : undefined}
        />
      ))}
      <EntrancePlaque />
    </group>
  );
}

function EntrancePlaque() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    const image = new Image();
    const map = new THREE.Texture(image);
    image.onload = () => {
      if (!active) return;
      map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      setTexture(map);
    };
    image.src = PLAQUE_IMAGE;
    return () => {
      active = false;
      image.onload = null;
      map.dispose();
    };
  }, []);
  const lit = useGame((state) => {
    const phase = lightPhase(state.snapshot?.minutes ?? 480);
    return phase === "dusk" || phase === "night";
  });
  return (
    <group>
      {texture ? <mesh position={[-9.4, 1, -22.807]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[3.72, 1.24]} />
        <meshStandardMaterial map={texture}
          roughness={0.76} emissive="#fff0d6" emissiveMap={texture} emissiveIntensity={lit ? 0.55 : 0} />
      </mesh> : (
        <SignLabel text="ESCOLA MUNICIPAL PEG" width={768} height={256}
          position={[-9.4, 1, -22.807]} rotation={[0, Math.PI, 0]}
          worldWidth={3.72} worldHeight={1.24} background="#48314e" color="#fff4df" />
      )}
      <mesh position={[-9.4, 1.68, -22.94]}>
        <boxGeometry args={[1.16, 0.022, 0.12]} />
        <meshStandardMaterial color="#e7decb" emissive="#ffd89f" emissiveIntensity={lit ? 1.5 : 0} />
      </mesh>
    </group>
  );
}

function resolveMaterialSafe(key: string): THREE.Material {
  return resolveMaterial(key);
}

function Guarita() {
  return (
    <group position={[4.6, 0, -19.6]}>
      {/* Front wall is open at counter height so the interior is visible. */}
      {([
        [[0, 1.25, 1.04], [2.4, 2.4, 0.12]],
        [[-1.14, 1.25, 0], [0.12, 2.4, 2.1]],
        [[1.14, 1.25, 0], [0.12, 2.4, 2.1]],
        [[0, 0.53, -1.04], [2.4, 1.04, 0.12]],
        [[0, 2.29, -1.04], [2.4, 0.39, 0.12]],
      ] as [number[], number[]][]).map(([pos, size], i) => (
        <mesh key={i} position={[pos[0], pos[1], pos[2]]} castShadow receiveShadow>
          <boxGeometry args={[size[0], size[1], size[2]]} />
          <meshStandardMaterial color="#dfd9c8" roughness={0.88} />
        </mesh>
      ))}
      <mesh position={[0, 1.06, -0.77]}>
        <boxGeometry args={[2.28, 0.09, 0.84]} />
        <meshStandardMaterial color="#936e51" roughness={0.7} />
      </mesh>
      {[-1.11, 0.08, 1.11].map((x) => (
        <mesh key={x} position={[x, 1.57, -1.04]}>
          <boxGeometry args={[0.052, 1.06, 0.077]} />
          <meshStandardMaterial color="#6c7273" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {[1.08, 2.08].map((y) => (
        <mesh key={y} position={[0, y, -1.04]}>
          <boxGeometry args={[2.26, 0.052, 0.077]} />
          <meshStandardMaterial color="#6c7273" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {[-0.51, 0.6].map((x, i) => (
        <mesh key={x} position={[x, 1.58, -1.04 + i * 0.03]}>
          <boxGeometry args={[i === 0 ? 1.15 : 1.05, 0.95, 0.018]} />
          <meshStandardMaterial color="#9ab3b7" transparent opacity={0.22} depthWrite={false} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 2.55, 0]} castShadow>
        <boxGeometry args={[3.0, 0.14, 2.7]} />
        <meshStandardMaterial color="#7d6a63" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[2.8, 0.12, 2.6]} />
        <meshStandardMaterial color="#b8b2a5" roughness={0.9} />
      </mesh>
    </group>
  );
}

function WheelchairStudentBadge() {
  return null;
}

function Bikes() {
  return (
    <group position={[11.8, 0, -20.1]}>
      {[0, 1, 2].map((k) => (
        <group key={k} position={[k * 0.78, 0, k % 2 === 0 ? 0.05 : -0.1]} rotation={[0, 0.18, 0]}>
          <mesh position={[-0.32, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.31, 0.035, 8, 20]} />
            <meshStandardMaterial color="#2b2d31" roughness={0.7} />
          </mesh>
          <mesh position={[0.32, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.31, 0.035, 8, 20]} />
            <meshStandardMaterial color="#2b2d31" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.46, 0]} rotation={[0, 0, 0.18]} castShadow>
            <boxGeometry args={[0.62, 0.04, 0.04]} />
            <meshStandardMaterial color={["#6d4aa8", "#c25b45", "#3c7d6b"][k]} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0.32, 0.62, 0]} castShadow>
            <boxGeometry args={[0.04, 0.42, 0.04]} />
            <meshStandardMaterial color="#4a4f57" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[-0.28, 0.68, 0]} castShadow>
            <boxGeometry args={[0.22, 0.05, 0.12]} />
            <meshStandardMaterial color="#2f3136" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Bus({ visible }: { visible: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const target = visible ? 1 : 0;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, visible ? -19.5 : -52, 0.04);
    ref.current.visible = target === 1 || Math.abs(ref.current.position.x + 52) > 1;
    void state;
  });
  return (
    <group ref={ref} position={[-52, 0, -34.2]}>
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[9.4, 2.5, 2.5]} />
        <meshStandardMaterial color="#f0a93b" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.95, 1.27]}>
        <boxGeometry args={[8.6, 0.85, 0.04]} />
        <meshStandardMaterial color="#b9d3e0" roughness={0.15} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.95, -1.27]}>
        <boxGeometry args={[8.6, 0.85, 0.04]} />
        <meshStandardMaterial color="#b9d3e0" roughness={0.15} metalness={0.3} />
      </mesh>
      <mesh position={[3.6, 0.95, 1.28]}>
        <boxGeometry args={[1.0, 1.7, 0.04]} />
        <meshStandardMaterial color="#9ec4d4" roughness={0.15} metalness={0.3} />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[9.6, 0.12, 2.6]} />
        <meshStandardMaterial color="#d9d3c6" roughness={0.7} />
      </mesh>
      {[-3.2, 3.2].map((x) => (
        <mesh key={x} position={[x, 0.5, 1.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.3, 14]} />
          <meshStandardMaterial color="#22242a" roughness={0.85} />
        </mesh>
      ))}
      {[-3.2, 3.2].map((x) => (
        <mesh key={`b${x}`} position={[x, 0.5, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.3, 14]} />
          <meshStandardMaterial color="#22242a" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 1.3]}>
        <boxGeometry args={[9.2, 0.22, 0.04]} />
        <meshStandardMaterial color="#6d4aa8" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Cars(_props: { minutes: number; paused: boolean }) {
  const carRef = useRef<THREE.Group>(null);
  const secondRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const traffic = getSim()?.traffic;
    if (!traffic) return;
    if (carRef.current) carRef.current.position.x = traffic[0].x;
    if (secondRef.current) secondRef.current.position.x = traffic[1].x;
  });
  return (
    <group>
      <group ref={carRef} position={[-40, 0, -31.9]}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[3.9, 0.75, 1.75]} />
          <meshStandardMaterial color="#d9dde3" roughness={0.35} metalness={0.45} />
        </mesh>
        <mesh position={[-0.15, 1.15, 0]} castShadow>
          <boxGeometry args={[2.1, 0.6, 1.6]} />
          <meshStandardMaterial color="#aebcc9" roughness={0.2} metalness={0.5} />
        </mesh>
        {[-1.2, 1.2].map((x) => (
          <mesh key={x} position={[x, 0.32, 0.82]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.31, 0.31, 0.22, 12]} />
            <meshStandardMaterial color="#22242a" roughness={0.85} />
          </mesh>
        ))}
        {[-1.2, 1.2].map((x) => (
          <mesh key={`b${x}`} position={[x, 0.32, -0.82]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.31, 0.31, 0.22, 12]} />
            <meshStandardMaterial color="#22242a" roughness={0.85} />
          </mesh>
        ))}
      </group>
      <group ref={secondRef} position={[30, 0, -35.1]}>
        <mesh position={[0, 0.78, 0]} castShadow>
          <boxGeometry args={[2.2, 1.5, 1.7]} />
          <meshStandardMaterial color="#3f5d8d" roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh position={[0.4, 1.35, 0]}>
          <boxGeometry args={[1.1, 0.7, 1.5]} />
          <meshStandardMaterial color="#9fb6c9" roughness={0.2} metalness={0.4} />
        </mesh>
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, 0.36, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.24, 12]} />
            <meshStandardMaterial color="#22242a" roughness={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Rain({ quality, weather }: { quality: QualityTier; weather: Weather }) {
  const count = quality === "low" ? 260 : quality === "medium" ? 650 : 1100;
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    let seed = 12345;
    function nextValue() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    for (let i = 0; i < count; i += 1) {
      const offset = i * 3;
      array[offset] = (nextValue() - 0.5) * 90;
      array[offset + 1] = nextValue() * 26;
      array[offset + 2] = (nextValue() - 0.5) * 90 - 4;
    }
    return array;
  }, [count]);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [positions]);
  useFrame((_, delta) => {
    if (!ref.current || weather !== "rain") return;
    const attribute = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < array.length; i += 3) {
      array[i + 1] -= delta * 22;
      if (array[i + 1] < 0) {
        array[i + 1] = 24;
        array[i] = (Math.random() - 0.5) * 90;
        array[i + 2] = (Math.random() - 0.5) * 90 - 4;
      }
    }
    attribute.needsUpdate = true;
  });
  if (weather !== "rain") return null;
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.07} color="#cfe0ea" transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

export function Puddles({ weather, quality }: { weather: Weather; quality: QualityTier }) {
  if (weather !== "rain" || quality === "low") return null;
  const spots: [number, number, number][] = [
    [-3.4, 0.16, -18.2],
    [4.2, 0.16, -15.6],
    [-8.2, 0.16, -8.4],
    [8.6, 0.16, 2.6],
    [-1.2, 0.13, -26.4],
    [12.4, 0.16, -12.2],
  ];
  return (
    <group>
      {spots.map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.9 + (index % 3) * 0.45, 18]} />
          <meshStandardMaterial color="#7d94a4" roughness={0.05} metalness={0.5} transparent opacity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export function EventDecor({ patioCenter, schoolColor }: { patioCenter: { x: number; z: number } | null; schoolColor: string }) {
  if (!patioCenter) return null;
  const { x, z } = patioCenter;
  return (
    <group>
      {[
        [-5.4, -2.4],
        [-1.6, -2.4],
        [2.2, -2.4],
      ].map(([dx, dz], index) => (
        <group key={index} position={[x + dx, 0.1, z + dz]}>
          <mesh position={[0, 1.0, 0]} castShadow>
            <boxGeometry args={[2.2, 0.08, 1.5]} />
            <meshStandardMaterial color={index === 1 ? "#c8564a" : schoolColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[2.2, 0.06, 1.5]} />
            <meshStandardMaterial color="#f5e9cf" roughness={0.7} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 1.0, 0.55, 0.6]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
              <meshStandardMaterial color="#8a6a45" roughness={0.8} />
            </mesh>
          ))}
          <mesh position={[0, 2.05, 0]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#f0b95a" emissive="#f0b95a" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={`banner${i}`} position={[x - 6 + i * 3, 2.7, z - 4.2]}>
          <planeGeometry args={[0.5, 0.7]} />
          <meshStandardMaterial color={["#f0b95a", "#c8564a", "#6d4aa8", "#3c7d6b", "#f5e9cf"][i]} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function NightWindows({ buildings, night }: { buildings: { x: number; z: number; rot: number; kind: string; progress: number }[]; night: boolean }) {
  if (!night) return null;
  return (
    <group>
      {buildings
        .filter((b) => b.progress >= 1 && !["path", "tactile", "court", "garden", "patio"].includes(b.kind))
        .map((b, index) => {
          const z = b.z + 0.2;
          return (
            <group key={index} position={[b.x, 0, z]} rotation={[0, (b.rot * Math.PI) / 2, 0]}>
              {[-2.4, 0, 2.4].map((dx) => (
                <mesh key={dx} position={[dx, 1.9, 0.35]}>
                  <planeGeometry args={[1.2, 1.0]} />
                  <meshStandardMaterial color="#ffe6ad" emissive="#ffd489" emissiveIntensity={1.1} transparent opacity={0.9} />
                </mesh>
              ))}
            </group>
          );
        })}
    </group>
  );
}

export { Guarita, Bikes, WheelchairStudentBadge };

// Embedded entrance artwork, 1200 × 400.
const PLAQUE_IMAGE = "data:image/webp;base64,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";
