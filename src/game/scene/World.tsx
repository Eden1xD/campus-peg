"use client";

import { bindMobileCamera, mobileTapEvents } from "./mobileCamera";
import { useEffect, useMemo, useRef } from "react";
import type {} from "@react-three/fiber";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GATE, PLOT, QUALITY, WORLD, formatMoney, lightPhase } from "../config";
import { getSim, buildingStage, currentEvent, movePlayer } from "../sim";
import { doorLocal, entryPoint, footprintOf, sharedSides, specFor } from "../layout";
import { useGame } from "../store";
import type { BuildingInstance } from "../types";
import { buildBuildingGeometry, ConstructionCrew } from "./buildings";
import { Characters } from "./characters";
import { Billboard, SignLabel } from "./shared";
import { Bikes, Bus, Cars, EventDecor, Guarita, NightWindows, Puddles, Rain, StaticStreet } from "./environment";
import { resolveMaterial as resolveMaterialClient } from "../materials";
import { Neighborhood } from "./Neighborhood";
import { StudentConversations } from "./StudentConversations";
import { DirectorScene } from "./DirectorScene";
import { Campus } from "./Campus";
import { HighlightMarker, PlanBlueprints, Residents, XRay, ZoneAudio } from "./Overlays3D";
import { usePlanning } from "../ui/ManageUI";
import { addPlan, addTemplatePlans, allTemplates } from "../progression";
import { snapPlacement } from "../sim";
import { buildingTier, cosmetic, cosmeticPaint, prog, roomLabelFor } from "../progression";
import { dir } from "../director";
/** Quadros-chave do sol: 07h dourado na entrada, 09h15 pátio claro, 11h30 neutro e forte, 15h15 quente com sombras longas. */
const SUN_KEYS = [
  { m: 330, color: "#3d4a78", intensity: 0.15, elev: 8, az: 1.4, sky: "#1a2238", hemi: 0.35, exp: 0.85, env: 0.15 },
  { m: 420, color: "#ffbf72", intensity: 2.1, elev: 13, az: 1.25, sky: "#f3c9a0", hemi: 0.55, exp: 1.05, env: 0.55 },
  { m: 555, color: "#fff1d8", intensity: 2.7, elev: 42, az: 0.9, sky: "#bcd9ef", hemi: 0.7, exp: 1.05, env: 0.8 },
  { m: 690, color: "#ffffff", intensity: 3.1, elev: 70, az: 0.2, sky: "#b5d3ea", hemi: 0.75, exp: 1.0, env: 0.9 },
  { m: 915, color: "#ffb36e", intensity: 2.0, elev: 21, az: -1.15, sky: "#e8c39b", hemi: 0.6, exp: 1.05, env: 0.6 },
  { m: 1040, color: "#ff8a52", intensity: 0.9, elev: 6, az: -1.4, sky: "#9a6d6a", hemi: 0.45, exp: 0.95, env: 0.3 },
  { m: 1110, color: "#5b6fa8", intensity: 0.2, elev: 25, az: 0.4, sky: "#121a2c", hemi: 0.35, exp: 0.85, env: 0.15 },
];
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function sunAt(minutes: number) {
  const m = Math.max(SUN_KEYS[0].m, Math.min(SUN_KEYS[SUN_KEYS.length - 1].m, minutes));
  let i = 0;
  while (i < SUN_KEYS.length - 2 && SUN_KEYS[i + 1].m < m) i += 1;
  const a = SUN_KEYS[i], b = SUN_KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (m - a.m) / (b.m - a.m)));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    color: tmpA.set(a.color).lerp(tmpB.set(b.color), t).clone(),
    sky: new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), t),
    intensity: lerp(a.intensity, b.intensity), elev: lerp(a.elev, b.elev), az: lerp(a.az, b.az),
    hemi: lerp(a.hemi, b.hemi), exp: lerp(a.exp, b.exp), env: lerp(a.env, b.env),
  };
}

