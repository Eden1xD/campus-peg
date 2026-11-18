"use client";

import { directorRealtime } from "./director";
import { predictNoise } from "./noise";
import { entryPoint } from "./layout";
import { findPath } from "./nav";
import { GATE } from "./config";
function walkInfo(sim: NonNullable<ReturnType<typeof getSim>>, kind: BuildingKind, x: number, z: number) {
  const e = entryPoint({ kind, x, z, rot: useGame.getState().buildRot });
  const r = findPath(sim.grid, { x: GATE.x, z: GATE.z + 1.5 }, e, { maxExpanded: 12000 });
  if (!r.reachable) return "";
  let len = 0;
  for (let i = 1; i < r.points.length; i++) len += Math.hypot(r.points[i].x - r.points[i - 1].x, r.points[i].z - r.points[i - 1].z);
  return len > 60 ? `Longe do portão: ${Math.round(len)} m (~${Math.round(len / 1.9)} min a pé) — considere corredor coberto` : "";
}
import { create } from "zustand";
import {
  applyAdReward,
  applyOfflineProgress,
  claimMission,
  createWorld,
  buyImprovement,
  demolishBuilding,
  exportWorld,
  fireStaff,
  getSim,
  getSnapshot,
  hireStaff,
  initSim,
  moveBuilding,
  movePlayer,
  optimizeSchedule,
  placeBuilding,
  rebuildWorldModel,
  setBuildingAccessible,
  setMode,
  setStudents,
  setWeather,
  startEvent,
  tickSim,
  validatePlacement,
  validateSave,
  type PlacementResult,
  snapPlacement,
} from "./sim";
import {
  clearLocalSave,
  downloadSave,
  fetchServerSave,
  getPlayerKey,
  pushServerSave,
  readImportedFile,
  readLocalSave,
  writeLocalSave,
} from "./persistence";
import { AD_MIN_WATCH_SECONDS, claimAdSession, requestAdSession, type AdReward } from "./ads";
import { audio } from "./audio";
import { formatMoney } from "./config";
import type {
  BuildingKind,
  CameraFavorite,
  GameMode,
  GameWorld,
  QualityTier,
  Settings,
  Snapshot,
  Vec2,
  Weather,
} from "./types";

export type Panel = "none" | "build" | "missions" | "staff" | "schedule" | "finance" | "stock" | "improvements" | "settings" | "events" | "agents" | "report" | "camera";
export type Overlay = "none" | "occupancy" | "cleanliness" | "accessibility" | "queue" | "condition" | "seats";
export type AdStage = "offer" | "loading" | "playing" | "finished" | "error" | "claimed";

export interface GhostState {
  kind: BuildingKind;
  x: number;
  z: number;
  rot: number;
  valid: boolean;
  message: string;
  reason?: string;
  zones?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  snap?: string | null;
}

export interface CameraView {
  targetX: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  distance: number;
  mode: "orbit" | "first";
}

interface Toast {
  id: string;
  tone: "info" | "good" | "warn" | "bad";
  title: string;
  body: string;
}

