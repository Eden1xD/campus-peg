"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { dir } from "../director";
import { resolveMaterial } from "../materials";
import { getSim } from "../sim";
import { storyNeedsDirector } from "../progression";

const MAX_LITTER = 30;
const MAX_ICONS = 10;

function iconTexture(kind: "fome" | "raio" | "livro" | "coracao" | "estrela") {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.arc(48, 44, 38, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(40, 78); g.lineTo(48, 92); g.lineTo(56, 78); g.fill();
  const col = kind === "fome" ? "#e08a3c" : kind === "raio" ? "#e05a3a" : kind === "livro" ? "#3f7fbf" : kind === "coracao" ? "#d64f7a" : "#e3b23c";
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineWidth = 5;
  if (kind === "fome") {
    g.beginPath(); g.ellipse(48, 34, 22, 11, 0, Math.PI, 0); g.fill();
    g.fillStyle = "#3c9a5f"; g.fillRect(26, 40, 44, 5);
    g.fillStyle = "#7a4a2a"; g.fillRect(26, 46, 44, 8);
    g.fillStyle = col; g.fillRect(26, 55, 44, 7);
  } else if (kind === "raio") {
    g.beginPath(); g.moveTo(54, 14); g.lineTo(32, 48); g.lineTo(47, 48); g.lineTo(40, 76); g.lineTo(64, 38); g.lineTo(49, 38); g.closePath(); g.fill();
  } else if (kind === "livro") {
    g.fillRect(24, 26, 22, 36); g.fillRect(50, 26, 22, 36);
    g.fillStyle = "#fff"; g.fillRect(28, 32, 14, 3); g.fillRect(54, 32, 14, 3); g.fillRect(28, 40, 14, 3); g.fillRect(54, 40, 14, 3);
  } else if (kind === "coracao") {
    g.beginPath(); g.moveTo(48, 70); g.bezierCurveTo(14, 46, 26, 14, 48, 32); g.bezierCurveTo(70, 14, 82, 46, 48, 70); g.fill();
  } else {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 12 : 28; g.lineTo(48 + Math.cos(a) * r, 44 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Efeitos visíveis do gabinete: lixo, poças de vazamento, queda de energia, confusões e ícones de necessidade. */
export function DirectorScene() {
  const litter = useRef<THREE.InstancedMesh>(null);
  const puddles = useRef<THREE.Group>(null);
  const markers = useRef<THREE.Group>(null);
  const icons = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => [new THREE.Color("#e8e2d0"), new THREE.Color("#d64f4f"), new THREE.Color("#3f7fbf")], []);
  const textures = useMemo(() => (typeof document === "undefined" ? null : {
    fome: iconTexture("fome"), raio: iconTexture("raio"), livro: iconTexture("livro"), coracao: iconTexture("coracao"), estrela: iconTexture("estrela"),
  }), []);
  const puddleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5f7f93", roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.85 }), []);
  useFrame(({ camera, clock }) => {
    const sim = getSim();
    if (!sim) return;
    const d = dir(sim.world);
    // lixo instanciado
    const m = litter.current;
    if (m) {
      const n = Math.min(MAX_LITTER, d.litter.length);
      for (let i = 0; i < n; i++) {
        const l = d.litter[i];
        tmp.position.set(l.x, 0.06, l.z);
        tmp.rotation.set(0, (l.x * 13 + l.z * 7) % Math.PI, 0);
        tmp.scale.set(l.kind === 1 ? 0.12 : 0.2, l.kind === 1 ? 0.18 : 0.04, l.kind === 1 ? 0.12 : 0.14);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
        m.setColorAt(i, colors[l.kind % 3]);
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // poças dos canos estourados
    const open = d.occurrences.filter((o) => o.status === "aberta");
    const pipes = open.filter((o) => o.type === "cano");
    if (puddles.current) puddles.current.children.forEach((c, i) => {
      const o = pipes[i];
      c.visible = !!o;
      if (o) {
        c.position.set(o.x, 0.04, o.z);
        const s = 0.6 + o.size * 2.2 + Math.sin(clock.elapsedTime * 2) * 0.03;
        c.scale.set(s, s, 1);
      }
    });
    // confusões: marcador vermelho entre os dois alunos
    const fights = open.filter((o) => o.type === "confusao");
    if (markers.current) markers.current.children.forEach((c, i) => {
      const o = fights[i];
      c.visible = !!o;
      if (!o) return;
      const a = sim.world.agents.find((x) => x.id === o.agents[0]);
      const b = sim.world.agents.find((x) => x.id === o.agents[1]);
      if (a && b) c.position.set((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
      c.rotation.z = clock.elapsedTime;
    });
    // queda de energia: luminárias e telas apagam (o sol continua)
    const lamp = resolveMaterial("lamp") as THREE.MeshStandardMaterial;
    const screen = resolveMaterial("screen") as THREE.MeshStandardMaterial;
    lamp.emissiveIntensity = d.powerOut ? 0 : 1.4;
    screen.emissiveIntensity = d.powerOut ? 0 : 0.7;
    // ícones de necessidade: prioridade para o mais urgente, poucos visíveis
    const g = icons.current;
    if (g && textures) {
      const cand = sim.world.agents
        .filter((a) => a.role === "student" && a.active && a.visible)
        .map((a) => {
          let kind: keyof typeof textures | null = null;
          let p = 0;
          if (a.conflictId) { kind = "raio"; p = 5; }
          else if (a.needs.hunger > 78) { kind = "fome"; p = 4; }
          else if (a.mood < 32) { kind = "raio"; p = 3; }
          else if (storyNeedsDirector(sim.world, a.id)) { kind = "estrela"; p = 2.5; }
          else if (a.seatKey && a.state === "write" && a.needs.learning > 82) { kind = "livro"; p = 2; }
          else if (a.mood > 86) { kind = a.needs.social > 80 ? "coracao" : "estrela"; p = 1; }
          return { a, kind, p, dist: camera.position.distanceTo(new THREE.Vector3(a.x, 1, a.z)) };
        })
        .filter((x) => x.kind && x.dist < 45)
        .sort((x, y) => y.p - x.p || x.dist - y.dist)
        .slice(0, MAX_ICONS);
      g.children.forEach((c, i) => {
        const it = cand[i];
        const sp = c as THREE.Sprite;
        sp.visible = !!it;
        if (!it || !it.kind) return;
        sp.position.set(it.a.x, it.a.height + 0.55 + Math.sin(clock.elapsedTime * 3 + i) * 0.04, it.a.z);
        const mat = sp.material as THREE.SpriteMaterial;
        if (mat.map !== textures[it.kind]) { mat.map = textures[it.kind]; mat.needsUpdate = true; }
      });
    }
  });
  return (
    <group>
      <instancedMesh ref={litter} args={[undefined, undefined, MAX_LITTER]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <group ref={puddles}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} material={puddleMat} visible={false}>
            <circleGeometry args={[1, 28]} />
          </mesh>
        ))}
      </group>
      <group ref={markers}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <ringGeometry args={[0.9, 1.05, 6]} />
            <meshBasicMaterial color="#e05a3a" transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      <group ref={icons}>
        {Array.from({ length: MAX_ICONS }, (_, i) => (
          <sprite key={i} scale={[0.42, 0.42, 0.42]} visible={false}>
            <spriteMaterial depthTest={false} transparent />
          </sprite>
        ))}
      </group>
    </group>
  );
}
