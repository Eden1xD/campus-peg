"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { phaseFor } from "../config";
import { footprintOf } from "../layout";
import { getSim } from "../sim";
import { useGame } from "../store";
import type { Agent, BuildingInstance } from "../types";

const dialogues = {
  patio: [
    ["Você viu o mural?", "Vi! Quero jogar o Interclasses."],
    ["Trouxe as figurinhas?", "Trouxe. Depois te mostro!"],
    ["Entendeu a última questão?", "Acho que sim. Quer ver?"],
    ["Vamos sentar ali?", "Bora, tem sombra."],
  ],
  canteen: [
    ["Tem lugar aqui?", "Tem, pode sentar!"],
    ["Gostou da merenda?", "Gostei. Hoje capricharam!"],
    ["Vai pegar fruta?", "Vou guardar pro intervalo."],
  ],
  court: [
    ["Quem começa no gol?", "Eu vou primeiro."],
    ["Vai pela ponta?", "Vou! Toca quando der."],
    ["Cabe mais um no time?", "Cabe, vem com a gente!"],
  ],
} as const;

type Place = keyof typeof dialogues;
type Sim = NonNullable<ReturnType<typeof getSim>>;
type Bounds = ReturnType<typeof footprintOf>;
type Exchange = {
  a: string; b: string; venue: string; place: Place; line: number; start: number;
};

function available(a: Agent, visible: ReadonlySet<string>) {
  return a.role === "student" && a.active && a.visible && visible.has(a.id) &&
    !a.leaving && a.intent !== "leave" && a.path.length === 0 && a.state !== "walk";
}

function inside(a: Agent, bounds: Bounds) {
  return a.x >= bounds.minX && a.x <= bounds.maxX && a.z >= bounds.minZ && a.z <= bounds.maxZ;
}

function gap(a: Agent, b: Agent) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isVenue(b: BuildingInstance): b is BuildingInstance & { kind: Place } {
  return b.progress >= 1 && (b.kind === "patio" || b.kind === "court" || b.kind === "canteen");
}

function headHeight(a: Agent) {
  const seated = a.wheelchair || ["sit", "write", "read", "eat"].includes(a.state);
  return ((seated ? 1.59 : 1.91) * (a.height ?? 1.6)) / 1.6;
}

function inView(a: Agent, camera: THREE.Camera, first: boolean, probe: THREE.Vector3) {
  probe.set(a.x, headHeight(a), a.z);
  if (probe.distanceToSquared(camera.position) > (first ? 16 : 75) ** 2) return false;
  probe.project(camera);
  return Math.abs(probe.x) < 0.95 && Math.abs(probe.y) < 0.92 && Math.abs(probe.z) <= 1;
}

function choose(sim: Sim, ids: ReadonlySet<string>, history: Map<string, number>,
  now: number, camera: THREE.Camera, first: boolean, probe: THREE.Vector3) {
  const candidates = sim.world.agents.filter(a => available(a, ids) &&
    (history.get(a.id) ?? 0) <= now && inView(a, camera, first, probe));
  let best: Pick<Exchange, "a" | "b" | "venue" | "place"> | null = null;
  let score = Infinity;
  for (const venue of sim.world.buildings) {
    if (!isVenue(venue)) continue;
    const bounds = footprintOf(venue);
    const local = candidates.filter(a => inside(a, bounds));
    for (let i = 0; i < local.length; i++) {
      const a = local[i];
      for (let j = i + 1; j < local.length; j++) {
        const b = local[j];
        const distance = gap(a, b);
        if (distance > 2.7) continue;
        const rank = distance + Math.hypot((a.x+b.x)/2-camera.position.x, (a.z+b.z)/2-camera.position.z) * 0.45;
        if (rank < score) {
          score = rank;
          best = { a: a.id, b: b.id, venue: venue.id, place: venue.kind };
        }
      }
    }
  }
  return best;
}

// Keep one fixed-size GPU texture; crop its UVs to the current sentence.
function draw(ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture, text: string) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "600 30px system-ui, sans-serif";
  const w = Math.min(width, Math.ceil(ctx.measureText(text).width) + 46);
  ctx.fillStyle = "#fff8ef";
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, 55, 16);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, 55);
  ctx.lineTo(w / 2, 67);
  ctx.lineTo(w / 2 + 8, 55);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#32263f";
  ctx.fillText(text, w / 2, 30, w - 30);
  texture.repeat.x = w / width;
  texture.needsUpdate = true;
  return w / height;
}

