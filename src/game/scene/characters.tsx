"use client";

import { useEffect, useMemo, useRef } from "react";
import type {} from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getSim } from "../sim";
import { useGame } from "../store";
import { paint } from "../materials";
import { Billboard } from "./shared";

const SKIN = ["#5c3b28", "#8a5a3b", "#c68e64", "#e0b18a", "#3f2a1d", "#a06d4b"];
const HAIR_STYLES = 4;

function easeAngle(current: number, target: number, factor: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * Math.min(1, factor);
}

// Shared printed fabric: use a single texture for the whole student body.
function createUniformPrint() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#e9e6de";
  ctx.fillRect(0, 0, 192, 256);
  ctx.fillStyle = "#594774";
  ctx.fillRect(0, 57, 192, 15);
  ctx.fillRect(0, 244, 192, 12);
  ctx.fillStyle = "#a998bd";
  ctx.fillRect(0, 72, 192, 4);
  ctx.fillStyle = "#473658";
  ctx.beginPath();
  ctx.moveTo(54, 0); ctx.lineTo(138, 0); ctx.lineTo(96, 39); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(121, 89); ctx.lineTo(165, 89); ctx.lineTo(162, 121);
  ctx.lineTo(143, 134); ctx.lineTo(124, 121); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.textAlign = "center";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("PEG", 143, 114);
  ctx.fillStyle = "rgba(48, 41, 62, 0.045)";
  for (let y = 0; y < 256; y += 3) ctx.fillRect(0, y, 192, 1);
  ctx.strokeStyle = "rgba(64,49,78,.29)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (const x of [5, 187]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 246);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const fold = ctx.createLinearGradient(0, 0, 192, 0);
  for (const [offset, alpha] of [[0, .12], [.14, .02], [.29, .06], [.5, 0], [.82, .05], [1, .13]]) {
    fold.addColorStop(offset, `rgba(64,48,65,${alpha})`);
  }
  ctx.fillStyle = fold;
  ctx.fillRect(0, 0, 192, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTwill() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const weave = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const thread = [246, 237, 223, 233][(x + 2 * y) % 4];
      weave.data[i] = weave.data[i + 1] = weave.data[i + 2] = thread;
      weave.data[i + 3] = 255;
    }
  }
  ctx.putImageData(weave, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function Character({ id, shadows, uniform, twill }: { id: string; shadows: boolean; uniform?: THREE.Texture | null; twill?: THREE.Texture | null }) {
  const group = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legLeft = useRef<THREE.Group>(null);
  const legRight = useRef<THREE.Group>(null);
  const kneeLeft = useRef<THREE.Group>(null);
  const kneeRight = useRef<THREE.Group>(null);
  const armLeft = useRef<THREE.Group>(null);
  const armRight = useRef<THREE.Group>(null);
  const wheelLeft = useRef<THREE.Mesh>(null);
  const wheelRight = useRef<THREE.Mesh>(null);
  const broom = useRef<THREE.Group>(null);
  const selectedAgentId = useGame((s) => s.selectedAgentId);
  const showNames = useGame((s) => s.snapshot?.agents.find((a) => a.id === id) !== undefined);
  const agent = getSim()?.world.agents.find((a) => a.id === id);
  const palette = useMemo(
    () => ({
      skin: paint(SKIN[agent?.skin ?? 0], 0.65),
      hair: paint(agent?.hairColor ?? "#241a14", 0.8),
      shirt: paint(agent?.role === "student" ? "#e9e6de" : agent?.shirt ?? "#6d4aa8", 0.83),
      pants: paint(agent?.pants ?? "#2f3542", 0.8),
      shoe: paint("#2a2c31", 0.8),
      backpack: paint(["#83543d", "#39465a", "#596650", "#63506f"][Array.from(id).reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, 0) % 4], 0.88),
      eye: paint("#201a17", 0.5),
      metal: paint("#6d727b", 0.4, 0.6),
      fabric: paint("#e8dcc0", 0.8),
    }),
    [id, agent?.role, agent?.skin, agent?.hairColor, agent?.shirt, agent?.pants],
  );
  const scale = agent?.height ?? 1.6;

  useFrame((state, delta) => {
    const sim = getSim();
    const live = sim?.world.agents.find((a) => a.id === id);
    if (!live || !group.current) return;
    group.current.visible = live.visible;
    const targetY = 0;
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, live.x, 0.35);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, live.z, 0.35);
    group.current.position.y = targetY;
    group.current.rotation.y = easeAngle(group.current.rotation.y, live.heading, delta * 9);

    const t = state.clock.elapsedTime;
    const moving = live.state === "walk" && live.path.length > 0;
    // sentado só quando há assento reservado e alcançado: nunca "estudando" sem aula ou sem cadeira
    const sitting = live.wheelchair || (["sit", "write", "read", "eat"].includes(live.state) && !!live.seatKey && live.path.length === 0);
    // desacelera ao se aproximar do destino: a passada encurta nos últimos metros
    const next = live.path[live.pathIndex];
    const lastLeg = live.pathIndex >= live.path.length - 1 && next ? Math.min(1, Math.hypot(next.x - live.x, next.z - live.z) / 1.2) : 1;
    const stride = moving ? 0.35 + 0.65 * lastLeg : 0;
    const swing = moving ? Math.sin(t * (5 + 2 * lastLeg)) * 0.55 * stride : 0;
    const cue = (live.id.charCodeAt(live.id.length - 1) % 7) / 7;
    const raiseHand = live.state === "write" && live.role === "student" && Math.sin(t * 0.21 + cue * 6.28) > 0.93;
    const cheering = live.state === "sit" && live.activity.includes("Assistindo");
    const talking = live.state === "idle" && !moving && /pátio|Conversando|Pátio/.test(live.activity);

    if (torso.current) {
      torso.current.position.y = THREE.MathUtils.lerp(torso.current.position.y, sitting ? -0.32 : moving ? Math.abs(Math.sin(t * 7)) * 0.035 : 0, 0.2);
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, sitting ? -0.06 : 0, 0.15);
    }
    if (legLeft.current && legRight.current) {
      const sitAngle = -1.35;
      legLeft.current.rotation.x = THREE.MathUtils.lerp(legLeft.current.rotation.x, sitting ? sitAngle : swing, 0.22);
      legRight.current.rotation.x = THREE.MathUtils.lerp(legRight.current.rotation.x, sitting ? sitAngle : -swing, 0.22);
    }
    if (kneeLeft.current && kneeRight.current) {
      kneeLeft.current.rotation.x = THREE.MathUtils.lerp(kneeLeft.current.rotation.x, sitting ? 1.38 : Math.max(0, swing * 0.65), 0.22);
      kneeRight.current.rotation.x = THREE.MathUtils.lerp(kneeRight.current.rotation.x, sitting ? 1.38 : Math.max(0, -swing * 0.65), 0.22);
    }
    if (armLeft.current && armRight.current) {
      let left = moving ? -swing * 0.8 : Math.sin(t * 1.6) * 0.06;
      let right = moving ? swing * 0.8 : -Math.sin(t * 1.6) * 0.06;
      if (live.state === "write") right = -0.95 + Math.sin(t * 6) * 0.12;
      if (raiseHand) right = -2.9; // levanta a mão na aula
      if (cheering) { const c = Math.sin(t * 5 + cue * 6) > 0.2; left = c ? -2.6 : -0.4; right = c ? -2.6 : -0.4; }
      if (talking) right = -0.5 + Math.sin(t * 2.2 + cue * 5) * 0.35;
      if (live.state === "read") {
        left = -0.85;
        right = -0.85;
      }
      if (live.state === "eat") right = -1.6 + Math.abs(Math.sin(t * 2.4)) * 0.7;
      if (live.state === "teach") {
        // alterna entre escrever no quadro (de costas para a turma) e explicar
        const writing = Math.sin(t * 0.25 + cue * 4) > 0.4;
        right = writing ? -2.3 + Math.sin(t * 8) * 0.12 : -1.6 + Math.sin(t * 1.4) * 0.4;
        group.current.rotation.y = easeAngle(group.current.rotation.y, live.heading + (writing ? Math.PI : 0), delta * 4);
      }
      if (live.state === "clean") {
        left = -1.1 + Math.sin(t * 4) * 0.25;
        right = -0.6;
      }
      if (live.state === "fix") {
        left = -1.3 + Math.sin(t * 7) * 0.3;
        right = -1.2;
      }
      if (live.state === "play") {
        left = -2.2 + Math.sin(t * 3) * 0.6;
        right = -2.2 - Math.sin(t * 3) * 0.6;
      }
      armLeft.current.rotation.x = THREE.MathUtils.lerp(armLeft.current.rotation.x, left, 0.2);
      armRight.current.rotation.x = THREE.MathUtils.lerp(armRight.current.rotation.x, right, 0.2);
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.7 + (live.skin ?? 0)) * 0.12;
    }
    if (broom.current) broom.current.visible = live.state === "clean";
    if (live.wheelchair) {
      const spin = moving ? t * 5 : 0;
      if (wheelLeft.current) wheelLeft.current.rotation.z = spin;
      if (wheelRight.current) wheelRight.current.rotation.z = spin;
    }
  });

  if (!agent) return null;
  const s = scale / 1.6;

  return (
    <group ref={group} scale={[s, s, s]} onClick={(event) => {
      const store = useGame.getState();
      if (event.button !== 0 || store.buildKind || event.delta > 10) return;
      event.stopPropagation();
      store.actions.selectAgent(id);
    }}>
      {selectedAgentId === id && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 24]} />
          <meshBasicMaterial color="#c8a2ff" transparent opacity={0.85} />
        </mesh>
      )}
      <group ref={torso}>
        {/* legs */}
        <group ref={legLeft} position={[-0.12, 0.82, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow={shadows}>
            <boxGeometry args={[0.16, 0.36, 0.17]} />
            <meshStandardMaterial map={twill ?? null} color={palette.pants.color} roughness={0.90} />
          </mesh>
          <group ref={kneeLeft} position={[0, -0.36, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow={shadows}>
              <boxGeometry args={[0.15, 0.36, 0.16]} />
              <meshStandardMaterial map={twill ?? null} color={palette.pants.color} roughness={0.90} />
            </mesh>
            <mesh material={palette.shoe} position={[0, -0.38, 0.05]} castShadow={shadows}>
              <boxGeometry args={[0.18, 0.12, 0.28]} />
            </mesh>
          </group>
        </group>
        <group ref={legRight} position={[0.12, 0.82, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow={shadows}>
            <boxGeometry args={[0.16, 0.36, 0.17]} />
            <meshStandardMaterial map={twill ?? null} color={palette.pants.color} roughness={0.90} />
          </mesh>
          <group ref={kneeRight} position={[0, -0.36, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow={shadows}>
              <boxGeometry args={[0.15, 0.36, 0.16]} />
              <meshStandardMaterial map={twill ?? null} color={palette.pants.color} roughness={0.90} />
            </mesh>
            <mesh material={palette.shoe} position={[0, -0.38, 0.05]} castShadow={shadows}>
              <boxGeometry args={[0.18, 0.12, 0.28]} />
            </mesh>
          </group>
        </group>
        {/* torso */}
        <mesh position={[0, 1.16, 0]} castShadow={shadows}>
          <boxGeometry args={[0.46, 0.6, 0.26]} />
          <primitive object={palette.shirt} attach="material" />
        </mesh>
        <mesh position={[0, 1.42, 0]}>
          <boxGeometry args={[0.42, 0.1, 0.24]} />
          <primitive object={palette.fabric} attach="material" />
        </mesh>
        {agent.role === "student" && uniform && (
          <mesh position={[0, 1.16, 0.132]}>
            <planeGeometry args={[0.46, 0.6]} />
            <meshStandardMaterial map={uniform} roughness={0.87} />
          </mesh>
        )}
        {/* arms */}
        <group ref={armLeft} position={[-0.28, 1.36, 0]}>
          {agent.role === "student" && (
            <mesh position={[0, -0.12, 0]}>
              <boxGeometry args={[0.14, 0.24, 0.15]} />
              <meshStandardMaterial color="#594774" roughness={0.85} />
            </mesh>
          )}
          <mesh position={[0, -0.24, 0]} castShadow={shadows}>
            <boxGeometry args={[0.12, 0.5, 0.13]} />
            <primitive object={agent.role === "student" ? palette.skin : palette.shirt} attach="material" />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <primitive object={palette.skin} attach="material" />
          </mesh>
        </group>
        <group ref={armRight} position={[0.28, 1.36, 0]}>
          {agent.role === "student" && (
            <mesh position={[0, -0.12, 0]}>
              <boxGeometry args={[0.14, 0.24, 0.15]} />
              <meshStandardMaterial color="#594774" roughness={0.85} />
            </mesh>
          )}
          <mesh position={[0, -0.24, 0]} castShadow={shadows}>
            <boxGeometry args={[0.12, 0.5, 0.13]} />
            <primitive object={agent.role === "student" ? palette.skin : palette.shirt} attach="material" />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <primitive object={palette.skin} attach="material" />
          </mesh>
        </group>
        {/* head */}
        <group ref={head} position={[0, 1.62, 0]}>
          <mesh castShadow={shadows}>
            <sphereGeometry args={[0.17, 18, 14]} />
            <primitive object={palette.skin} attach="material" />
          </mesh>
          {/* eyes */}
          <mesh position={[-0.06, 0.02, 0.155]}>
            <sphereGeometry args={[0.019, 8, 6]} />
            <primitive object={palette.eye} attach="material" />
          </mesh>
          <mesh position={[0.06, 0.02, 0.155]}>
            <sphereGeometry args={[0.019, 8, 6]} />
            <primitive object={palette.eye} attach="material" />
          </mesh>
          {/* hair */}
          {agent.hairStyle % HAIR_STYLES === 0 && (
            <mesh position={[0, 0.08, -0.01]} scale={[1.05, 0.85, 1.05]} castShadow={shadows}>
              <sphereGeometry args={[0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
              <primitive object={palette.hair} attach="material" />
            </mesh>
          )}
          {agent.hairStyle % HAIR_STYLES === 1 && (
            <mesh position={[0, 0.12, -0.03]} castShadow={shadows}>
              <sphereGeometry args={[0.19, 12, 10]} />
              <primitive object={palette.hair} attach="material" />
            </mesh>
          )}
          {agent.hairStyle % HAIR_STYLES === 2 && (
            <group>
              <mesh position={[0, 0.09, -0.02]} scale={[1, 0.7, 1.05]}>
                <sphereGeometry args={[0.185, 12, 10]} />
                <primitive object={palette.hair} attach="material" />
              </mesh>
              <mesh position={[0, -0.02, -0.16]}>
                <boxGeometry args={[0.3, 0.3, 0.1]} />
                <primitive object={palette.hair} attach="material" />
              </mesh>
            </group>
          )}
          {agent.hairStyle % HAIR_STYLES === 3 && (
            <group>
              <mesh position={[0, 0.1, -0.03]} scale={[1.05, 0.75, 1.1]}>
                <sphereGeometry args={[0.185, 12, 10]} />
                <primitive object={palette.hair} attach="material" />
              </mesh>
              <mesh position={[0, -0.16, -0.12]}>
                <sphereGeometry args={[0.12, 10, 8]} />
                <primitive object={palette.hair} attach="material" />
              </mesh>
            </group>
          )}
        </group>
        {agent.backpack && (
          <group>
            <mesh position={[0, 1.16, -0.22]} castShadow={shadows}>
              <boxGeometry args={[0.32, 0.42, 0.18]} />
              <meshStandardMaterial map={twill ?? null} color={palette.backpack.color} roughness={0.90} />
            </mesh>
            <mesh position={[0, 1.07, -0.322]}>
              <boxGeometry args={[0.25, 0.15, 0.06]} />
              <meshStandardMaterial map={twill ?? null} color={palette.backpack.color} roughness={0.90} />
            </mesh>
            <mesh position={[0.086, 1.11, -0.366]} material={palette.metal}>
              <boxGeometry args={[0.018, 0.044, 0.009]} />
            </mesh>
            <mesh position={[0, 1.13, -0.355]} material={palette.metal}>
              <boxGeometry args={[0.22, 0.012, 0.008]} />
            </mesh>
            {[-0.18, 0.18].map((x) => (
              <mesh key={x} position={[x, 1.26, 0.012]}>
                <boxGeometry args={[0.043, 0.41, 0.286]} />
                <meshStandardMaterial map={twill ?? null} color={palette.backpack.color} roughness={0.90} />
              </mesh>
            ))}
          </group>
        )}
        {agent.role === "teacher" && (
          <mesh position={[0.22, 1.2, 0.14]}>
            <boxGeometry args={[0.16, 0.22, 0.03]} />
            <meshStandardMaterial color="#f4efe6" roughness={0.8} />
          </mesh>
        )}
        {/* cleaning broom */}
        <group ref={broom} position={[0.3, 0.9, 0.28]} visible={false}>
          <mesh rotation={[0.5, 0, 0.2]}>
            <cylinderGeometry args={[0.02, 0.02, 1.2, 6]} />
            <meshStandardMaterial color="#a4794a" roughness={0.8} />
          </mesh>
          <mesh position={[0.1, -0.6, 0.28]}>
            <boxGeometry args={[0.34, 0.1, 0.14]} />
            <meshStandardMaterial color="#d4b063" roughness={0.9} />
          </mesh>
        </group>
      </group>
      {agent.wheelchair && (
        <group position={[0, 0, 0.02]}>
          <mesh position={[-0.34, 0.36, -0.05]} rotation={[0, Math.PI / 2, 0]} ref={wheelLeft} castShadow={shadows}>
            <torusGeometry args={[0.34, 0.035, 8, 20]} />
            <primitive object={palette.metal} attach="material" />
          </mesh>
          <mesh position={[0.34, 0.36, -0.05]} rotation={[0, Math.PI / 2, 0]} ref={wheelRight} castShadow={shadows}>
            <torusGeometry args={[0.34, 0.035, 8, 20]} />
            <primitive object={palette.metal} attach="material" />
          </mesh>
          <mesh position={[0, 0.55, -0.02]}>
            <boxGeometry args={[0.52, 0.06, 0.44]} />
            <primitive object={palette.pants} attach="material" />
          </mesh>
          <mesh position={[0, 0.85, -0.26]}>
            <boxGeometry args={[0.52, 0.5, 0.06]} />
            <primitive object={palette.fabric} attach="material" />
          </mesh>
        </group>
      )}
      {showNames && selectedAgentId === id && (
        <Billboard text={agent.name} sub={agent.activity} position={[0, 2.35, 0]} scale={2.1} background="#231a36" color="#f8f3ff" />
      )}
    </group>
  );
}

export function Characters({ ids, shadows }: { ids: string[]; shadows: boolean }) {
  const uniform = useMemo(createUniformPrint, []);
  const twill = useMemo(createTwill, []);
  useEffect(() => () => twill?.dispose(), [twill]);
  useEffect(() => () => uniform?.dispose(), [uniform]);
  return (
    <group>
      {ids.map((id) => (
        <Character key={id} id={id} shadows={shadows} uniform={uniform} twill={twill} />
      ))}
    </group>
  );
}