function Lighting({ weather, low }: { minutes: number; weather: string; low: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene, gl } = useThree();
  const frame = useRef(0);
  const fog = useMemo(() => new THREE.FogExp2("#cfe0e8", 0.0055), []);
  useEffect(() => {
    scene.fog = fog;
    let disposed = false;
    let envTex: THREE.Texture | null = null;
    // HDRI leve (CC0, Poly Haven). Se faltar, a cena continua com a luz hemisférica.
    import("three/examples/jsm/loaders/HDRLoader.js").then(({ HDRLoader }) => {
      new HDRLoader().load("/texturas/hdri/ceu.hdr", (hdr) => {
        if (disposed) { hdr.dispose(); return; }
        const pmrem = new THREE.PMREMGenerator(gl);
        envTex = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
        scene.environment = envTex;
      }, undefined, () => { /* HDRI opcional ausente */ });
    }).catch(() => undefined);
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      disposed = true;
      scene.fog = null;
      scene.environment = null;
      envTex?.dispose();
      gl.shadowMap.autoUpdate = true;
    };
  }, [scene, gl, fog]);
  useFrame(() => {
    const minutes = getSim()?.world.minutes ?? 480;
    const k = sunAt(minutes);
    const rain = weather === "rain";
    const cloud = weather === "cloud" || rain;
    const sky = k.sky.clone();
    if (cloud) sky.lerp(new THREE.Color(minutes > 1080 ? "#141a26" : "#a7b4bd"), rain ? 0.65 : 0.45);
    scene.background = sky;
    fog.color.copy(sky);
    fog.density = rain ? 0.009 : cloud ? 0.007 : 0.0048;
    const s = sun.current;
    if (s) {
      const r = 60;
      const el = (k.elev * Math.PI) / 180;
      s.position.set(Math.sin(k.az) * Math.cos(el) * r, Math.sin(el) * r + 4, -Math.cos(k.az) * Math.cos(el) * r * 0.6 + 10);
      s.color.copy(cloud ? k.color.clone().lerp(new THREE.Color("#dbe4ea"), 0.6) : k.color);
      s.intensity = k.intensity * (rain ? 0.45 : cloud ? 0.6 : 1);
    }
    if (hemi.current) hemi.current.intensity = k.hemi * (rain ? 1.25 : 1);
    (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = k.env * (cloud ? 0.8 : 1);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = k.exp * (rain ? 1.08 : 1);
    // sol lento: mapa de sombras atualizado a cada 5 quadros
    frame.current += 1;
    if (frame.current % 5 === 0) gl.shadowMap.needsUpdate = true;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#dceaf5", "#5a5040", 0.65]} />
      <directionalLight
        ref={sun}
        position={[-26, 40, 24]}
        intensity={2.4}
        castShadow={!low}
        shadow-mapSize-width={low ? 512 : 1536}
        shadow-mapSize-height={low ? 512 : 1536}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0006}
        shadow-radius={3}
      />
    </>
  );
}

