"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { diagnostics, dismissTip, helpPrefs, saveHelpPrefs, searchTopics, type Diagnostic } from "../help";
import {
  DIFFICULTY, moment as _m, prog, setDifficulty, startTutorial, TUTORIAL_STEPS, tutorialCurrent, tutorialFlag, WHATS_NEW, WHATS_NEW_VERSION, type Difficulty,
} from "../progression";
import { getSim, skipToPhase } from "../sim";
import { useGame } from "../store";
import type { GameMode } from "../types";
import { openGabinete } from "./DirectorUI";
import { CrestSvg, useHighlight } from "./ManageUI";
import styles from "./player.module.css";
void _m;
export type XLayer = "none" | "fluxo" | "acesso" | "limpeza" | "barulho" | "conforto" | "servicos";
interface PlayerUI { start: boolean; help: boolean; helpTab: "problemas" | "topicos"; whatsNew: boolean; xray: XLayer; viewMenu: boolean; perf: boolean; set: (p: Partial<Omit<PlayerUI, "set">>) => void }
export const usePlayerUI = create<PlayerUI>((set) => ({ start: true, help: false, helpTab: "problemas", whatsNew: false, xray: "none", viewMenu: false, perf: false, set: (p) => set(p) }));
function useTick(ms: number) {
  const [, f] = useState(0);
  useEffect(() => { const t = window.setInterval(() => f((n) => n + 1), ms); return () => window.clearInterval(t); }, [ms]);
}
const touch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
// ------------------------------------------------------------------ tela inicial
export function StartScreen() {
  const ui = usePlayerUI();
  const actions = useGame((s) => s.actions);
  const ready = useGame((s) => s.ready);
  const [mode, setMode] = useState<"menu" | "nova">("menu");
  const [diff, setDiff] = useState<Difficulty>("gestao");
  const [name, setName] = useState("Escola Estadual PEG");
  const wasPaused = useRef(false);
  useEffect(() => {
    if (!ready || !ui.start) return;
    wasPaused.current = useGame.getState().paused;
    if (!useGame.getState().paused) actions.togglePause();
  }, [ready, ui.start, actions]);
  if (!ready || !ui.start) return null;
  const sim = getSim();
  const p = sim ? prog(sim.world) : null;
  const hasProgress = !!sim;
  const close = () => {
    ui.set({ start: false });
    if (useGame.getState().paused && !wasPaused.current) actions.togglePause();
    if (sim && p && hasProgress && p.whatsNewSeen < WHATS_NEW_VERSION) ui.set({ whatsNew: true });
  };
  const create = async (tutorial: boolean) => {
    if (hasProgress && !window.confirm("Criar uma nova escola substituirá a jornada atual. Deseja continuar?")) return;
    const m: GameMode = diff === "tranquilo" ? "calm" : diff === "desafio" ? "challenge" : "career";
    await actions.newGame(m);
    const s = getSim();
    if (s) {
      setDifficulty(s.world, diff);
      prog(s.world).whatsNewSeen = WHATS_NEW_VERSION;
      actions.setSchoolIdentity({ schoolName: name.trim() || "Escola PEG" });
      if (tutorial) startTutorial(s.world, true);
    }
    ui.set({ start: false });
    if (useGame.getState().paused) actions.togglePause();
  };
  return (
    <div className={styles.startWrap}>
      <div className={styles.startCard}>
        <div className={styles.startBrand}>
          <img src="/texturas/placa-peg.png" alt="" className={styles.startLogo} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <div>
            <small>PEG — Progressão Estudantil Gremista</small>
            <h1>Campus PEG</h1>
            <p>Construa, organize e acompanhe uma escola viva.</p>
          </div>
        </div>
        {mode === "menu" ? (
          <div className={styles.startButtons}>
            {hasProgress && <button className={styles.primary} onClick={() => {
              ui.set({ start: false });
              if (useGame.getState().paused) actions.togglePause();
            }}><b>Continuar jornada</b><span>{sim?.world.schoolName} · dia {sim?.world.day}</span></button>}
            <button className={hasProgress ? "" : styles.primary} onClick={() => setMode("nova")}><b>Nova escola</b><span>Escolha o nome e a dificuldade</span></button>
            <button onClick={() => { if (sim) startTutorial(sim.world, true); close(); }}><b>Seu primeiro dia como diretor</b><span>Tutorial jogável na própria escola</span></button>
            {hasProgress && <button onClick={() => { close(); ui.set({ whatsNew: true }); }}><b>Novidades</b><span>O que mudou nesta versão</span></button>}
            <button onClick={() => { close(); ui.set({ help: true, helpTab: "topicos" }); }}><b>Ajuda e controles</b><span>Mouse, teclado e toque</span></button>
          </div>
        ) : (
          <div className={styles.newGame}>
            <label>Nome da escola <input value={name} maxLength={42} onChange={(e) => setName(e.target.value)} /></label>
            <div className={styles.diffGrid}>
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => (
                <button key={k} className={diff === k ? styles.diffOn : ""} onClick={() => setDiff(k)}><b>{DIFFICULTY[k].label}</b><span>{DIFFICULTY[k].desc}</span></button>
              ))}
            </div>
            <p className={styles.warn}>{hasProgress ? "Atenção: a escola atual será substituída (exporte o save em Configurações se quiser guardar)." : ""}</p>
            <div className={styles.row}>
              <button className={styles.primary} onClick={() => create(true)}>Começar com tutorial</button>
              <button onClick={() => create(false)}>Começar sem tutorial</button>
              <button onClick={() => setMode("menu")}>Voltar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ------------------------------------------------------------------ novidades
export function WhatsNew() {
  const ui = usePlayerUI();
  if (!ui.whatsNew) return null;
  const sim = getSim();
  const done = () => { if (sim) prog(sim.world).whatsNewSeen = WHATS_NEW_VERSION; ui.set({ whatsNew: false }); };
  return (
    <div className={styles.modalWrap} onClick={done}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Novidades do Campus PEG</h2>
        <ul>{WHATS_NEW.map((n) => <li key={n}>{n}</li>)}</ul>
        <div className={styles.row}>
          <button className={styles.primary} onClick={() => { if (sim) startTutorial(sim.world, true); done(); }}>Ver apresentação guiada</button>
          <button onClick={done}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
// ------------------------------------------------------------------ tutorial jogável
export function TutorialCard() {
  useTick(500);
  const view = useGame((s) => s.cameraView);
  const selB = useGame((s) => s.selectedBuildingId);
  const selA = useGame((s) => s.selectedAgentId);
  const first = useRef<string | null>(null);
  const sim = getSim();
  const t = sim ? prog(sim.world).tutorial : null;
  useEffect(() => {
    if (!sim || !t?.active) return;
    const key = `${Math.round(view.targetX)}|${Math.round(view.targetZ)}|${Math.round(view.distance)}|${view.yaw.toFixed(1)}`;
    if (first.current === null) first.current = key;
    else if (key !== first.current) tutorialFlag(sim.world, "camera");
  }, [view, sim, t?.active]);
  useEffect(() => { if (sim && t?.active && (selA || selB)) tutorialFlag(sim.world, "select"); }, [selA, selB, sim, t?.active]);
  const step = sim && t?.active ? tutorialCurrent(sim.world) : null;
  useEffect(() => {
    if (!step?.highlight) return;
    const el = document.querySelector(`[data-tut="${step.highlight}"]`);
    el?.classList.add(styles.tutPulse);
    return () => el?.classList.remove(styles.tutPulse);
  }, [step?.highlight, step?.id]);
  if (!sim || !t?.active) return null;
  if (!step) {
    return (
      <div className={styles.tutCard}>
        <div className={styles.tutFace}>DC</div>
        <div><b>Primeiro dia concluído!</b><p>Você já sabe construir, contratar, resolver problemas e ler o boletim. Reveja quando quiser pela Ajuda.</p>
          <div className={styles.row}><button className={styles.primary} onClick={() => { t.active = false; }}>Fechar</button></div></div>
      </div>
    );
  }
  const idx = TUTORIAL_STEPS.findIndex((s) => s.id === step.id);
  return (
    <div className={styles.tutCard} role="dialog" aria-label="Tutorial">
      <div className={styles.tutFace} title="Dona Célia, secretaria">DC</div>
      <div>
        <small>Dona Célia · secretaria · passo {idx + 1} de {TUTORIAL_STEPS.length}</small>
        <b>{step.title}</b>
        <p>{touch() ? step.touch : step.mouse}</p>
        <div className={styles.tutDots}>{TUTORIAL_STEPS.map((s) => <i key={s.id} className={t.done.includes(s.id) ? styles.dotOn : s.id === step.id ? styles.dotCur : ""} />)}</div>
        <div className={styles.row}>
          {step.id === "boasvindas" && <button className={styles.primary} onClick={() => tutorialFlag(sim.world, "boasvindas")}>Continuar</button>}
          {step.id === "turma" && sim.world.minutes < 420 && <button onClick={() => skipToPhase(sim, 418)}>Avançar até 7h</button>}
          {step.id === "problema" && <button onClick={() => usePlayerUI.getState().set({ help: true, helpTab: "problemas" })}>Abrir ajuda</button>}
          {step.id === "missao" && <button onClick={() => openGabinete()}>Abrir gabinete</button>}
          <button onClick={() => { t.active = false; t.skipped = true; }}>Pular tutorial</button>
        </div>
      </div>
    </div>
  );
}
// ------------------------------------------------------------------ central de ajuda
export function HelpCenter() {
  useTick(1000);
  const ui = usePlayerUI();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<Record<string, number>>({});
  const [prefs, setPrefs] = useState(helpPrefs);
  const sim = getSim();
  useEffect(() => { if (ui.help && sim && ui.helpTab === "problemas") tutorialFlag(sim.world, "help"); }, [ui.help, ui.helpTab, sim]);
  if (!ui.help || !sim) return null;
  const diags = diagnostics(sim);
  const topics = searchTopics(q);
  const t = prog(sim.world).tutorial;
  return (
    <div className={styles.helpWrap} onClick={() => ui.set({ help: false })}>
      <div className={styles.help} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Central de ajuda">
        <header>
          <b>Central de ajuda</b>
          <button className={styles.close} onClick={() => ui.set({ help: false })} aria-label="Fechar">✕</button>
        </header>
        <nav className={styles.helpTabs}>
          <button className={ui.helpTab === "problemas" ? styles.tabOn : ""} onClick={() => ui.set({ helpTab: "problemas" })}>Problemas agora ({diags.length})</button>
          <button className={ui.helpTab === "topicos" ? styles.tabOn : ""} onClick={() => ui.set({ helpTab: "topicos" })}>Como jogar</button>
        </nav>
        <div className={styles.helpBody}>
          {ui.helpTab === "problemas" ? (
            diags.length === 0 ? <p className={styles.muted}>Nenhum problema detectado agora. A lista se atualiza com os dados da escola.</p> :
            diags.map((dg) => <DiagCard key={dg.id} dg={dg} level={level[dg.id] ?? 0} more={() => setLevel({ ...level, [dg.id]: Math.min(2, (level[dg.id] ?? 0) + 1) })} />)
          ) : (
            <>
              <input className={styles.search} placeholder="Buscar assunto (ex.: porta, merenda, lote)" value={q} onChange={(e) => setQ(e.target.value)} />
              {topics.map((h) => (
                <details key={h.id} className={styles.topic} open={!!q}>
                  <summary>{h.title}</summary>
                  {h.body.map((b) => <p key={b}>{b}</p>)}
                </details>
              ))}
              {topics.length === 0 && <p className={styles.muted}>Nada encontrado para “{q}”.</p>}
              <div className={styles.row}>
                <button onClick={() => { startTutorial(sim.world, false); ui.set({ help: false }); }}>{t.done.length && t.done.length < TUTORIAL_STEPS.length ? "Retomar tutorial" : "Ver tutorial"}</button>
                <button onClick={() => { startTutorial(sim.world, true); ui.set({ help: false }); }}>Rever do início</button>
                <label className={styles.toggle}><input type="checkbox" checked={prefs.tips} onChange={(e) => { const n = { ...prefs, tips: e.target.checked }; setPrefs(n); saveHelpPrefs(n); }} /> Dicas contextuais</label>
                <button onClick={() => { const n = { ...prefs, dismissed: [] }; setPrefs(n); saveHelpPrefs(n); }}>Reativar dicas dispensadas</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function DiagCard({ dg, level, more }: { dg: Diagnostic; level: number; more: () => void }) {
  return (
    <div className={styles.diag} data-sev={dg.severity}>
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <b><span className={styles.sev}>{dg.severity === 3 ? "Urgente" : dg.severity === 2 ? "Atenção" : "Dica"}</span> {dg.title}</b>
        {dg.x !== undefined && <button onClick={() => useHighlight.getState().show({ x: dg.x!, z: dg.z!, w: dg.w ?? 3, d: dg.d ?? 3, label: dg.title })}>Mostrar no mapa</button>}
      </div>
      <p><b>O que aconteceu?</b> {dg.what}</p>
      {level >= 1 && <p><b>Por que aconteceu?</b> {dg.why}</p>}
      {level >= 2 && (
        <>
          <p><b>Quais são minhas opções?</b></p>
          <ul>{dg.options.map((o) => <li key={o}>{o}</li>)}</ul>
          {dg.steps && <p className={styles.muted}>Etapas: {dg.steps.join("  ")}</p>}
          <p><b>Como evitar novamente?</b> {dg.prevent}</p>
        </>
      )}
      {level < 2 && <button className={styles.link} onClick={more}>{level === 0 ? "Por que isso está acontecendo?" : "Quais são minhas opções?"}</button>}
    </div>
  );
}
/** Dica contextual: só a mais relevante, nunca repete depois de dispensada. */
export function TipBubble() {
  useTick(4000);
  const ui = usePlayerUI();
  const camera = useGame((s) => s.cameraMode);
  const [shown, setShown] = useState<string | null>(null);
  const sim = getSim();
  const tip = useMemo(() => {
    if (!sim || !helpPrefs().tips || ui.help || ui.start) return null;
    const dis = helpPrefs().dismissed;
    return diagnostics(sim).find((d) => !dis.includes(d.id.replace(/-[a-z0-9-]+$/i, "")) && !dis.includes(d.id)) ?? null;
  }, [sim, ui.help, ui.start, sim?.world.minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tip || camera === "first" || (sim && prog(sim.world).tutorial.active)) return null;
  const open = shown === tip.id;
  return (
    <div className={styles.tip}>
      <b>💡 {tip.title}</b>
      <p>{open ? tip.why : tip.what}</p>
      <div className={styles.row}>
        {!open && <button onClick={() => setShown(tip.id)}>Por quê?</button>}
        {tip.x !== undefined && <button onClick={() => useHighlight.getState().show({ x: tip.x!, z: tip.z!, w: tip.w ?? 3, d: tip.d ?? 3, label: tip.title })}>Mostrar</button>}
        <button onClick={() => ui.set({ help: true, helpTab: "problemas" })}>Opções</button>
        <button onClick={() => { dismissTip(tip.id); setShown(null); }}>Dispensar</button>
      </div>
    </div>
  );
}
// ------------------------------------------------------------------ momentos marcantes
export function MomentBanner() {
  useTick(700);
  const actions = useGame((s) => s.actions);
  const buildKind = useGame((s) => s.buildKind);
  const sim = getSim();
  const [current, setCurrent] = useState<string | null>(null);
  const reduce = sim?.world.settings.reduceMotion;
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setCurrent(null), 7000);
    return () => window.clearTimeout(t);
  }, [current]);
  if (!sim) return null;
  const pending = prog(sim.world).moments.find((m) => !m.seen);
  // nunca interrompe construção, 1ª pessoa com incidente ou relatório
  if (!current && pending && !buildKind) { pending.seen = true; setTimeout(() => setCurrent(pending.id), 0); }
  const m = prog(sim.world).moments.find((x) => x.id === current);
  if (!m) return null;
  return (
    <div className={styles.moment} role="status">
      {!reduce && <div className={styles.confetti} aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, background: ["#f2c230", "#8a6bd8", "#3c9a5f", "#e08a3c"][i % 4] }} />)}</div>}
      <small>Momento marcante · dia {m.day}</small>
      <b>{m.title}</b>
      <p>{m.text}</p>
      <div className={styles.row}>
        {m.x !== undefined && <button onClick={() => { actions.focusOn(m.x!, m.z!, 22); setCurrent(null); }}>Ver</button>}
        <button onClick={() => setCurrent(null)}>Ok</button>
      </div>
    </div>
  );
}
// ------------------------------------------------------------------ barra de visão: exteriores/interiores, raio-x, ajuda, pausa
const XLAYERS: [XLayer, string, string][] = [
  ["none", "Desligado", ""], ["fluxo", "Fluxo de pessoas", "Onde há gargalos"], ["acesso", "Acessibilidade", "Rota para cadeira de rodas"], ["limpeza", "Limpeza", "Sujeira por ambiente"],
  ["barulho", "Barulho", "Fontes e alcance"], ["conforto", "Conforto térmico", "Sombra e abrigo"], ["servicos", "Serviços", "Distância de cantina e banheiros"],
];
export function ViewBar() {
  const ui = usePlayerUI();
  const showRoofs = useGame((s) => s.showRoofs);
  const paused = useGame((s) => s.paused);
  const actions = useGame((s) => s.actions);
  const camera = useGame((s) => s.cameraMode);
  if (camera === "first") return (
    <div className={styles.viewBar}><button data-tut="help" onClick={() => ui.set({ help: true })} aria-label="Ajuda">? Ajuda</button></div>
  );
  return (
    <div className={styles.viewBar}>
      <button data-tut="help" onClick={() => ui.set({ help: true })} aria-label="Central de ajuda">? <span>Ajuda</span></button>
      <button onClick={actions.togglePause} aria-pressed={paused}>{paused ? "▶" : "❚❚"} <span>{paused ? "Continuar" : "Pausar"}</span></button>
      <button onClick={() => ui.set({ viewMenu: !ui.viewMenu })} aria-expanded={ui.viewMenu}>◐ <span>Visão</span></button>
      {ui.viewMenu && (
        <div className={styles.viewMenu}>
          <b>Prédios</b>
          <div className={styles.row}>
            <button className={showRoofs ? styles.tabOn : ""} onClick={() => !showRoofs && actions.toggleRoofs()}>Ver exteriores</button>
            <button className={!showRoofs ? styles.tabOn : ""} onClick={() => showRoofs && actions.toggleRoofs()}>Ver interiores</button>
          </div>
          <p className={styles.muted}>Com exteriores, o prédio selecionado abre sozinho para mostrar a sala.</p>
          <b>Raio-X da escola</b>
          {XLAYERS.map(([id, label, hint]) => (
            <button key={id} className={`${styles.layerBtn} ${ui.xray === id ? styles.tabOn : ""}`} onClick={() => ui.set({ xray: id })}>{label}{hint && <small>{hint}</small>}</button>
          ))}
          <label className={styles.toggle}><input type="checkbox" checked={ui.perf} onChange={(e) => ui.set({ perf: e.target.checked })} /> Medidor de desempenho</label>
        </div>
      )}
      {ui.xray !== "none" && <span className={styles.xrayTag}>Raio-X: {XLAYERS.find((l) => l[0] === ui.xray)?.[1]} · toque no chão colorido</span>}
    </div>
  );
}
/** Medição real no aparelho do jogador (não declaramos FPS sem medir). */
export function PerfMeter() {
  const on = usePlayerUI((s) => s.perf);
  const [stats, setStats] = useState({ fps: 0, ms: 0, worst: 0 });
  useEffect(() => {
    if (!on) return;
    let frames = 0, last = performance.now(), prev = last, worst = 0, raf = 0;
    const loop = (t: number) => {
      frames += 1;
      worst = Math.max(worst, t - prev);
      prev = t;
      if (t - last >= 1000) { setStats({ fps: Math.round((frames * 1000) / (t - last)), ms: Math.round((t - last) / frames), worst: Math.round(worst) }); frames = 0; last = t; worst = 0; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  if (!on) return null;
  const sim = getSim();
  return <div className={styles.perf}>{stats.fps} FPS · {stats.ms} ms/quadro · pior {stats.worst} ms · {sim?.world.agents.filter((a) => a.visible).length ?? 0} pessoas</div>;
}
export function PhotoFrame() {
  const photo = useGame((s) => s.photoMode);
  const [frame, setFrame] = useState(true);
  const sim = getSim();
  if (!photo || !sim) return null;
  const p = prog(sim.world);
  const ev = sim.world.events.find((e) => e.status === "running");
  return (
    <>
      {frame && (
        <div className={styles.photoFrame} aria-hidden>
          <div className={styles.photoBadge}><CrestSvg index={p.custom.crest} color={sim.world.schoolColors.accent} /><div><b>{sim.world.schoolName}</b><small>{ev ? ev.name : `Dia ${sim.world.day}`}</small></div></div>
        </div>
      )}
      <div className={styles.photoTools}>
        <button onClick={() => setFrame(!frame)}>{frame ? "Ocultar moldura" : "Mostrar moldura"}</button>
        <button onClick={() => {
          const canvas = document.querySelector("canvas");
          if (!canvas) return;
          try {
            const c = document.createElement("canvas");
            c.width = 240; c.height = 135;
            c.getContext("2d")!.drawImage(canvas, 0, 0, 240, 135);
            const key = "peg-album-fotos";
            const list = JSON.parse(localStorage.getItem(key) ?? "[]") as { day: number; src: string }[];
            list.unshift({ day: sim.world.day, src: c.toDataURL("image/jpeg", 0.6) });
            localStorage.setItem(key, JSON.stringify(list.slice(0, 12)));
            alert("Miniatura guardada no álbum (fica neste aparelho, fora do save).");
          } catch { alert("Este navegador não permitiu capturar a imagem."); }
        }}>Guardar no álbum</button>
      </div>
    </>
  );
}