export function StudentConversations({ ids }: { ids: readonly string[] }) {
  const visible = useMemo(() => new Set(ids), [ids]);
  const sprite = useRef<THREE.Sprite>(null);
  const art = useRef<{ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture} | null>(null);
  const runtime = useRef({
    sim: null as Sim | null, day: -1, talk: null as Exchange | null,
    now: 0, next: 1, expanded: false, text: "", aspect: 1,
    probe: new THREE.Vector3(), history: new Map<string, number>(),
    scripts: { patio: 0, canteen: 0, court: 0 },
  });

  useEffect(() => {
    const material = sprite.current?.material;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");
    if (!ctx || !material) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    material.map = texture;
    material.needsUpdate = true;
    art.current = {ctx, texture};
    runtime.current.text = "";
    return () => {
      material.map = null;
      art.current = null;
      texture.dispose();
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const node = sprite.current;
    const ink = art.current;
    if (!node || !ink) return;
    node.visible = false;
    const sim = getSim();
    const state = useGame.getState();
    const r = runtime.current;
    if (!sim) return;
    if (r.sim !== sim || r.day !== sim.world.day) {
      r.sim = sim;
      r.day = sim.world.day;
      r.history.clear();
      r.talk = null;
      r.next = r.now + 1;
    }
    const phase = phaseFor(sim.world.minutes);
    if (state.buildKind || state.photoMode || phase === "exit" || phase === "empty" || phase === "class" || phase === "arrival") {
      r.talk = null;
      r.next = r.now + 1;
      return;
    }
    if (!state.paused) r.now += Math.min(delta, 0.25);
    const first = state.cameraMode === "first";
    if (!r.talk) {
      if (r.now < r.next || state.paused) return;
      r.next = r.now + 1.5;
      for (const [id, until] of r.history) if (until <= r.now) r.history.delete(id);
      const pair = choose(sim, visible, r.history, r.now, camera, first, r.probe);
      if (!pair) return;
      const line = r.scripts[pair.place]++ % dialogues[pair.place].length;
      r.talk = { ...pair, line, start: r.now };
      r.expanded = false;
    }
    const talk = r.talk;
    const elapsed = r.now - talk.start;
    const a = sim.world.agents.find(person => person.id === talk.a);
    const b = sim.world.agents.find(person => person.id === talk.b);
    const venue = sim.world.buildings.find(building => building.id === talk.venue);
    const bounds = venue && isVenue(venue) ? footprintOf(venue) : null;
    if (!a || !b || !bounds || !available(a, visible) || !available(b, visible) ||
        !inside(a, bounds) || !inside(b, bounds) || gap(a, b) > 3 ||
        !inView(a, camera, first, r.probe) || !inView(b, camera, first, r.probe) || elapsed >= 7.4) {
      r.history.set(talk.a, r.now + 22);
      r.history.set(talk.b, r.now + 22);
      r.talk = null;
      r.next = r.now + 3;
      return;
    }
    if (elapsed >= 3.4 && elapsed < 3.9) return;
    const turn = elapsed < 3.4 ? 0 : 1;
    const speaker = turn === 0 ? a : b;
    node.position.set(speaker.x, headHeight(speaker), speaker.z);
    const distance = node.position.distanceTo(camera.position);
    const full = distance < (first ? 10 : 15) || r.expanded ||
      state.selectedAgentId === a.id || state.selectedAgentId === b.id;
    const text = full ? dialogues[talk.place][talk.line][turn] : "···";
    if (text !== r.text) {
      r.aspect = draw(ink.ctx, ink.texture, text);
      r.text = text;
    }
    const h = THREE.MathUtils.clamp(distance * 0.030, 0.28, 1.35);
    node.scale.set(h * r.aspect, h, 1);
    node.visible = true;
  });

  return (
    <sprite ref={sprite} visible={false} center={[0.5, 0]}
      onClick={event => {
        if (event.button !== 0 || event.delta > 4 || !sprite.current?.visible || useGame.getState().buildKind) return;
        event.stopPropagation();
        runtime.current.expanded = true;
      }}>
      <spriteMaterial transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
