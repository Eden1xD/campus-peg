"use client";

import { MobileLandscape } from "./MobileLandscape";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useGame } from "../store";
import { audio } from "../audio";
import { getTextureSet, textureKeys } from "../textures";
import { setMaterialQuality } from "../materials";
import { QUALITY } from "../config";
import { readLocalSave } from "../persistence";
import { AdModal, BuildBar, FirstPersonBar, Hud, LoadingOverlay, PhotoBar, ToastView } from "./hud";
import { Panels } from "./panels";
import styles from "./game.module.css";
import { DayEndReport } from "./DayEndReport";
import { HelpCenter, MomentBanner, PerfMeter, PhotoFrame, StartScreen, TipBubble, TutorialCard, ViewBar, WhatsNew } from "./PlayerUI";
import { DirectorHud } from "./DirectorUI";
const SchoolWorld = dynamic(() => import("../scene/World"), {
  ssr: false,
  loading: () => <div className={styles.loading}><div className={styles.loadingInner}>Carregando cena…</div></div>,
});

class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  constructor(props: { children: ReactNode; onFail: () => void }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Falha ao montar a cena do PEG", error);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function GameShell() {
  return <MobileLandscape><CampusGameContent /></MobileLandscape>;
}

function CampusGameContent() {
  const ready = useGame((s) => s.ready);
  const webglFailed = useGame((s) => s.webglFailed);
  const settings = useGame((s) => s.settings);
  const phase = useGame((s) => s.snapshot?.phase);
  const day = useGame((s) => s.snapshot?.day);
  const photoMode = useGame((s) => s.photoMode);
  const actions = useGame((s) => s.actions);
  const cameraMode = useGame((s) => s.cameraMode);
  const adOpen = useGame((s) => s.ad.open);
  const [menuAbertoEm, setMenuAbertoEm] = useState<typeof cameraMode | null>(null);
  const menuAberto = menuAbertoEm === cameraMode;
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Verificando WebGL e carregando a escola…");
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function iniciarEscola() {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!context) {
          setFatal("O navegador não conseguiu abrir a cena 3D. Confira a aceleração gráfica.");
          return;
        }
        context.getExtension("WEBGL_lose_context")?.loseContext();
        const saved = readLocalSave()?.world?.settings?.quality;
        const quality = saved && Object.prototype.hasOwnProperty.call(QUALITY, saved) ? saved : "medium";
        setMaterialQuality(quality);
        const keys = textureKeys();
        for (const [index, key] of keys.entries()) {
          if (cancelled) return;
          getTextureSet(key, quality);
          setLabel(`Preparando materiais · ${index + 1}/${keys.length}`);
          setProgress(10 + Math.round(72 * (index + 1) / keys.length));
          // Devolve o controle ao navegador entre materiais.
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
        if (cancelled) return;
        setLabel("Restaurando sua escola…");
        setProgress(92);
        await actions.boot();
        if (!cancelled) setProgress(100);
      } catch (error) {
        if (cancelled) return;
        console.error("Falha ao iniciar o PEG", error);
        setFatal("Não foi possível preparar os materiais ou restaurar a escola.");
      }
    }
    const timer = window.setTimeout(() => void iniciarEscola(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [actions]);

  useEffect(() => {
    if (!ready) return;
    setMaterialQuality(settings.quality);
  }, [ready, settings.quality]);

  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setVolumes({ music: settings.music, ambience: settings.ambience, effects: settings.effects });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [settings.music, settings.ambience, settings.effects]);

  const lastPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!phase) return;
    if (lastPhase.current && lastPhase.current !== phase && phase !== "empty") {
      audio.bell();
    }
    lastPhase.current = phase;
  }, [phase, day]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
      const state = useGame.getState();
      if (!state.ready || state.webglFailed || state.ad.open) return;
      const key = event.key.toLowerCase();
      if ((key === " " || key === "enter") && target?.closest("button, a, summary, [role=button]")) return;
      if (key === "escape") {
        if (state.buildKind) state.actions.cancelBuild();
        else if (state.photoMode) state.actions.setPhotoMode(false);
        else {
          state.actions.setPanel("none");
          state.actions.selectBuilding(null);
          state.actions.selectAgent(null);
          setMenuAbertoEm(null);
        }
        return;
      }
      if (state.photoMode && key !== "p") return;
      if (key === "enter" && state.buildKind && state.ghost?.valid) {
        event.preventDefault();
        state.actions.confirmBuild();
        return;
      }
      const panel = key === "b" ? "build" : key === "m" ? "missions" : key === "c" ? "camera" : null;
      if (panel) {
        const alreadyOpen = menuAbertoEm === state.cameraMode && state.panel === panel;
        state.actions.setPanel(alreadyOpen ? "none" : panel);
        setMenuAbertoEm(state.cameraMode);
      }
      if (key === "f") state.actions.setCameraMode(state.cameraMode === "orbit" ? "first" : "orbit");
      if (key === "p") state.actions.setPhotoMode(!state.photoMode);
      if (key === "r" && state.buildKind) state.actions.rotateBuild();
      if (key === " " && !state.photoMode) {
        event.preventDefault();
        state.actions.togglePause();
      }
      if (["1", "2", "3"].includes(key)) state.actions.setSpeed([1, 2, 4][Number(key) - 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menuAbertoEm]);

  const playable = ready && !fatal && !webglFailed;
  return (
    <div
      className={styles.shell}
      data-theme={settings.theme}
      style={{ ["--uiScale" as string]: settings.uiScale, filter: settings.reduceMotion ? "saturate(0.98)" : undefined }}
    >
      {playable ? (
        <div className={styles.canvasWrap}>
          <SceneBoundary onFail={actions.failWebgl} key={`scene-${settings.quality}`}>
            <SchoolWorld key={`world-${settings.quality}`} />
          </SceneBoundary>
        </div>
      ) : null}
      <div className={styles.purpleGlow} />
      {playable && !photoMode && (
        <>
          {menuAberto ? (
            <>
              <Hud />
              <Panels />
            </>
          ) : (
            <>
              <BuildBar />
              <FirstPersonBar />
              <ToastView />
              <AdModal />
              <DirectorHud />
            </>
          )}
          <ViewBar />
          <TipBubble />
          <TutorialCard />
          <MomentBanner />
          <HelpCenter />
          <WhatsNew />
          {!adOpen && (
            <button
              type="button"
              data-tut="menu"
              className={styles.btn}
              aria-expanded={menuAberto}
              onClick={() => setMenuAbertoEm(menuAberto ? null : cameraMode)}
              style={{ position: "absolute", right: 12, top: 12, zIndex: 15 }}
            >
              {menuAberto ? "Fechar menu" : "Menu da escola"}
            </button>
          )}
        </>
      )}
      {photoMode && playable && <PhotoBar />}
      {photoMode && playable && <PhotoFrame />}
      {playable && <PerfMeter />}
      {playable && <StartScreen />}
      {fatal || webglFailed ? (
        <div className={styles.loading} role="alert">
          <div className={styles.loadingInner}>
            <strong>Falha ao abrir a escola</strong>
            <p>{fatal ?? "A cena 3D foi interrompida."}</p>
            <button type="button" className={styles.btn} onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : !ready && <LoadingOverlay progress={progress} label={label} />}
      {ready && <DayEndReport />}
    </div>
  );
}
