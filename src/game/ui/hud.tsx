"use client";
import { PARCELS, WORLD } from "../config";
import { getOwnedParcels } from "../nav";
import { DirectorHud } from "./DirectorUI";
import { ghostHistory } from "../store";

import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { Icon } from "./icons";
import styles from "./game.module.css";
import { PEG_AD_VIDEO_URL, formatClock, formatMoney, MISSION_DEFS, MODES, weatherLabel } from "../config";
import { AD_REWARD_LABELS, AD_MIN_WATCH_SECONDS } from "../ads";
import { phaseLabel } from "../sim";
import type { Panel } from "../store";
import { specFor } from "../layout";
import type { IconName } from "../types";
import { getSim } from "../sim";

const RAIL: { panel: Panel; label: string; icon: IconName }[] = [
  { panel: "build", label: "Construir", icon: "build" },
  { panel: "missions", label: "Missões", icon: "missions" },
  { panel: "agents", label: "Alunos", icon: "students" },
  { panel: "staff", label: "Equipe", icon: "staff" },
  { panel: "schedule", label: "Horário", icon: "schedule" },
  { panel: "finance", label: "Finanças", icon: "finance" },
  { panel: "stock", label: "Estoque", icon: "queue" },
  { panel: "improvements", label: "Melhorias", icon: "energy" },
  { panel: "events", label: "Eventos", icon: "trophy" },
  { panel: "report", label: "Relatório", icon: "map" },
  { panel: "camera", label: "Câmera", icon: "camera" },
];

export function TopBar() {
  const snapshot = useGame((s) => s.snapshot);
  const paused = useGame((s) => s.paused);
  const speed = useGame((s) => s.speed);
  const save = useGame((s) => s.saveState);
  const theme = useGame((s) => s.settings.theme);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  return (
    <details className="peg-summary">
      <summary aria-label="Resumo da escola">
        <span>Dia {snapshot.day} · {formatClock(snapshot.minutes)}</span>
        <strong>{formatMoney(snapshot.budget)}</strong><span aria-hidden="true">⌄</span>
      </summary>
      <div className="peg-sheet">
        <strong>{getSim()?.world.schoolName ?? "Escola PEG"}</strong>
        <small>{MODES[snapshot.modes].label} · {phaseLabel(snapshot.minutes)} · {weatherLabel(snapshot.weather)}</small>
        <dl>
          <dt>Matrículas / vagas</dt><dd>{snapshot.enrolled} / {snapshot.stats.seatsTotal}</dd>
          <dt>Reputação</dt><dd>{snapshot.reputation}</dd>
          <dt>Salvamento</dt><dd>{{saving:"Salvando", saved:"Sincronizado", local:"Local", error:"Falhou"}[save as "saving" | "saved" | "local" | "error"] ?? "Automático"}</dd>
        </dl>
        <div className="peg-actions">
          <button onClick={actions.togglePause}>{paused ? "Continuar" : "Pausar"}</button>
          {[1, 2, 4].map((v) => <button key={v} aria-pressed={!paused && speed === v} onClick={() => actions.setSpeed(v)}>{v}×</button>)}
        </div>
        <div className="peg-actions">
          <button onClick={actions.toggleTheme}>Tema {theme === "dark" ? "escuro" : "claro"}</button>
          <button onClick={() => actions.openAd("boost_works")}>Publicidade</button>
        </div>
      </div>
    </details>
  );
}