interface GameState {
  ready: boolean;
  booting: boolean;
  bootError: string | null;
  webglFailed: boolean;
  playerKey: string;
  settings: Settings;
  snapshot: Snapshot | null;
  simTick: number;
  speed: number;
  paused: boolean;
  panel: Panel;
  overlay: Overlay;
  buildKind: BuildingKind | null;
  buildRot: number;
  ghost: GhostState | null;
  moveId: string | null;
  selectedBuildingId: string | null;
  selectedAgentId: string | null;
  toast: Toast | null;
  photoMode: boolean;
  cameraMode: "orbit" | "first";
  showRoofs: boolean;
  showGrid: boolean;
  minimapOpen: boolean;
  objectivesOpen: boolean;
  saveState: "idle" | "saving" | "saved" | "local" | "error";
  saveBytes: number;
  lastToastId: string | null;
  cameraView: CameraView;
  cameraPreset: { view: CameraView; nonce: number } | null;
  ad: {
    open: boolean;
    stage: AdStage;
    reward: AdReward;
    sessionId: string | null;
    secondsLeft: number;
    message: string | null;
    claimedThisSession: boolean;
    validation: string | null;
  };
  actions: {
    boot: () => Promise<void>;
    newGame: (mode: GameMode) => Promise<void>;
    resetGame: () => Promise<void>;
    tick: (dt: number) => void;
    refresh: () => void;
    setPanel: (panel: Panel) => void;
    setOverlay: (overlay: Overlay) => void;
    setSpeed: (speed: number) => void;
    togglePause: () => void;
    beginBuild: (kind: BuildingKind) => void;
    cancelBuild: () => void;
    rotateBuild: () => void;
    setGhost: (x: number, z: number) => void;
    setGhostRaw: (g: { x: number; z: number; rot: number }) => void;
    confirmBuild: () => PlacementResult;
    beginMove: (id: string) => void;
    selectBuilding: (id: string | null) => void;
    selectAgent: (id: string | null) => void;
    demolish: (id: string) => PlacementResult;
    buyImprovement: (id: string, buildingId?: string) => PlacementResult;
    makeAccessible: (id: string) => PlacementResult;
    hire: (role: string) => PlacementResult;
    fire: (id: string) => PlacementResult;
    claimMissionReward: (id: string) => PlacementResult;
    runEvent: (id: string) => PlacementResult;
    setEnrolled: (count: number) => PlacementResult;
    autoSchedule: () => PlacementResult;
    changeMode: (mode: GameMode) => PlacementResult;
    setWeatherNow: (weather: Weather) => void;
    updateSettings: (patch: Partial<GameWorld["settings"]>) => void;
    setQuality: (quality: QualityTier) => void;
    toggleTheme: () => void;
    toggleRoofs: () => void;
    toggleGrid: () => void;
    toggleMinimap: () => void;
    toggleObjectives: () => void;
    setCameraMode: (mode: "orbit" | "first") => void;
    setPhotoMode: (open: boolean) => void;
    updateCameraView: (view: Partial<CameraView>) => void;
    saveCameraFavorite: () => void;
    applyCameraFavorite: (id: string) => void;
    focusOn: (x: number, z: number, distance?: number) => void;
    walkPlayer: (dx: number, dz: number) => void;
    saveNow: (server?: boolean) => Promise<void>;
    exportGame: () => void;
    importGame: (file: File) => Promise<PlacementResult>;
    notify: (tone: Toast["tone"], title: string, body: string) => void;
    dismissToast: () => void;
    openAd: (reward: AdReward) => void;
    startAd: () => Promise<void>;
    finishAd: () => void;
    claimAd: () => Promise<void>;
    closeAd: () => void;
    failWebgl: () => void;
    setSchoolIdentity: (patch: Partial<Pick<GameWorld, "schoolName" | "schoolColors">>) => void;
  };
}

/** posições anteriores da prévia (desfazer antes de confirmar) */
export const ghostHistory: { x: number; z: number; rot: number }[] = [];
let lastSnapshotAt = 0;
let lastLocalSave = 0;
let lastServerSave = 0;

function toastOf(world: GameWorld): Toast | null {
  const first = world.notifications[0];
  if (!first) return null;
  return { id: first.id, tone: first.tone, title: first.title, body: first.body };
}