function BuildingView({ building, shadows }: { building: BuildingInstance; shadows: boolean }) {
  const qualityTier = useGame((s) => (s.snapshot ? (getSim()?.world.settings.quality ?? "medium") : "medium"));
  const showRoofs = useGame((s) => s.showRoofs);
  const selected = useGame((s) => s.selectedBuildingId === building.id);
  const buildKind = useGame((s) => s.buildKind);
  const actions = useGame((s) => s.actions);
  const sim = getSim();
  const improvements = sim?.world.improvements ?? [];
  const schoolName = sim?.world.schoolName ?? "Escola PEG";
  const schoolColor = sim?.world.schoolColors.primary ?? "#6d4aa8";
  const detail = QUALITY[qualityTier].detail;
  const improvementsKey = improvements.join(",");
  const sharedNow = sharedSides(building, sim?.world.buildings ?? []);
  const sharedKey = `${sharedNow.front}${sharedNow.back}${sharedNow.left}${sharedNow.right}`;
  const labelKey = roomLabelFor(building, sim?.world.buildings ?? []);
  const geometry = useMemo(
    () =>
      buildBuildingGeometry(building, {
        showRoofs: showRoofs && !selected, // exteriores: o prédio selecionado abre para mostrar a sala
        quality: detail,
        improvements,
        schoolName,
        schoolColor,
        shared: sharedSides(building, sim?.world.buildings ?? []),
        roomLabel: roomLabelFor(building, sim?.world.buildings ?? []),
        tier: buildingTier(building),
        paint: sim ? cosmeticPaint(sim.world) : null,
        plateColor: sim ? cosmetic(sim.world, "placa") : null,
        benchColor: sim ? cosmetic(sim.world, "banco") : null,
        facade: sim ? prog(sim.world).custom.facade : "classica",
      }),
    // deprecated object identity on purpose: only meaningful changes rebuild merged geometry
    [building.kind, building.x, building.z, building.rot, building.progress, building.accessible, showRoofs, detail, improvementsKey, schoolName, schoolColor, (building.upgrades ?? []).join(","), sharedKey, labelKey, buildingTier(building), sim ? cosmeticPaint(sim.world) : null, sim ? cosmetic(sim.world, "placa") : null, sim ? cosmetic(sim.world, "banco") : null, selected, building.paint, building.floorStyle, sim ? prog(sim.world).custom.facade : ""],
  );
  const entrance = selected ? entryPoint({ ...building, x: 0, z: 0, rot: 0 }) : null;
  const stage = geometry.stage;
  const spec = specFor(building.kind);
  const signs = (
    <>
      {geometry.decor.map((decor, index) => (
        <SignLabel
          key={index}
          text={decor.text}
          sub={decor.sub}
          width={512}
          height={Math.round(512 * (decor.h / decor.w))}
          position={decor.pos}
          rotation={decor.rot}
          worldWidth={decor.w}
          worldHeight={decor.h}
          background={decor.bg}
          color={decor.color}
          border={decor.border}
        />
      ))}
    </>
  );

  return (
    <group
      position={[building.x, 0, building.z]}
      rotation={[0, (building.rot * Math.PI) / 2, 0]}
      onClick={(event) => {
        if (event.button !== 0 || event.delta > 10) return;
        if (buildKind) {
          event.stopPropagation();
          actions.setGhost(Math.round(event.point.x * 2) / 2, Math.round(event.point.z * 2) / 2);
          return;
        }
        event.stopPropagation();
        actions.selectBuilding(building.id);
      }}
      onPointerOver={() => {
        if (!buildKind) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      {Object.entries(geometry.parts).map(([key, geo]) => (
        <mesh key={key} geometry={geo} castShadow={shadows} receiveShadow>
          <primitive object={materialForKey(key)} attach="material" />
        </mesh>
      ))}
      {signs}
      {building.progress < 1 && <ConstructionCrew site={{ ...building, x: 0, z: 0 }} />}
      {building.progress < 1 && (
        <Billboard
          text={`${buildingStage(building.progress).label}`}
          sub={`${Math.round(building.progress * 100)}% · ${formatMoney(spec.cost)}`}
          position={[0, 5.4, 0]}
          scale={4.4}
        />
      )}
      {selected && (
        <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(spec.w, spec.d) * 0.56, Math.max(spec.w, spec.d) * 0.62, 48]} />
          <meshBasicMaterial color="#c8a2ff" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      {entrance && stage >= 3 && !spec.open && (
        <group position={[entrance.x, 0.3, entrance.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.55, 20]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.8} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function materialForKey(key: string): THREE.Material {
  return resolveMaterialClient(key);
}

function Buildings({ shadows }: { shadows: boolean }) {
  const buildings = useGame((s) => s.snapshot?.buildings);
  if (!buildings) return null;
  return (
    <group>
      {buildings.map((building) => (
        <BuildingView key={building.id} building={building} shadows={shadows} />
      ))}
    </group>
  );
}

function GhostPreview() {
  const ghost = useGame((s) => s.ghost);
  const buildKind = useGame((s) => s.buildKind);
  const actions = useGame((s) => s.actions);
  if (!ghost || !buildKind) return null;
  const spec = specFor(buildKind);
  const color = ghost.valid ? "#63d68f" : "#e06767";
  return (
    <>
    {(ghost.zones ?? []).map((zn, i) => (
      <mesh key={i} position={[(zn.minX + zn.maxX) / 2, 0.32, (zn.minZ + zn.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(0.2, zn.maxX - zn.minX), Math.max(0.2, zn.maxZ - zn.minZ)]} />
        <meshBasicMaterial color="#ff4d4d" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    ))}
    <group position={[ghost.x, 0, ghost.z]} rotation={[0, (ghost.rot * Math.PI) / 2, 0]}>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[spec.w, 3.2, spec.d]} />
        <meshStandardMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <lineSegments position={[0, 1.6, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(spec.w, 3.2, spec.d)]} />
        <lineBasicMaterial color={color} />
      </lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <planeGeometry args={[spec.w, spec.d]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      {!spec.open && (
        <group position={[doorLocal(buildKind, spec.w, spec.d).x, 0.06, spec.d / 2]}>
          <mesh position={[0, 0.2, 1.0]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.35, 0.9, 12]} />
            <meshBasicMaterial color="#f2d16b" />
          </mesh>
          <mesh position={[0, 0.02, 1.0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.2, 2.0]} />
            <meshBasicMaterial color="#f2d16b" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        </group>
      )}
      <SignLabel
        text={ghost.message}
        sub={ghost.reason ?? `Custo ${formatMoney(spec.cost)}`}
        width={640}
        height={200}
        position={[0, 3.9, 0]}
        worldWidth={5.2}
        worldHeight={1.6}
        background={ghost.valid ? "#1f3a2b" : "#3d1f24"}
        color="#f6f2ff"
        border={color}
      />
      <mesh
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
        if (event.button !== 0 || event.delta > 10) return;
          event.stopPropagation();
          actions.setGhost(Math.round(event.point.x * 2) / 2, Math.round(event.point.z * 2) / 2);
        }}
      >
        <planeGeometry args={[spec.w, spec.d]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
    </>
  );
}

function SeatsOverlay() {
  const sim = getSim();
  const tick = useGame((s) => s.simTick);
  const seats = useMemo(() => sim?.seats ?? [], [sim, tick]);
  const claims = sim?.claims;
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    seats.forEach((seat, index) => {
      matrix.makeTranslation(seat.x, 0.35, seat.z);
      ref.current!.setMatrixAt(index, matrix);
      const free = !claims?.has(seat.key);
      ref.current!.setColorAt(index, new THREE.Color(free ? "#63d68f" : "#f0a93b"));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.count = seats.length;
  }, [seats, claims]);
  if (seats.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, seats.length)]}>
      <cylinderGeometry args={[0.22, 0.22, 0.7, 8]} />
      <meshBasicMaterial transparent opacity={0.75} />
    </instancedMesh>
  );
}

function OverlaySlabs() {
  const overlay = useGame((s) => s.overlay);
  const buildings = useGame((s) => s.snapshot?.buildings);
  const agents = useGame((s) => s.snapshot?.agents);
  if (!buildings || overlay === "none") return null;
  if (overlay === "seats") return <SeatsOverlay />;
  return (
    <group>
      {buildings.map((b) => {
        const fp = footprintOf(b);
        let color = "#63d68f";
        let value = 0;
        if (overlay === "occupancy") {
          const inside = (agents ?? []).filter(
            (a) => a.x > fp.minX && a.x < fp.maxX && a.z > fp.minZ && a.z < fp.maxZ,
          ).length;
          value = inside;
          color = inside > 8 ? "#e06767" : inside > 3 ? "#f0a93b" : "#63d68f";
        } else if (overlay === "cleanliness") {
          value = Math.round(100 - b.dirt);
          color = b.dirt > 45 ? "#e06767" : b.dirt > 22 ? "#f0a93b" : "#63d68f";
        } else if (overlay === "accessibility") {
          value = b.accessible ? 100 : 0;
          color = b.accessible ? "#63d68f" : "#e06767";
        } else if (overlay === "condition") {
          value = Math.round(b.condition);
          color = b.condition < 50 ? "#e06767" : b.condition < 75 ? "#f0a93b" : "#63d68f";
        } else if (overlay === "queue") {
          value = 0;
          color = "#63d68f";
        }
        if (b.kind === "path" || b.kind === "tactile") return null;
        return (
          <group key={b.id} position={[b.x, 0, b.z]}>
            <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[fp.w, fp.d]} />
              <meshBasicMaterial color={color} transparent opacity={0.32} side={THREE.DoubleSide} />
            </mesh>
            <Billboard
              text={overlay === "occupancy" ? `${value} pessoas` : `${value}%`}
              position={[0, 4.2, 0]}
              scale={2.6}
              background="#1a1428"
              color="#f6f1ff"
            />
          </group>
        );
      })}
    </group>
  );
}

function InteractionPlane() {
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const actions = useGame((s) => s.actions);
  const buildKind = useGame((s) => s.buildKind);
  const selectAgent = actions.selectAgent;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.055, (WORLD.minZ + WORLD.maxZ) / 2]}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        tapStart.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY, t: performance.now() };
      }}
      onPointerUp={(event) => {
        // toque curto seleciona/fixa a prévia; arrastar a câmera nunca compra nem seleciona
        const t = tapStart.current;
        tapStart.current = null;
        if (!t || event.button !== 0) return;
        const moved = Math.hypot(event.nativeEvent.clientX - t.x, event.nativeEvent.clientY - t.y);
        if (moved > 10 || performance.now() - t.t > 450) return;
        const planning = usePlanning.getState();
        const simNow = getSim();
        if (planning.active && simNow && (planning.kind || planning.template)) {
          // modo planejamento: desenha sem gastar; validação mostrada na planta
          if (planning.template) {
            const t = allTemplates(simNow.world).find((x) => x.id === planning.template);
            if (t) addTemplatePlans(simNow.world, t, Math.round(event.point.x), Math.round(event.point.z));
          } else if (planning.kind) {
            const sn = snapPlacement(simNow, planning.kind, event.point.x, event.point.z, planning.rot);
            addPlan(simNow.world, planning.kind, sn.x, sn.z, planning.rot);
          }
          actions.refresh();
          return;
        }
        if (buildKind) {
          actions.setGhost(Math.round(event.point.x * 2) / 2, Math.round(event.point.z * 2) / 2);
        } else {
          actions.selectBuilding(null);
          selectAgent(null);
        }
      }}
    >
      <planeGeometry args={[WORLD.maxX - WORLD.minX + 60, WORLD.maxZ - WORLD.minZ + 60]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function BuildGrid() {
  const showGrid = useGame((s) => s.showGrid);
  const buildKind = useGame((s) => s.buildKind);
  if (!buildKind && !showGrid) return null;
  return (
    <gridHelper
      args={[64, 64, "#b79be6", "#6f5a96"]}
      position={[0, 0.19, 2]}
      material-transparent
      material-opacity={0.32}
    />
  );
}

const KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);