export function Rail() {
  const panel = useGame((s) => s.panel);
  const actions = useGame((s) => s.actions);
  const cameraMode = useGame((s) => s.cameraMode);
  const [drawer, setDrawer] = useState(false);
  const [view, setView] = useState<"map" | "goals" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setDrawer(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [drawer]);
  const select = (next: Panel) => {
    setDrawer(false);
    setView(null);
    actions.setPanel(panel === next ? "none" : next);
  };
  return (
    <>
      <div className="peg-tools" ref={root}>
        <div className="peg-actions">
          <button onClick={() => select("build")} aria-pressed={panel === "build"}><Icon name="build" size={16}/> Construir</button>
          <button aria-expanded={drawer} onClick={() => { setView(null); setDrawer(!drawer); }}>Ferramentas</button>
        </div>
        {drawer && <nav className="peg-sheet peg-grid" aria-label="Ferramentas da escola">
          {RAIL.filter((item) => item.panel !== "build").map((item) => (
            <button key={item.panel} aria-pressed={panel === item.panel} onClick={() => select(item.panel)}>
              <Icon name={item.icon} size={15}/>{item.label}
            </button>
          ))}
          <button onClick={() => { if (!useGame.getState().minimapOpen) actions.toggleMinimap(); setView("map"); setDrawer(false); }}>Mapa</button>
          <button onClick={() => { if (!useGame.getState().objectivesOpen) actions.toggleObjectives(); setView("goals"); setDrawer(false); }}>Objetivos</button>
          <button onClick={() => { actions.setCameraMode(cameraMode === "first" ? "orbit" : "first"); setDrawer(false); }}>{cameraMode === "first" ? "Visão geral" : "1ª pessoa"}</button>
          <button onClick={() => { setDrawer(false); actions.setPhotoMode(true); }}>Fotografar</button>
        </nav>}
      </div>
      {view === "map" && <Minimap />}
      {view === "goals" && <Objectives />}
    </>
  );
}

export function Minimap() {
  const buildings = useGame((s) => s.snapshot?.buildings);
  const agents = useGame((s) => s.snapshot?.agents);
  const open = useGame((s) => s.minimapOpen);
  const actions = useGame((s) => s.actions);
  if (!open) return null;
  // minimapa cobre todas as parcelas (as não compradas aparecem hachuradas)
  const spanX = WORLD.maxX - WORLD.minX + 6, spanZ = WORLD.maxZ - WORLD.minZ + 18;
  const scaleX = 170 / spanX;
  const scaleZ = 150 / spanZ;
  const toX = (x: number) => (x - WORLD.minX + 3) * scaleX;
  const toY = (z: number) => (z - WORLD.minZ + 15) * scaleZ;
  const owned = getOwnedParcels();
  const player = getSim()?.world.player;
  return (
    <div className={styles.minimap}>
      <div className={`${styles.between} ${styles.tiny}`} style={{ marginBottom: 4 }}>
        <span className="muted">Mapa</span>
        <button className={styles.iconBtn} style={{ width: 22, height: 22 }} onClick={actions.toggleMinimap} aria-label="Fechar mapa">
          <Icon name="close" size={12} />
        </button>
      </div>
      <svg
        className={styles.minimapSvg}
        viewBox="0 0 170 150"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * spanX + WORLD.minX - 3;
          const z = ((event.clientY - rect.top) / rect.height) * spanZ + WORLD.minZ - 15;
          actions.focusOn(x, z, 50);
        }}
      >
        <rect x={0} y={0} width={170} height={150} fill="#2b2438" />
        {PARCELS.map((p) => {
          const own = owned.some((o) => o.minX === p.minX && o.minZ === p.minZ);
          return <rect key={p.id} x={toX(p.minX)} y={toY(p.minZ)} width={(p.maxX - p.minX) * scaleX} height={(p.maxZ - p.minZ) * scaleZ} fill={own ? "#3d5a3a" : "#3a3446"} stroke={own ? "#9fd39a" : "#6b5f80"} strokeWidth={own ? 0.8 : 0.5} strokeDasharray={own ? undefined : "2 2"} />;
        })}
        <rect x={0} y={toY(-36)} width={170} height={(36 - 24) * scaleZ} fill="#3a3b40" />
        <rect x={0} y={toY(-30)} width={170} height={6 * scaleZ} fill="#8f8a7e" />
        <line x1={0} y1={toY(-22.6)} x2={170} y2={toY(-22.6)} stroke="#c7bda9" strokeWidth={1} strokeDasharray="3 2" />
        {buildings?.map((b) => {
          const spec = specFor(b.kind);
          const odd = Math.abs(Math.round(b.rot)) % 2 === 1;
          const w = Math.max(3, (odd ? spec.d : spec.w) * scaleX);
          const d = Math.max(3, (odd ? spec.w : spec.d) * scaleZ);
          const fill = b.progress < 1 ? "#f0b95a" : b.accessible ? "#7c5cc4" : "#a3555c";
          return (
            <rect
              key={b.id}
              x={toX(b.x) - w / 2}
              y={toY(b.z) - d / 2}
              width={w}
              height={d}
              fill={fill}
              opacity={0.85}
              rx={1.5}
            />
          );
        })}
        {agents?.map((a) => (
          <circle key={a.id} cx={toX(a.x)} cy={toY(a.z)} r={1.7} fill={a.role === "student" ? "#f5e9cf" : "#6fd79b"} />
        ))}
        {player && <circle cx={toX(player.x)} cy={toY(player.z)} r={2.4} fill="#ffd27a" stroke="#241a36" strokeWidth={0.7} />}
        <text x={toX(0)} y={toY(-23.2)} fontSize="5" fill="#ffe9b8" textAnchor="middle">
          portão
        </text>
      </svg>
      <div className={styles.legend} style={{ marginTop: 4 }}>
        <span><i className={styles.dot} style={{ background: "#7c5cc4" }} />acessível</span>
        <span><i className={styles.dot} style={{ background: "#a3555c" }} />sem rota</span>
        <span><i className={styles.dot} style={{ background: "#f0b95a" }} />obra</span>
      </div>
    </div>
  );
}