export const useGame = create<GameState>((set, get) => ({
  ready: false,
  booting: true,
  bootError: null,
  webglFailed: false,
  playerKey: "",
  settings: {
    theme: "dark",
    quality: "medium",
    uiScale: 1,
    reduceMotion: false,
    showNames: true,
    music: 0.35,
    ambience: 0.5,
    effects: 0.7,
    shadows: true,
  },
  snapshot: null,
  simTick: 0,
  speed: 1,
  paused: false,
  panel: "none",
  overlay: "none",
  buildKind: null,
  buildRot: 0,
  ghost: null,
  moveId: null,
  selectedBuildingId: null,
  selectedAgentId: null,
  toast: null,
  photoMode: false,
  cameraMode: "orbit",
  showRoofs: false,
  showGrid: false,
  minimapOpen: true,
  objectivesOpen: true,
  saveState: "idle",
  saveBytes: 0,
  lastToastId: null,
  cameraView: { targetX: 0, targetZ: -1, yaw: Math.PI * 0.25, pitch: 0.72, distance: 62, mode: "orbit" },
  cameraPreset: null,
  ad: {
    open: false,
    stage: "offer",
    reward: "boost_works",
    sessionId: null,
    secondsLeft: AD_MIN_WATCH_SECONDS,
    message: null,
    claimedThisSession: false,
    validation: null,
  },
  actions: {
    boot: async () => {
      if (get().ready) return;
      set({ booting: true, bootError: null });
      const playerKey = getPlayerKey();
      set({ playerKey });
      let world: GameWorld | null = null;
      let restoredFrom: string | null = null;
      const local = readLocalSave();
      if (local && validateSave(local.world)) {
        world = validateSave(local.world);
        restoredFrom = "local";
      }
      if (!world) {
        const remote = await fetchServerSave(playerKey);
        if (remote && validateSave(remote.world)) {
          world = validateSave(remote.world);
          restoredFrom = "servidor";
        }
      }
      if (world) {
        const elapsed = Date.now() - (world.savedAt || Date.now());
        const offline = applyOfflineProgress(world, elapsed);
        initSim(world);
        audio.setVolumes({ music: world.settings.music, ambience: world.settings.ambience, effects: world.settings.effects });
        if (offline.minutes > 0) {
          world.notifications.unshift({
            id: `offline-${Date.now()}`,
            at: world.day * 1440 + world.minutes,
            tone: "info",
            title: "Você esteve fora",
            body: `As obras avançaram ${offline.minutes} min equivalentes${offline.completed > 0 ? ` e ${offline.completed} instalação(ões) foram concluídas` : ""}. A rotina e a economia não rodam offline.`,
          });
        }
      } else {
        world = createWorld("career");
        initSim(world);
      }
      const snapshot = getSnapshot();
      set({
        ready: true,
        booting: false,
        playerKey,
        snapshot,
        settings: world.settings,
        speed: 1,
        paused: false,
        showRoofs: false,
        cameraMode: "orbit",
        toast: restoredFrom
          ? { id: `restore-${Date.now()}`, tone: "good", title: `Progresso restaurado (${restoredFrom})`, body: `Dia ${world.day} · ${formatMoney(world.budget)} · ${world.enrolled} alunos.` }
          : { id: `new-${Date.now()}`, tone: "info", title: "Bem-vindo ao PEG — Minha Escola", body: "Use WASD/setas no modo diretor (1ª pessoa) e clique nos alunos para ver o que estão fazendo." },
        lastToastId: null,
      });
    },
    newGame: async (mode) => {
      const world = createWorld(mode);
      initSim(world);
      clearLocalSave();
      set({
        ready: true,
        booting: false,
        snapshot: getSnapshot(),
        settings: world.settings,
        panel: "none",
        buildKind: null,
        selectedBuildingId: null,
        selectedAgentId: null,
        toast: { id: `new-${Date.now()}`, tone: "info", title: "Nova escola criada", body: `Modo ${mode}. ${formatMoney(world.budget)} de verba inicial.` },
      });
      await get().actions.saveNow(true);
    },
    resetGame: async () => {
      clearLocalSave();
      await get().actions.newGame("career");
    },
    tick: (dt) => {
      const state = get();
      if (!state.ready || state.paused || state.photoMode) return;
      if (!getSim()) return;
      tickSim(dt * state.speed);
      directorRealtime(dt);
      const now = performance.now();
      if (now - lastSnapshotAt > 260) {
        lastSnapshotAt = now;
        const snapshot = getSnapshot();
        const world = getSim()?.world;
        const toast = world ? toastOf(world) : null;
        const newToast = toast && toast.id !== state.lastToastId ? toast : state.toast;
        set({
          snapshot,
          simTick: state.simTick + 1,
          toast: newToast,
          lastToastId: toast?.id ?? state.lastToastId,
        });
        if (world) {
          const activeWorks = world.buildings.some((b) => b.progress < 1);
          audio.setConstruction(activeWorks);
          audio.setRain(world.weather === "rain");
        }
        if (now - lastLocalSave > 18000) {
          lastLocalSave = now;
          const liveWorld = getSim()?.world;
          if (liveWorld) {
            const result = writeLocalSave(exportWorld(getSim()!));
            set({ saveState: result.ok ? "local" : "error", saveBytes: result.bytes });
          }
        }
        if (now - lastServerSave > 95000) {
          lastServerSave = now;
          void get().actions.saveNow(true);
        }
      }
    },
    refresh: () => {
      if (!getSim()) return;
      set({ snapshot: getSnapshot(), simTick: get().simTick + 1 });
    },
    setPanel: (panel) => {
      audio.click();
      set({ panel, selectedAgentId: panel === "agents" ? get().selectedAgentId : get().selectedAgentId });
    },
    setOverlay: (overlay) => {
      audio.click();
      set({ overlay });
    },
    setSpeed: (speed) => set({ speed, paused: false }),
    togglePause: () => set({ paused: !get().paused }),
    beginBuild: (kind) => {
      audio.click();
      set({ buildKind: kind, buildRot: 0, panel: "build", moveId: null, ghost: null, showGrid: true });
    },
    cancelBuild: () => { ghostHistory.length = 0; set({ buildKind: null, ghost: null, moveId: null, showGrid: false }); },
    rotateBuild: () => {
      const g = get().ghost;
      set({ buildRot: (get().buildRot + 1) % 4 });
      if (g) get().actions.setGhost(g.x, g.z); // revalida com a mesma regra da confirmação
    },
    setGhostRaw: (g) => {
      set({ buildRot: g.rot });
      ghostHistory.push({ x: NaN, z: NaN, rot: g.rot });
      get().actions.setGhost(g.x, g.z);
      ghostHistory.pop(); ghostHistory.pop();
    },
    setGhost: (x, z) => {
      const state = get();
      if (!state.buildKind || !getSim()) return;
      if (state.ghost) { ghostHistory.push({ x: state.ghost.x, z: state.ghost.z, rot: state.ghost.rot }); if (ghostHistory.length > 20) ghostHistory.shift(); }
      const sim = getSim()!;
      const snapped = snapPlacement(sim, state.buildKind, x, z, state.buildRot, state.moveId ?? undefined);
      const validation = validatePlacement(sim, state.buildKind, snapped.x, snapped.z, state.buildRot, state.moveId ?? undefined);
      set({
        ghost: {
          kind: state.buildKind,
          x: snapped.x,
          z: snapped.z,
          rot: state.buildRot,
          valid: validation.ok,
          message: validation.message,
          reason: validation.reason ?? ([snapped.snap ? `Encaixado em ${snapped.snap}` : "", predictNoise(sim.world, state.buildKind, snapped.x, snapped.z) ?? "", walkInfo(sim, state.buildKind, snapped.x, snapped.z)].filter(Boolean).join(" · ") || undefined),
          zones: validation.zones,
          snap: snapped.snap,
        },
      });
    },
    confirmBuild: () => {
      const state = get();
      const sim = getSim();
      if (!state.buildKind || !state.ghost || !sim) return { ok: false, message: "Escolha um local no terreno" };
      audio.thud();
      const result = state.moveId
        ? moveBuilding(sim, state.moveId, state.ghost.x, state.ghost.z, state.ghost.rot)
        : placeBuilding(sim, state.buildKind, state.ghost.x, state.ghost.z, state.ghost.rot);
      if (result.ok) {
        set({ snapshot: getSnapshot(), buildKind: null, ghost: null, moveId: null, showGrid: false, panel: "build", toast: { id: `b-${Date.now()}`, tone: "good", title: result.message, body: "A obra entrou no cronograma e os funcionários já estão a caminho." } });
      } else {
        set({ toast: { id: `b-${Date.now()}`, tone: "warn", title: result.message, body: result.reason ?? "Ajuste a posição e tente novamente." } });
      }
      return result;
    },
    beginMove: (id) => {
      const sim = getSim();
      if (!sim) return;
      const building = sim.world.buildings.find((b) => b.id === id);
      if (!building) return;
      set({
        moveId: id,
        buildKind: building.kind,
        buildRot: building.rot,
        panel: "build",
        selectedBuildingId: null,
        ghost: {
          kind: building.kind,
          x: building.x,
          z: building.z,
          rot: building.rot,
          valid: false,
          message: "Posicione e confirme a mudança",
        },
      });
    },
    selectBuilding: (id) => set({ selectedBuildingId: id, selectedAgentId: null, panel: id ? "none" : get().panel }),
    selectAgent: (id) => set({ selectedAgentId: id, selectedBuildingId: null }),
    demolish: (id) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      audio.thud();
      const result = demolishBuilding(sim, id);
      set({ snapshot: getSnapshot(), selectedBuildingId: null, toast: { id: `d-${Date.now()}`, tone: result.ok ? "warn" : "bad", title: result.message, body: "Personagens afetados recalcularam suas rotas." } });
      return result;
    },
    buyImprovement: (id, buildingId) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = buyImprovement(sim, id, buildingId);
      set({ snapshot: getSnapshot(), toast: { id: `i-${Date.now()}`, tone: result.ok ? "good" : "warn", title: result.message, body: result.reason ?? "O efeito já aparece no cenário." } });
      return result;
    },
    makeAccessible: (id) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = setBuildingAccessible(sim, id);
      set({ snapshot: getSnapshot(), toast: { id: `a-${Date.now()}`, tone: result.ok ? "good" : "warn", title: result.message, body: result.reason ?? "Rampa e piso tátil adicionados à entrada." } });
      return result;
    },
    hire: (role) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = hireStaff(sim, role as never);
      set({ snapshot: getSnapshot(), toast: { id: `h-${Date.now()}`, tone: result.ok ? "good" : "warn", title: result.message, body: result.reason ?? "O profissional já aparece no mundo executando tarefas." } });
      return result;
    },
    fire: (id) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = fireStaff(sim, id);
      set({ snapshot: getSnapshot() });
      return result;
    },
    claimMissionReward: (id) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = claimMission(sim, id);
      set({ snapshot: getSnapshot(), toast: { id: `m-${Date.now()}`, tone: result.ok ? "good" : "warn", title: result.ok ? "Recompensa resgatada" : result.message, body: result.reason ?? result.message } });
      if (result.ok) audio.bell();
      return result;
    },
    runEvent: (id) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = startEvent(sim, id);
      set({ snapshot: getSnapshot(), toast: { id: `e-${Date.now()}`, tone: result.ok ? "info" : "warn", title: result.message, body: result.reason ?? "Barracas, público e decoração aparecem no cenário." } });
      if (result.ok) audio.bell();
      return result;
    },
    setEnrolled: (count) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = setStudents(sim, count);
      set({ snapshot: getSnapshot(), toast: { id: `s-${Date.now()}`, tone: result.ok ? "good" : "warn", title: result.message, body: result.reason ?? "Assentos calculados pelas carteiras reais." } });
      return result;
    },
    autoSchedule: () => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = optimizeSchedule(sim);
      set({ snapshot: getSnapshot(), toast: { id: `o-${Date.now()}`, tone: result.ok ? "good" : "warn", title: result.message, body: result.reason ?? "Conflitos de sala e professor verificados." } });
      return result;
    },
    changeMode: (mode) => {
      const sim = getSim();
      if (!sim) return { ok: false, message: "Jogo não iniciado" };
      const result = setMode(sim, mode);
      set({ snapshot: getSnapshot() });
      return result;
    },
    setWeatherNow: (weather) => {
      const sim = getSim();
      if (!sim) return;
      setWeather(sim, weather);
      audio.setRain(weather === "rain");
      set({ snapshot: getSnapshot() });
    },
    updateSettings: (patch) => {
      const sim = getSim();
      const settings = { ...(sim?.world.settings ?? { theme: "dark", quality: "medium" as QualityTier }), ...patch };
      if (sim) {
        sim.world.settings = { ...sim.world.settings, ...patch };
        audio.setVolumes({ music: sim.world.settings.music, ambience: sim.world.settings.ambience, effects: sim.world.settings.effects });
      }
      if (patch.quality && sim) {
        sim.world.settings.quality = patch.quality;
      }
      set({ settings: getSim() ? getSim()!.world.settings : get().settings, snapshot: getSim() ? getSnapshot() : get().snapshot, simTick: get().simTick + 1 });
      void settings;
    },
    setQuality: (quality) => {
      const sim = getSim();
      if (sim) sim.world.settings.quality = quality;
      set({ settings: getSim() ? getSim()!.world.settings : get().settings, snapshot: getSim() ? getSnapshot() : get().snapshot, simTick: get().simTick + 1 });
    },
    toggleTheme: () => {
      const sim = getSim();
      if (sim) sim.world.settings.theme = sim.world.settings.theme === "dark" ? "light" : "dark";
      set({ settings: sim ? sim.world.settings : get().settings, simTick: get().simTick + 1 });
    },
    toggleRoofs: () => set({ showRoofs: !get().showRoofs }),
    toggleGrid: () => set({ showGrid: !get().showGrid }),
    toggleMinimap: () => set({ minimapOpen: !get().minimapOpen }),
    toggleObjectives: () => set({ objectivesOpen: !get().objectivesOpen }),
    setCameraMode: (mode) => {
      const sim = getSim();
      if (sim) {
        if (mode === "first") {
          sim.world.player.x = 0;
          sim.world.player.z = -14;
        }
      }
      set({ cameraMode: mode, cameraView: { ...get().cameraView, mode } });
    },
    setPhotoMode: (open) => set({ photoMode: open, paused: open ? true : false }),
    updateCameraView: (view) => set({ cameraView: { ...get().cameraView, ...view } }),
    saveCameraFavorite: () => {
      const sim = getSim();
      if (!sim) return;
      const view = get().cameraView;
      const favorite: CameraFavorite = {
        id: `cam-${Date.now().toString(36)}`,
        name: `Vista ${sim.world.cameraFavorites.length + 1}`,
        target: { x: view.targetX, z: view.targetZ },
        yaw: view.yaw,
        pitch: view.pitch,
        distance: view.distance,
      };
      sim.world.cameraFavorites.push(favorite);
      set({ snapshot: getSnapshot(), toast: { id: `c-${Date.now()}`, tone: "good", title: "Câmera favorita salva", body: "Disponível no painel Câmera." } });
    },
    applyCameraFavorite: (id) => {
      const sim = getSim();
      const favorite = sim?.world.cameraFavorites.find((f) => f.id === id);
      if (!favorite) return;
      set({
        cameraMode: "orbit",
        cameraView: {
          targetX: favorite.target.x,
          targetZ: favorite.target.z,
          yaw: favorite.yaw,
          pitch: favorite.pitch,
          distance: favorite.distance,
          mode: "orbit",
        },
        cameraPreset: {
          view: { targetX: favorite.target.x, targetZ: favorite.target.z, yaw: favorite.yaw, pitch: favorite.pitch, distance: favorite.distance, mode: "orbit" },
          nonce: Date.now(),
        },
      });
    },
    focusOn: (x, z, distance) => {
      const view = get().cameraView;
      set({
        cameraMode: "orbit",
        cameraView: { ...view, targetX: x, targetZ: z, distance: distance ?? Math.min(view.distance, 34) },
        cameraPreset: { view: { ...view, targetX: x, targetZ: z, distance: distance ?? Math.min(view.distance, 34), mode: "orbit" }, nonce: Date.now() },
      });
    },
    walkPlayer: (dx, dz) => {
      const sim = getSim();
      if (!sim) return;
      movePlayer(sim, dx, dz);
    },
    saveNow: async (server = true) => {
      const sim = getSim();
      if (!sim) return;
      set({ saveState: "saving" });
      const world = exportWorld(sim);
      const local = writeLocalSave(world);
      let synced = false;
      if (server) synced = await pushServerSave(get().playerKey, world);
      set({
        saveState: local.ok ? (synced ? "saved" : "local") : "error",
        saveBytes: local.bytes,
        snapshot: get().snapshot,
        toast: {
          id: `save-${Date.now()}`,
          tone: local.ok ? "good" : "warn",
          title: local.ok ? "Jogo salvo" : "Falha ao salvar",
          body: local.ok
            ? `Backup local (${Math.round(local.bytes / 1024)} KB)${synced ? " e sincronizado no servidor" : " · servidor indisponível, backup local mantido"}.`
            : "Armazenamento cheio ou bloqueado. Exporte o jogo para não perder progresso.",
        },
      });
    },
    exportGame: () => {
      const sim = getSim();
      if (!sim) return;
      downloadSave(exportWorld(sim));
    },
    importGame: async (file) => {
      const parsed = await readImportedFile(file);
      if (!parsed) return { ok: false, message: "Arquivo inválido", reason: "Envie um JSON exportado pelo PEG — Minha Escola." };
      const world = validateSave(parsed.world);
      if (!world) return { ok: false, message: "Save corrompido", reason: "O arquivo não contém um mundo válido." };
      initSim(world);
      set({
        ready: true,
        settings: world.settings,
        snapshot: getSnapshot(),
        toast: { id: `imp-${Date.now()}`, tone: "good", title: "Jogo importado", body: `Dia ${world.day} · ${formatMoney(world.budget)} · ${world.enrolled} alunos.` },
      });
      await get().actions.saveNow(true);
      return { ok: true, message: "Jogo importado" };
    },
    notify: (tone, title, body) => set({ toast: { id: `manual-${Date.now()}`, tone, title, body } }),
    dismissToast: () => set({ toast: null }),
    openAd: (reward) => {
      audio.click();
      set({
        ad: { open: true, stage: "offer", reward, sessionId: null, secondsLeft: AD_MIN_WATCH_SECONDS, message: null, claimedThisSession: get().ad.claimedThisSession, validation: null },
      });
    },
    startAd: async () => {
      const state = get();
      set({ ad: { ...state.ad, stage: "loading", message: null } });
      const session = await requestAdSession(state.playerKey, state.ad.reward);
      if (!session.ok || !session.sessionId) {
        set({
          ad: {
            ...get().ad,
            stage: "error",
            message:
              session.error === "limite_de_frequencia"
                ? "Limite de frequência atingido: 1 concessão a cada 15 minutos."
                : "Não foi possível iniciar a publicidade agora. O jogo continua normalmente.",
          },
        });
        return;
      }
      set({
        ad: {
          ...get().ad,
          stage: "playing",
          sessionId: session.sessionId,
          secondsLeft: AD_MIN_WATCH_SECONDS,
          validation: session.validation ?? "local",
          message: null,
        },
      });
    },
    finishAd: () => {
      const state = get();
      if (state.ad.stage !== "playing") return;
      set({ ad: { ...state.ad, stage: "finished", secondsLeft: 0 } });
    },
    claimAd: async () => {
      const state = get();
      const sim = getSim();
      if (!sim || !state.ad.sessionId) return;
      if (state.ad.claimedThisSession) {
        set({ toast: { id: `ad-${Date.now()}`, tone: "warn", title: "Recompensa já concedida", body: "Apenas uma concessão por sessão." } });
        return;
      }
      const claim = await claimAdSession(state.playerKey, state.ad.sessionId);
      if (!claim.ok) {
        set({ ad: { ...state.ad, stage: "error", message: "Sessão expirada ou já utilizada. Nenhuma recompensa foi aplicada." } });
        return;
      }
      const result = applyAdReward(sim, state.ad.reward, get().selectedBuildingId);
      if (!result.ok) {
        set({
          ad: { ...state.ad, stage: "error", message: `${result.message}. ${result.reason ?? ""} Nenhuma recompensa consumida.` },
        });
        return;
      }
      sim.world.ads.lastClaimAt = Date.now();
      sim.world.ads.claims += 1;
      set({
        snapshot: getSnapshot(),
        ad: { ...state.ad, stage: "claimed", claimedThisSession: true, message: result.message },
      });
    },
    closeAd: () => {
      const state = get();
      set({ ad: { ...state.ad, open: false, stage: "offer", sessionId: null, secondsLeft: AD_MIN_WATCH_SECONDS } });
      if (state.ad.stage === "playing") {
        set({ toast: { id: `adclose-${Date.now()}`, tone: "info", title: "Publicidade fechada", body: "Sem recompensa: o vídeo não foi concluído. Você pode continuar jogando." } });
      }
    },
    failWebgl: () => set({ webglFailed: true }),
    setSchoolIdentity: (patch) => {
      const sim = getSim();
      if (!sim) return;
      if (patch.schoolName) sim.world.schoolName = patch.schoolName.slice(0, 48);
      if (patch.schoolColors) sim.world.schoolColors = { ...sim.world.schoolColors, ...patch.schoolColors };
      rebuildWorldModel(sim);
      set({ snapshot: getSnapshot(), toast: { id: `id-${Date.now()}`, tone: "good", title: "Identidade atualizada", body: "As alterações aparecem nas fachadas, uniformes e placas." } });
    },
  },
}));

export function selectedBuilding(): { id: string; kind: BuildingKind } | null {
  const state = useGame.getState();
  if (!state.selectedBuildingId) return null;
  const building = state.snapshot?.buildings.find((b) => b.id === state.selectedBuildingId);
  return building ? { id: building.id, kind: building.kind } : null;
}

export function currentPlayerPosition(): Vec2 {
  const sim = getSim();
  return sim ? { x: sim.world.player.x, z: sim.world.player.z } : { x: 0, z: 0 };
}

export type { QualityTier };