function CameraRig() {
  const mobileAxis = useRef({ x: 0, y: 0 });
  const gl = useThree((state) => state.gl);
  const cameraMode = useGame((s) => s.cameraMode);
  const preset = useGame((s) => s.cameraPreset);
  const photoMode = useGame((s) => s.photoMode);
  const reduceMotion = useGame((s) => s.settings.reduceMotion);
  const state = useRef({
    yaw: Math.PI * 0.25,
    pitch: 0.72,
    distance: 62,
    targetX: 0,
    targetZ: 0,
    lookYaw: Math.PI,
    lookPitch: 0,
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef<"orbit" | "pan" | null>(null);
  const last = useRef({ x: 0, y: 0, distance: 0 });
  const keys = useRef(new Set<string>());

  useEffect(() => {
    if (!preset) return;
    state.current.yaw = preset.view.yaw;
    state.current.pitch = preset.view.pitch;
    state.current.distance = preset.view.distance;
    state.current.targetX = preset.view.targetX;
    state.current.targetZ = preset.view.targetZ;
    state.current.lookYaw = preset.view.yaw;
    useGame.getState().actions.updateCameraView({
      yaw: preset.view.yaw,
      pitch: preset.view.pitch,
      distance: preset.view.distance,
      targetX: preset.view.targetX,
      targetZ: preset.view.targetZ,
    });
  }, [preset]);

  useEffect(() => {
    const el = gl.domElement;
    const unbindMobile = bindMobileCamera(el, cameraMode === "first", state.current, mobileAxis.current, () => {
      const {yaw,pitch,distance,targetX,targetZ} = state.current;
      useGame.getState().actions.updateCameraView({yaw,pitch,distance,targetX,targetZ});
    });
    const down = (event: PointerEvent) => {
      if (mobileTapEvents.has(event)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      last.current = { x: event.clientX, y: event.clientY, distance: 0 };
      dragging.current = event.button === 1 || event.shiftKey ? "pan" : "orbit";
      el.setPointerCapture(event.pointerId);
      if (event.button === 2) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const move = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      if (event.buttons & 2) event.stopImmediatePropagation();
      const previous = pointers.current.get(event.pointerId)!;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      if (cameraMode === "first") {
        if (pointers.current.size === 1) {
          const st = getSim()?.world.settings;
          const sens = st?.sensitivity ?? 1;
          const inv = st?.invertY ? -1 : 1;
          state.current.lookYaw -= dx * 0.006 * sens;
          state.current.lookPitch = Math.max(-1.15, Math.min(1.1, state.current.lookPitch - dy * 0.005 * sens * inv));
        }
        return;
      }
      if (pointers.current.size >= 2) {
        const points = [...pointers.current.values()];
        const pinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (last.current.distance > 0) {
          state.current.distance = Math.max(10, Math.min(150, state.current.distance - (pinch - last.current.distance) * 0.28));
        }
        last.current.distance = pinch;
        const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
        if (last.current.x !== 0) {
          panCamera(state.current, mid.x - last.current.x, mid.y - last.current.y, true);
        }
        last.current.x = mid.x;
        last.current.y = mid.y;
        return;
      }
      if (dragging.current === "pan") {
        panCamera(state.current, dx, dy, event.shiftKey);
      } else {
        const st2 = getSim()?.world.settings;
        const sens2 = st2?.sensitivity ?? 1;
        state.current.yaw -= dx * 0.006 * sens2;
        state.current.pitch = Math.max(0.24, Math.min(1.35, state.current.pitch + dy * 0.004 * sens2 * (st2?.invertY ? -1 : 1)));
      }
      last.current.x = event.clientX;
      last.current.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (mobileTapEvents.has(event)) return;
      if (event.button === 2) event.stopImmediatePropagation();
      pointers.current.delete(event.pointerId);
      if (pointers.current.size === 0) {
        dragging.current = null;
        last.current.distance = 0;
        useGame.getState().actions.updateCameraView({
          yaw: state.current.yaw,
          pitch: state.current.pitch,
          distance: state.current.distance,
          targetX: state.current.targetX,
          targetZ: state.current.targetZ,
        });
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (cameraMode === "first") return;
      state.current.distance = Math.max(10, Math.min(150, state.current.distance + event.deltaY * 0.05));
      useGame.getState().actions.updateCameraView({ distance: state.current.distance });
    };
    const context = (event: Event) => event.preventDefault();
    const keyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (KEYS.has(key) && cameraMode === "first") {
        event.preventDefault();
        keys.current.add(key);
      }
    };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const resetInput = () => {
      keys.current.clear();
      pointers.current.clear();
      dragging.current = null;
      last.current.distance = 0;
    };
    window.addEventListener("blur", resetInput);
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", context);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      resetInput();
      window.removeEventListener("blur", resetInput);
      unbindMobile();
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", context);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [gl, cameraMode]);

  useFrame(({ camera }, delta) => {
    const sim = getSim();
    if (!sim) return;
    const dt = Math.min(0.08, delta);
    if (cameraMode === "first") {
      const forward = new THREE.Vector3(-Math.sin(state.current.lookYaw), 0, -Math.cos(state.current.lookYaw));
      const right = new THREE.Vector3(Math.cos(state.current.lookYaw), 0, -Math.sin(state.current.lookYaw));
      const speed = (keys.current.has("shift") ? 10 : 5.2) * dt;
      let dx = (right.x * mobileAxis.current.x + forward.x * mobileAxis.current.y) * speed;
      let dz = (right.z * mobileAxis.current.x + forward.z * mobileAxis.current.y) * speed;
      if (keys.current.has("w") || keys.current.has("arrowup")) {
        dx += forward.x * speed;
        dz += forward.z * speed;
      }
      if (keys.current.has("s") || keys.current.has("arrowdown")) {
        dx -= forward.x * speed;
        dz -= forward.z * speed;
      }
      if (keys.current.has("d") || keys.current.has("arrowright")) {
        dx += right.x * speed;
        dz += right.z * speed;
      }
      if (keys.current.has("a") || keys.current.has("arrowleft")) {
        dx -= right.x * speed;
        dz -= right.z * speed;
      }
      const length = Math.hypot(dx, dz);
      if (length > 0) {
        const scale = Math.min(1, speed / length);
        movePlayer(sim, dx * scale, dz * scale);
      }
      const player = sim.world.player;
      player.heading = state.current.lookYaw;
      camera.position.set(player.x, 1.68, player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.set(state.current.lookPitch, state.current.lookYaw, 0);
      return;
    }
    const target = new THREE.Vector3(state.current.targetX, 1.4, state.current.targetZ);
    const pitch = state.current.pitch;
    let distance = state.current.distance;
    // keep the orbit camera from diving into buildings
    const buildings = sim.world.buildings;
    for (const b of buildings) {
      if (b.kind === "path" || b.kind === "tactile") continue;
      const fp = footprintOf(b);
      if (target.x > fp.minX && target.x < fp.maxX && target.z > fp.minZ && target.z < fp.maxZ) continue;
      const step = 1.4;
      for (let d = 8; d < distance; d += step) {
        const px = target.x + Math.sin(state.current.yaw) * Math.cos(pitch) * d;
        const pz = target.z + Math.cos(state.current.yaw) * Math.cos(pitch) * d;
        const py = 1.4 + Math.sin(pitch) * d;
        if (py < 3.6 && px > fp.minX - 0.3 && px < fp.maxX + 0.3 && pz > fp.minZ - 0.3 && pz < fp.maxZ + 0.3) {
          distance = Math.max(9, d - 1.5);
          break;
        }
      }
    }
    const px = target.x + Math.sin(state.current.yaw) * Math.cos(pitch) * distance;
    const pz = target.z + Math.cos(state.current.yaw) * Math.cos(pitch) * distance;
    const py = Math.max(2.6, 1.4 + Math.sin(pitch) * distance);
    camera.position.lerp(new THREE.Vector3(px, py, pz), photoMode || reduceMotion ? 1 : 1 - Math.pow(0.65, dt * 60));
    camera.lookAt(target);
    state.current.targetX = Math.max(WORLD.minX - 6, Math.min(WORLD.maxX + 6, state.current.targetX));
    state.current.targetZ = Math.max(WORLD.minZ - 14, Math.min(WORLD.maxZ + 4, state.current.targetZ));
  });

  return null;
}

function panCamera(view: { yaw: number; pitch: number; distance: number; targetX: number; targetZ: number }, dx: number, dy: number, fine: boolean) {
  const scale = (fine ? 0.03 : 0.055) * (view.distance / 55);
  const rightX = Math.cos(view.yaw);
  const rightZ = -Math.sin(view.yaw);
  const forwardX = -Math.sin(view.yaw);
  const forwardZ = -Math.cos(view.yaw);
  view.targetX -= (rightX * dx - forwardX * dy) * scale;
  view.targetZ -= (rightZ * dx - forwardZ * dy) * scale;
  view.targetX = Math.max(WORLD.minX - 8, Math.min(WORLD.maxX + 8, view.targetX));
  view.targetZ = Math.max(WORLD.minZ - 16, Math.min(WORLD.maxZ + 6, view.targetZ));
}

function GameLoop() {
  const tick = useGame((s) => s.actions.tick);
  useFrame((_, delta) => {
    tick(delta);
  });
  return null;
}

function SceneContents() {
  const snapshot = useGame((s) => s.snapshot);
  const quality = useGame((s) => s.snapshot ? getSim()?.world.settings.quality ?? "medium" : "medium");
  const paused = useGame((s) => s.paused);
  const cameraMode = useGame((s) => s.cameraMode);
  const overlay = useGame((s) => s.overlay);
  const agents = snapshot?.agents;
  const atGate = overlay === "occupancy" ? (agents ?? []).filter(
    (agent) => agent.role === "student" && Math.hypot(agent.x - GATE.x, agent.z - GATE.z) <= 3.5,
  ).length : 0;
  const agentIds = useMemo(() => agents?.map((agent) => agent.id) ?? [], [agents]);
  const minutes = snapshot?.minutes ?? 480;
  const weather = snapshot?.weather ?? "sun";
  const low = quality === "low";
  const sim = getSim();
  const event = sim ? currentEvent(sim) : null;
  const patio = sim?.world.buildings.find((b) => b.kind === "patio" && b.progress >= 1);
  const busVisible = snapshot ? (snapshot.minutes > 390 && snapshot.minutes < 480) || (snapshot.minutes > 880 && snapshot.minutes < 990) : false;
  const characterIds = low ? agentIds.slice(0, QUALITY.low.characters) : agentIds;

  return (
    <>
      <Lighting minutes={minutes} weather={weather} low={low} />
      <StaticStreet quality={quality} />
      <Campus quality={quality} />
      <Neighborhood quality={quality} />
      <Guarita />
      <Bikes />
      <Bus visible={busVisible} />
      <Cars minutes={minutes} paused={paused} />
      <Puddles weather={weather as "rain" | "sun" | "cloud"} quality={quality} />
      <Rain quality={quality} weather={weather as "rain" | "sun" | "cloud"} />
      <EventDecor patioCenter={event && patio ? { x: patio.x, z: patio.z } : null} schoolColor={sim?.world.schoolColors.accent ?? "#f0b95a"} />
      <NightWindows buildings={(snapshot?.buildings ?? []).map((b) => ({ x: b.x, z: b.z, rot: b.rot, kind: b.kind, progress: b.progress }))} night={lightPhase(minutes) === "night" && !(sim ? dir(sim.world).powerOut : false)} />
      {atGate > 0 && (
        <Billboard text={`Portão · ${atGate} alunos`} position={[GATE.x, 3.6, GATE.z]} scale={3.0} />
      )}
      <Buildings shadows={!low} />
      <Characters ids={characterIds} shadows={!low} />
      <StudentConversations ids={characterIds} />
      <DirectorScene />
      <PlanBlueprints />
      <HighlightMarker />
      <XRay />
      <Residents count={low ? 2 : quality === "medium" ? 5 : 8} />
      <ZoneAudio />
      <OverlaySlabs />
      <BuildGrid />
      <GhostPreview />
      <InteractionPlane />
      <CameraRig />
      <GameLoop />
      {cameraMode === "first" && (
        <mesh position={[sim?.world.player.x ?? 0, 0.03, sim?.world.player.z ?? 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.34, 20]} />
          <meshBasicMaterial color="#e2d5ff" transparent opacity={0.7} />
        </mesh>
      )}
    </>
  );
}

export default function SchoolWorld() {
  const quality = useGame((s) => (s.snapshot ? (getSim()?.world.settings.quality ?? "medium") : "medium"));
  const firstPerson = useGame((s) => s.cameraMode === "first");
  const failWebgl = useGame((s) => s.actions.failWebgl);
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, quality === "high" ? 1.5 : quality === "medium" ? 1.25 : 1, firstPerson ? 1.25 : 2);
  const shadows = quality !== "low";
  return (
    <Canvas
      shadows={shadows ? "percentage" : false}
      dpr={[1, dpr]}
      camera={{ position: [30, 30, 42], fov: 42, near: 0.4, far: 320 }}
      gl={{ antialias: quality !== "low", preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      frameloop="always"
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        const canvas = gl.domElement;
        canvas.addEventListener("webglcontextlost", (event) => {
          if (!canvas.isConnected) return;
          event.preventDefault();
          failWebgl();
        });
      }}
    >
      <SceneContents />
    </Canvas>
  );
}