export function Objectives() {
  const snapshot = useGame((s) => s.snapshot);
  const open = useGame((s) => s.objectivesOpen);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  const tutorial = [
    "Abra a primeira sala de aula (padrão: já existe)",
    "Garanta 10 assentos reais",
    "Ponha 6 alunos em aula ao mesmo tempo",
    "Contrate limpeza ou manutenção",
    "Instale uma rota acessível",
    "Mantenha limpeza acima de 70%",
    "Realize um evento escolar",
    "Conclua uma missão",
  ];
  const nextMission = snapshot.missions.find((m) => m.completed && !m.claimed) ?? snapshot.missions.find((m) => !m.completed && !m.claimed);
  const definition = MISSION_DEFS.find((m) => m.id === nextMission?.id);
  return (
    <div className={styles.objectives}>
      <div className={styles.objectivesHead} onClick={actions.toggleObjectives}>
        <div className={styles.row} style={{ gap: 6 }}>
          <Icon name="missions" size={15} />
          <span className={styles.strong} style={{ fontSize: "0.85em" }}>Objetivos</span>
        </div>
        <span className={`${styles.pill}`}>{Math.min(8, snapshot.tutorialStep)}/8</span>
      </div>
      {open && (
        <div className={styles.objectivesBody}>
          {tutorial.map((item, index) => (
            <div key={item} className={`${styles.row} ${styles.tiny}`} style={{ gap: 6, color: index < snapshot.tutorialStep ? "var(--good)" : "var(--muted)" }}>
              <Icon name={index < snapshot.tutorialStep ? "check" : "arrow"} size={11} />
              <span>{item}</span>
            </div>
          ))}
          {definition && nextMission && (
            <div className={styles.card} style={{ marginTop: 4 }}>
              <div className={`${styles.row} ${styles.between}`}>
                <span className={`${styles.strong} ${styles.small}`}>{definition.title}</span>
                <span className={styles.tag}>{definition.difficulty}</span>
              </div>
              <div className={styles.progress}>
                <div className={styles.progressFill} style={{ width: `${Math.min(100, (nextMission.progress / Math.max(1, nextMission.target)) * 100)}%` }} />
              </div>
              <div className={`${styles.tiny} ${styles.muted}`}>
                {Math.min(nextMission.progress, nextMission.target)}/{nextMission.target} {definition.unit}
              </div>
            </div>
          )}
          <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnPrimary}`} onClick={() => actions.setPanel("missions")}>
            Abrir missões
          </button>
        </div>
      )}
    </div>
  );
}

export function BuildBar() {
  const ghost = useGame((s) => s.ghost);
  const buildKind = useGame((s) => s.buildKind);
  const actions = useGame((s) => s.actions);
  const moveId = useGame((s) => s.moveId);
  if (!buildKind) return null;
  return (
    <div className={styles.buildBar}>
      <span className={`${styles.pill} ${ghost?.valid ? styles.pillGood : styles.pillBad}`}>
        {ghost ? ghost.message : "Clique no terreno para posicionar"}
      </span>
      {ghost?.reason && <span className={`${styles.tiny} ${styles.warn}`}>{ghost.reason}</span>}
      <button className={styles.btn} onClick={() => { const prev = ghostHistory.pop(); if (prev) actions.setGhostRaw(prev); }} disabled={!ghostHistory.length} title="Desfazer posição">
        ↶ Desfazer
      </button>
      <button className={styles.btn} onClick={actions.rotateBuild} title="Girar (R)">
        <Icon name="rotate" size={14} /> Girar
      </button>
      <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!ghost?.valid} onClick={() => actions.confirmBuild()}>
        <Icon name="check" size={14} /> {moveId ? "Confirmar mudança" : "Construir"}
      </button>
      <button className={styles.btn} onClick={actions.cancelBuild}>
        <Icon name="close" size={14} /> Cancelar
      </button>
    </div>
  );
}

export function FirstPersonBar() {
  const cameraMode = useGame((s) => s.cameraMode);
  const actions = useGame((s) => s.actions);
  const snapshot = useGame((s) => s.snapshot);
  const visits = getSim()?.world.player.visits ?? [];
  const [hold, setHold] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!hold) return;
    const move = () => {
      const step = 0.55;
      if (hold === "w") actions.walkPlayer(0, step);
      if (hold === "s") actions.walkPlayer(0, -step);
      if (hold === "a") actions.walkPlayer(-step, 0);
      if (hold === "d") actions.walkPlayer(step, 0);
      if (hold === "left") actions.updateCameraView({ yaw: (useGame.getState().cameraView.yaw ?? 0) + 0.14 });
      if (hold === "right") actions.updateCameraView({ yaw: (useGame.getState().cameraView.yaw ?? 0) - 0.14 });
    };
    move();
    timer.current = window.setInterval(move, 150);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [hold, actions]);
  if (cameraMode !== "first") return null;
  return (
    <>
      <div className={styles.crosshair} />
      <div className={styles.fpBar}>
        <span className={`${styles.pill} ${styles.pillGood}`}>
          <Icon name="firstperson" size={12} /> Modo diretor · {visits.length}/3 locais
        </span>
        <div className={styles.hideMobile}>
          <span className={`${styles.tiny} ${styles.muted}`}>WASD/setas andar · arraste para olhar · Shift correr</span>
        </div>
        <div className={`${styles.dpad} ${styles.hideMobile}`}>
          <span />
          <button className={styles.dpadBtn} onPointerDown={() => setHold("w")} onPointerUp={() => setHold(null)} onPointerLeave={() => setHold(null)}>▲</button>
          <span />
          <button className={styles.dpadBtn} onPointerDown={() => setHold("a")} onPointerUp={() => setHold(null)} onPointerLeave={() => setHold(null)}>◀</button>
          <button className={styles.dpadBtn} onPointerDown={() => setHold("s")} onPointerUp={() => setHold(null)} onPointerLeave={() => setHold(null)}>▼</button>
          <button className={styles.dpadBtn} onPointerDown={() => setHold("d")} onPointerUp={() => setHold(null)} onPointerLeave={() => setHold(null)}>▶</button>
          <button className={styles.dpadBtn} onPointerDown={() => setHold("left")} onPointerUp={() => setHold(null)} onPointerLeave={() => setHold(null)}>↺</button>
          <span />
          <button className={styles.dpadBtn} onPointerDown={() => setHold("right")} onPointerUp={() => setHold(null)} onPointerLeave={() => setHold(null)}>↻</button>
        </div>
        <button className={styles.btn} onClick={() => actions.setCameraMode("orbit")}>
          <Icon name="close" size={13} /> Sair da 1ª pessoa
        </button>
        {snapshot?.daily && (
          <span className={`${styles.tiny} ${styles.muted}`}>Almoço: cantina · depois biblioteca · por último uma obra</span>
        )}
      </div>
    </>
  );
}

export function PhotoBar() {
  const actions = useGame((s) => s.actions);
  const [message, setMessage] = useState<string | null>(null);
  const capture = () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      setMessage("Cena 3D não encontrada.");
      return;
    }
    try {
      const url = (canvas as HTMLCanvasElement).toDataURL("image/png");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `peg-minha-escola-${Date.now()}.png`;
      anchor.click();
      setMessage("Imagem exportada em PNG.");
    } catch {
      setMessage("O navegador bloqueou a exportação deste canvas.");
    }
  };
  return (
    <div className={styles.photoBar}>
      <span className={`${styles.pill}`}>Modo fotografia · simulação pausada</span>
      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={capture}>
        <Icon name="download" size={14} /> Exportar PNG
      </button>
      <button className={styles.btn} onClick={() => actions.setPhotoMode(false)}>
        <Icon name="close" size={14} /> Sair
      </button>
      {message && <span className={`${styles.tiny} ${styles.muted}`}>{message}</span>}
    </div>
  );
}

export function ToastView() {
  const toast = useGame((s) => s.toast);
  const dismiss = useGame((s) => s.actions.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, 6200);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);
  if (!toast) return null;
  const tone = toast.tone === "good" ? styles.toastGood : toast.tone === "warn" ? styles.toastWarn : toast.tone === "bad" ? styles.toastBad : "";
  return (
    <div className={`${styles.toast} ${tone}`} role="status">
      <Icon name={toast.tone === "good" ? "check" : toast.tone === "warn" || toast.tone === "bad" ? "warning" : "arrow"} size={16} />
      <div style={{ flex: 1 }}>
        <div className={styles.toastTitle}>{toast.title}</div>
        <div className={styles.toastBody}>{toast.body}</div>
      </div>
      <button className={styles.iconBtn} onClick={dismiss} aria-label="Fechar aviso">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

export function AdModal() {
  const ad = useGame((s) => s.ad);
  const actions = useGame((s) => s.actions);
  const selected = useGame((s) => s.selectedBuildingId);
  useEffect(() => {
    if (!ad.open || ad.stage !== "playing") return;
    const timer = window.setInterval(() => {
      const current = useGame.getState().ad;
      if (current.secondsLeft <= 1) {
        actions.finishAd();
      } else {
        useGame.setState({ ad: { ...current, secondsLeft: current.secondsLeft - 1 } });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ad.open, ad.stage, actions]);
  if (!ad.open) return null;
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <div className={styles.between}>
          <span className={styles.adBadge}>Publicidade do PEG</span>
          <button className={styles.iconBtn} onClick={actions.closeAd} aria-label="Fechar publicidade">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div>
          <div className={styles.panelTitle}>Vídeo do PEG — recompensa opcional</div>
          <div className={`${styles.small} ${styles.muted}`}>
            Recompensa: {AD_REWARD_LABELS[ad.reward]}. {selected ? "Obra selecionada será priorizada." : "Sem obra selecionada, aplica a todas as obras ativas."}
          </div>
        </div>
        <div className={styles.adVideo}>
          {ad.stage === "playing" && PEG_AD_VIDEO_URL ? (
            <video src={PEG_AD_VIDEO_URL} autoPlay muted playsInline controls={false} />
          ) : (
            <div style={{ textAlign: "center", padding: 18 }}>
              <div className={styles.brandMark} style={{ margin: "0 auto 10px" }}>PEG</div>
              <div className={styles.strong}>Projetos, eventos e novidades do PEG</div>
              <div className={`${styles.small} ${styles.muted}`} style={{ marginTop: 6 }}>
                {PEG_AD_VIDEO_URL ? "Vídeo configurado em NEXT_PUBLIC_PEG_AD_VIDEO_URL." : "Nenhum MP4 configurado: usando cartão promocional com validação local informada."}
              </div>
            </div>
          )}
          {ad.stage === "playing" && (
            <div style={{ position: "absolute", bottom: 8, left: 12, right: 12 }}>
              <div className={styles.progress}>
                <div className={styles.progressFill} style={{ width: `${((AD_MIN_WATCH_SECONDS - ad.secondsLeft) / AD_MIN_WATCH_SECONDS) * 100}%` }} />
              </div>
              <div className={`${styles.tiny} ${styles.muted}`} style={{ marginTop: 4 }}>
                {ad.secondsLeft}s restantes · feche a qualquer momento (sem recompensa)
              </div>
            </div>
          )}
        </div>
        {ad.message && <div className={`${styles.small} ${ad.stage === "error" ? styles.warn : styles.good}`}>{ad.message}</div>}
        <div className={styles.row}>
          {ad.stage === "offer" && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={actions.startAd}>
              <Icon name="play" size={14} /> Assistir e ganhar
            </button>
          )}
          {ad.stage === "loading" && <span className={styles.pill}>Preparando sessão no servidor…</span>}
          {ad.stage === "playing" && (
            <span className={styles.pillWarn}>Não feche antes do fim para receber a recompensa</span>
          )}
          {ad.stage === "finished" && (
            <button className={`${styles.btn} ${styles.btnGood}`} onClick={actions.claimAd}>
              <Icon name="check" size={14} /> Resgatar recompensa
            </button>
          )}
          {ad.stage === "claimed" && <span className={styles.pillGood}>Recompensa aplicada nesta sessão</span>}
          <button className={styles.btn} onClick={actions.closeAd}>
            Fechar
          </button>
          <span className={`${styles.tiny} ${styles.muted}`}>Limite: 1 concessão / 15 min · sem impacto no XP oficial do PEG</span>
        </div>
      </div>
    </div>
  );
}

export function LoadingOverlay({ progress, label }: { progress: number; label: string }) {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingInner}>
        <div className={styles.brandMark} style={{ width: 52, height: 52, fontSize: "1em" }}>PEG</div>
        <div style={{ fontSize: "1.3em", fontWeight: 700 }}>PEG — Minha Escola</div>
        <div className={styles.loadingBar}>
          <div className={styles.loadingFill} style={{ width: `${progress}%` }} />
        </div>
        <div className={`${styles.small} ${styles.muted}`}>{label}</div>
        <div className={styles.tiny} style={{ opacity: 0.65 }}>
          Texturas PBR geradas no dispositivo · Three.js + React Three Fiber
        </div>
      </div>
    </div>
  );
}

export function WebglFallback() {
  return (
    <div className={styles.modalBackdrop} style={{ position: "absolute", zIndex: 25 }}>
      <div className={styles.modal}>
        <span className={styles.adBadge}>WebGL indisponível</span>
        <div className={styles.panelTitle}>Não foi possível iniciar o mundo 3D</div>
        <p className={`${styles.small} ${styles.muted}`}>
          O navegador/dispositivo não liberou um contexto WebGL (ou o contexto foi perdido). O progresso já salvo continua intacto no armazenamento local e no PostgreSQL.
        </p>
        <ul className={`${styles.small} ${styles.muted}`}>
          <li>Ative a aceleração de hardware e recarregue a página.</li>
          <li>Feche outras abas pesadas e tente o perfil de qualidade Baixa.</li>
          <li>Em navegadores com bloqueio de canvas, permita WebGL para este site.</li>
        </ul>
        <div className={styles.row}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => window.location.reload()}>
            Recarregar
          </button>
          <a className={styles.btn} href="/">
            Voltar ao PEG
          </a>
        </div>
      </div>
    </div>
  );
}

export function Hud() {
  const webglFailed = useGame((s) => s.webglFailed);
  return (
    <>
    <DirectorHud />
    <>
      <style>{`
        .peg-summary,.peg-tools { position:absolute; left:12px; z-index:12; pointer-events:auto; color:var(--text,#f5f2f8); font:500 13px/1.35 system-ui,sans-serif; }
        .peg-summary {top:12px}
        .peg-tools {top:58px}
        .peg-summary summary,.peg-tools>.peg-actions,.peg-sheet {background:var(--panel,#25222d); border:1px solid var(--border,#51495d); border-radius:12px; box-shadow:0 3px 14px #0002}
        .peg-summary summary {display:flex;align-items:center;gap:12px;cursor:pointer;min-height:36px;padding:0 12px;list-style:none}
        .peg-summary summary::-webkit-details-marker {display:none}
        .peg-summary[open] {z-index:15}
        .peg-sheet {position:absolute;top:calc(100% + 5px);left:0;box-sizing:border-box;width:min(260px,calc(100vw - 24px));padding:12px;max-height:calc(100dvh - 140px);overflow:auto}
        .peg-sheet small {display:block;margin:4px 0 10px}
        .peg-sheet dl {display:grid;grid-template-columns:1fr auto;gap:6px;margin:10px 0}.peg-sheet dd {margin:0;text-align:right}
        .peg-actions {display:flex;align-items:center;gap:3px;padding:3px}
        .peg-tools button,.peg-summary button {display:inline-flex;align-items:center;gap:7px;background:transparent;color:inherit;border:0;border-radius:8px;padding:8px;cursor:pointer;font:inherit}
        .peg-tools button:hover,.peg-summary button:hover,.peg-tools button[aria-pressed=true],.peg-summary button[aria-pressed=true] {background:#9275b533}
        .peg-grid {display:grid;grid-template-columns:1fr 1fr;gap:2px}
        @media (pointer:fine) { .${styles.dpad} {display:none!important} }
      `}</style>
      <TopBar />
      <Rail />

      <BuildBar />
      <FirstPersonBar />
      <ToastView />
      <AdModal />
      {webglFailed && <WebglFallback />}
    </>
    </>
  );
}
