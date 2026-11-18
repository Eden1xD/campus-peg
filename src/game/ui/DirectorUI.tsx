"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { BUILDABLE_BY_KIND, MISSION_DEFS, phaseFor } from "../config";
import {
  blockedAccesses,
  buyDirectorUpgrade,
  chooseFocus,
  claimQuickMission,
  dir,
  DIRECTOR_UPGRADES,
  directorAction,
  FOCUS_INFO,
  hasUpgrade,
  interact,
  nearestInteractable,
  returnDayFor,
  sfxQueue,
  starBreakdown,
  upgradeTargets,
  type DirectorActionId,
  type FocusArea,
  type Interactable,
} from "../director";
import { getSim } from "../sim";
import { useGame } from "../store";
import styles from "./director.module.css";
import { AlbumTab, CompeticoesTab, ConquistasTab, EscolaTab, ProjetosTab, StudentStory } from "./ProgressUI";
import { ComunidadeTab, DelegacaoTab, IncidentCard, PersonalizarTab, PlanejamentoTab, TerrenoTab } from "./ManageUI";
import { tutorialFlag } from "../progression";

type Tab = "decisoes" | "alunos" | "missoes" | "melhorias" | "secretaria" | "projetos" | "escola" | "competicoes" | "conquistas" | "album" | "delegar" | "comunidade" | "terreno" | "personalizar" | "planejar";
interface DirUI {
  open: boolean;
  tab: Tab;
  studentId: string | null;
  starsOpen: boolean;
  set: (p: Partial<Omit<DirUI, "set">>) => void;
}
export const useDirectorUI = create<DirUI>((set) => ({ open: false, tab: "decisoes", studentId: null, starsOpen: false, set: (p) => set(p) }));
export function openGabinete(studentId?: string | null) {
  useDirectorUI.getState().set({ open: true, tab: studentId ? "alunos" : "decisoes", studentId: studentId ?? null });
}

function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}

// ------------------------------------------------------------------ sons curtos (Web Audio, respeita volume de efeitos)
let ctx: AudioContext | null = null;
function sfx(kind: "conquista" | "alerta" | "ok") {
  const sim = getSim();
  const vol = sim?.world.settings.effects ?? 0.6;
  if (vol <= 0 || typeof window === "undefined") return;
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = kind === "conquista" ? [660, 880, 1175] : kind === "alerta" ? [520, 390] : [740];
    notes.forEach((f, i) => {
      const t = ctx!.currentTime + i * 0.11;
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = kind === "alerta" ? "square" : "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
  } catch {
    /* áudio indisponível */
  }
}

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}h${String(Math.floor(m % 60)).padStart(2, "0")}`;

// ------------------------------------------------------------------ HUD
export function DirectorHud() {
  useTick(400);
  const ui = useDirectorUI();
  const cameraMode = useGame((s) => s.cameraMode);
  const selectedAgentId = useGame((s) => s.selectedAgentId);
  const actions = useGame((s) => s.actions);
  const [toast, setToast] = useState<string | null>(null);
  const sim = getSim();
  useEffect(() => {
    while (sfxQueue.length) sfx(sfxQueue.shift()!);
  });
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!sim) return null;
  const d = dir(sim.world);
  const sb = starBreakdown(sim.world);
  const open = d.occurrences.filter((o) => o.status === "aberta");
  const selected = selectedAgentId ? sim.world.agents.find((a) => a.id === selectedAgentId && a.role === "student") : null;
  return (
    <>
      <div className={styles.dock}>
        <button className={styles.stars} onClick={() => ui.set({ starsOpen: !ui.starsOpen })} aria-label="Reputação em estrelas">
          <span className={styles.starIcon}>★</span> {sb.stars.toFixed(1)}
        </button>
        <button className={styles.cabinet} data-tut="gabinete" onClick={() => openGabinete()}>
          Gabinete{open.length ? <span className={styles.badge}>{open.length}</span> : null}
        </button>
      </div>
      {ui.starsOpen && (
        <div className={styles.starPanel} onClick={() => ui.set({ starsOpen: false })}>
          <b>Reputação {sb.stars.toFixed(1)} / 5,0</b>
          {(["ensino", "higiene", "alimentacao", "seguranca"] as const).map((k) => (
            <div key={k} className={styles.starRow}>
              <span>{k === "alimentacao" ? "Alimentação" : k === "seguranca" ? "Segurança" : k[0].toUpperCase() + k.slice(1)}</span>
              <div className={styles.bar}><i style={{ width: `${sb[k]}%`, background: sb.weakest.key === k ? "#e05a3a" : "#8a6bd8" }} /></div>
              <span>{Math.round(sb[k])}</span>
            </div>
          ))}
          <p>Segurando a média: <b>{sb.weakest.label}</b> ({Math.round(sb.weakest.value)}).</p>
        </div>
      )}
      {open.length > 0 && cameraMode === "orbit" && (
        <div className={styles.occStrip}>
          {open.slice(0, 3).map((o) => (
            <button key={o.id} className={styles.occChip} onClick={() => { actions.focusOn(o.x, o.z, 16); openGabinete(); }}>
              <b>{o.title}</b>
              {o.type === "fiscalizacao" ? <span>{Math.max(0, Math.ceil(60 - o.activeSeconds))} s</span> : <span>toque para localizar</span>}
            </button>
          ))}
          {open.length > 3 && <span className={styles.occMore}>+{open.length - 3}</span>}
        </div>
      )}
      {selected && cameraMode === "orbit" && !ui.open && (
        <button className={styles.fileBtn} onClick={() => openGabinete(selected.id)}>Ficha de {selected.name.split(" ")[0]}</button>
      )}
      {cameraMode === "first" && <FPAction onMessage={setToast} />}
      {toast && <div className={styles.toast}>{toast}</div>}
      {ui.open && <Gabinete onMessage={setToast} />}
    </>
  );
}

function FPAction({ onMessage }: { onMessage: (m: string) => void }) {
  const [hold, setHold] = useState(0);
  const holding = useRef<{ id: string; t: number } | null>(null);
  const raf = useRef<number | null>(null);
  useTick(200);
  const sim = getSim();
  const it: Interactable | null = sim ? nearestInteractable(sim) : null;
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  if (!sim || !it) return null;
  const start = () => {
    if (it.kind === "gabinete") return openGabinete();
    if (!it.hold) {
      const m = interact(sim, it);
      if (m) { onMessage(m); sfx("ok"); }
      return;
    }
    holding.current = { id: it.id, t: performance.now() };
    const loop = () => {
      const h = holding.current;
      if (!h) return;
      const cur = nearestInteractable(sim);
      if (!cur || cur.id !== h.id) { holding.current = null; setHold(0); onMessage("Ação cancelada: você se afastou."); return; }
      const p = (performance.now() - h.t) / 3000;
      setHold(p);
      if (p >= 1) {
        holding.current = null;
        setHold(0);
        onMessage(interact(sim, cur));
        sfx("conquista");
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (holding.current) onMessage("Segure por 3 segundos para concluir.");
    holding.current = null;
    setHold(0);
  };
  return (
    <button className={styles.fpAction} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
      <span className={styles.fpRing} style={{ background: `conic-gradient(#f2c230 ${hold * 360}deg, transparent 0)` }} />
      <span className={styles.fpLabel}>{it.label}</span>
    </button>
  );
}

// ------------------------------------------------------------------ gabinete
function Gabinete({ onMessage }: { onMessage: (m: string) => void }) {
  useTick(500);
  const ui = useDirectorUI();
  const sim = getSim();
  useEffect(() => { if (sim) tutorialFlag(sim.world, "gabinete"); }, [sim]);
  const actions = useGame((s) => s.actions);
  if (!sim) return null;
  const d = dir(sim.world);
  const say = (r: { ok: boolean; message: string }) => {
    onMessage(r.message);
    sfx(r.ok ? "ok" : "alerta");
    actions.refresh();
  };
  const tabs: [Tab, string][] = [["decisoes", "Decisões"], ["delegar", "Delegar"], ["alunos", "Alunos"], ["missoes", "Missões"], ["comunidade", "Grêmio e Voz"], ["projetos", "Projetos"], ["planejar", "Planejar"], ["terreno", "Terreno"], ["escola", "Escola"], ["personalizar", "Personalizar"], ["melhorias", "Melhorias"], ["competicoes", "Competições"], ["conquistas", "Objetivos"], ["album", "Álbum"], ["secretaria", "Secretaria"]];
  return (
    <div className={styles.overlay} onClick={() => ui.set({ open: false })}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Gabinete do diretor">
        <header className={styles.head}>
          <div>
            <b>Gabinete do diretor</b>
            <span>Dia {sim.world.day} · {fmtMin(sim.world.minutes)} · Disciplina {d.points.disciplina} · Convivência {d.points.convivencia} · Higiene {d.points.higiene}</span>
          </div>
          <button className={styles.close} onClick={() => ui.set({ open: false })} aria-label="Fechar">✕</button>
        </header>
        <nav className={styles.tabs}>
          {tabs.map(([id, label]) => (
            <button key={id} className={ui.tab === id ? styles.tabOn : ""} onClick={() => ui.set({ tab: id, studentId: id === "alunos" ? ui.studentId : null })}>{label}</button>
          ))}
        </nav>
        <div className={styles.body}>
          {ui.tab === "decisoes" && <Decisoes say={say} />}
          {ui.tab === "alunos" && (ui.studentId ? <StudentFile id={ui.studentId} say={say} /> : <StudentList />)}
          {ui.tab === "missoes" && <Missoes say={say} />}
          {ui.tab === "melhorias" && <Melhorias say={say} />}
          {ui.tab === "secretaria" && <Secretaria />}
          {ui.tab === "projetos" && <ProjetosTab say={say} />}
          {ui.tab === "escola" && <EscolaTab say={say} />}
          {ui.tab === "competicoes" && <CompeticoesTab say={say} />}
          {ui.tab === "conquistas" && <ConquistasTab say={say} />}
          {ui.tab === "album" && <AlbumTab />}
          {ui.tab === "delegar" && <DelegacaoTab say={say} />}
          {ui.tab === "comunidade" && <ComunidadeTab say={say} />}
          {ui.tab === "terreno" && <TerrenoTab say={say} />}
          {ui.tab === "personalizar" && <PersonalizarTab say={say} />}
          {ui.tab === "planejar" && <PlanejamentoTab say={say} />}
        </div>
      </div>
    </div>
  );
}

function Decisoes({ say }: { say: (r: { ok: boolean; message: string }) => void }) {
  const sim = getSim()!;
  const actions = useGame((s) => s.actions);
  const d = dir(sim.world);
  const open = d.occurrences.filter((o) => o.status === "aberta");
  const help = sim.world.agents.filter((a) => a.role === "student" && a.active && a.status !== "expulso" && (a.mood < 45 || a.needs.hunger > 80)).slice(0, 4);
  const skipping = sim.world.agents.filter((a) => a.skipping && a.active);
  const noSeat = sim.world.agents.filter((a) => a.role === "student" && a.active && a.waitReason === "sem-assento");
  const focus = d.focus && d.focus.day === sim.world.day ? d.focus : null;
  return (
    <>
      <section>
        <h4>Precisa de decisão ({open.length + skipping.length + (noSeat.length ? 1 : 0)})</h4>
        {open.length === 0 && skipping.length === 0 && !noSeat.length && <p className={styles.muted}>Nenhuma ocorrência aberta. Bom trabalho!</p>}
        {open.map((o) => <IncidentCard key={o.id} o={o} say={say} />)}
        {skipping.map((a) => (
          <div key={a.id} className={styles.card}>
            <div className={styles.row}><b>{a.name} está fora da sala</b><button className={styles.link} onClick={() => { actions.focusOn(a.x, a.z, 12); }}>Localizar</button></div>
            <div className={styles.actions}><button onClick={() => say(directorAction(sim, a.id, "orientar"))}>Orientar de volta à aula</button></div>
          </div>
        ))}
        {noSeat.length > 0 && (
          <div className={styles.card}>
            <div className={styles.row}><b>{noSeat.length} aluno(s) sem carteira</b><button className={styles.link} onClick={() => actions.focusOn(noSeat[0].x, noSeat[0].z, 14)}>Localizar turma</button></div>
            <p className={styles.muted}>Amplie a sala ou construa outra; a fila de matrículas respeita as carteiras reais.</p>
          </div>
        )}
      </section>
      <section>
        <h4>Prioridade do dia</h4>
        {focus ? (
          <div className={styles.card}>
            <b>{FOCUS_INFO[focus.area].label}</b> — meta: {focus.target} {focus.label} (início: {focus.baseline}).
            {focus.result && <p>{focus.result}</p>}
          </div>
        ) : (
          <div className={styles.actions}>
            {(Object.keys(FOCUS_INFO) as FocusArea[]).map((k) => (
              <button key={k} onClick={() => say(chooseFocus(sim, k))}>{FOCUS_INFO[k].label}</button>
            ))}
          </div>
        )}
      </section>
      {help.length > 0 && (
        <section>
          <h4>Estudantes aguardando atendimento</h4>
          {help.map((a) => (
            <button key={a.id} className={styles.listItem} onClick={() => useDirectorUI.getState().set({ tab: "alunos", studentId: a.id })}>
              <b>{a.name}</b><span>{a.activity} · ânimo {Math.round(a.mood)}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}

function StudentList() {
  const sim = getSim()!;
  const [q, setQ] = useState("");
  const students = sim.world.agents.filter((a) => a.role === "student" && a.name.toLowerCase().includes(q.toLowerCase()));
  const d = dir(sim.world);
  return (
    <section>
      <input className={styles.search} placeholder="Buscar estudante" value={q} onChange={(e) => setQ(e.target.value)} />
      {students.map((a) => {
        const r = d.records[a.id];
        return (
          <button key={a.id} className={styles.listItem} onClick={() => useDirectorUI.getState().set({ studentId: a.id })}>
            <b>{a.name}{a.wheelchair ? " ♿" : ""}</b>
            <span>{a.status === "suspenso" ? `Suspenso até o dia ${a.returnDay}` : a.status === "expulso" ? "Saindo da escola" : a.active ? a.activity : "Em casa"} · {r ? `${r.daysPresent}/${Math.max(1, r.daysExpected)} dias` : ""}</span>
          </button>
        );
      })}
    </section>
  );
}

const ACTION_LABEL: Record<DirectorActionId, string> = {
  conversar: "Conversar",
  elogiar: "Elogiar",
  orientar: "Orientar de volta à aula",
  mediar: "Mediar conflito",
  responsavel: "Chamar responsável",
  advertir: "Advertir",
  suspender: "Suspender",
  expulsar: "Expulsar",
};

function StudentFile({ id, say }: { id: string; say: (r: { ok: boolean; message: string }) => void }) {
  const sim = getSim()!;
  const actions = useGame((s) => s.actions);
  const [confirm, setConfirm] = useState<null | "suspender" | "expulsar">(null);
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState("");
  const a = sim.world.agents.find((x) => x.id === id);
  const d = dir(sim.world);
  const r = d.records[id] ?? d.archive.find((x) => x.id === id);
  const seat = a?.seatKey ? sim.seats.find((s) => s.key === a.seatKey) : null;
  if (!r) return <p>Ficha não encontrada.</p>;
  const group = r.group;
  return (
    <section className={styles.file}>
      <div className={styles.fileHead}>
        <button className={styles.link} onClick={() => useDirectorUI.getState().set({ studentId: null })}>← Lista</button>
        <div>
          <b>{r.name}</b>
          <span>{group} · frequência {r.daysPresent}/{Math.max(1, r.daysExpected)} dias · {r.status === "ativo" ? "matrícula ativa" : r.status === "suspenso" ? `suspenso até o dia ${r.returnDay}` : r.status === "formado" ? "formado(a)" : "matrícula encerrada"}</span>
        </div>
        {a?.active && <button className={styles.link} onClick={() => { actions.focusOn(a.x, a.z, 10); actions.selectAgent(a.id); useDirectorUI.getState().set({ open: false }); }}>Localizar</button>}
      </div>
      {a && (
        <p className={styles.muted}>
          Agora: {a.active ? a.activity : "em casa"} · Lugar: {seat ? seat.label : "nenhum reservado"}{a.waitReason ? ` · espera: ${a.waitReason}` : ""}
        </p>
      )}
      {a && a.status !== "expulso" && !confirm && (
        <div className={styles.actions}>
          {(Object.keys(ACTION_LABEL) as DirectorActionId[]).map((k) => (
            <button key={k} className={k === "expulsar" || k === "suspender" ? styles.danger : ""} disabled={k === "orientar" && phaseFor(sim.world.minutes) !== "class"}
              onClick={() => (k === "suspender" || k === "expulsar" ? setConfirm(k) : say(directorAction(sim, id, k)))}>
              {ACTION_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {a && confirm === "suspender" && (
        <div className={styles.confirm}>
          <b>Suspender {r.name} ({group})</b>
          <label>Duração em dias letivos: <input type="number" min={1} max={10} value={days} onChange={(e) => setDays(Math.max(1, Math.min(10, Number(e.target.value))))} /></label>
          <label>Motivo: <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reincidência em confusões" /></label>
          <p>Retorno no <b>dia {returnDayFor(sim.world, days)}</b>. O assento e a atividade são liberados e o aluno sai pelo portão agora.</p>
          <div className={styles.actions}>
            <button className={styles.danger} onClick={() => { say(directorAction(sim, id, "suspender", { days, reason })); setConfirm(null); }}>Confirmar suspensão</button>
            <button onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {a && confirm === "expulsar" && (
        <div className={styles.confirm}>
          <b>Expulsar {r.name} — {group}</b>
          <label>Motivo: <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatório" /></label>
          <p>Consequência: a matrícula é encerrada; cadeira, fila, conversa e missões do aluno são liberadas. {a.active ? "Ele encerra a rotina e sai caminhando." : "Ele está em casa: a matrícula termina imediatamente."} A ficha fica no arquivo da secretaria. Não há dinheiro, XP nem progresso de missão.</p>
          <div className={styles.actions}>
            <button className={styles.danger} disabled={!reason.trim()} onClick={() => { say(directorAction(sim, id, "expulsar", { reason })); setConfirm(null); useDirectorUI.getState().set({ studentId: null }); }}>Confirmar expulsão</button>
            <button onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <StudentStory id={id} />
      <h4>Histórico</h4>
      {r.history.length === 0 && <p className={styles.muted}>Sem registros ainda.</p>}
      <ul className={styles.history}>
        {r.history.map((h, i) => (
          <li key={i}><span>Dia {h.day} · {fmtMin(h.minute)}</span> <b>{h.type}</b> {h.text}</li>
        ))}
      </ul>
    </section>
  );
}

function Missoes({ say }: { say: (r: { ok: boolean; message: string }) => void }) {
  const sim = getSim()!;
  const d = dir(sim.world);
  const long = useMemo(() => MISSION_DEFS, []);
  return (
    <>
      <section>
        <h4>Missões rápidas de hoje</h4>
        {d.missions.map((m) => (
          <div key={m.id} className={styles.card}>
            <div className={styles.row}><b>{m.title}</b><span>{m.done ? "concluída" : m.failed ? "não concluída" : `até ${fmtMin(m.deadline)}`}</span></div>
            <p className={styles.muted}>{m.how}</p>
            <div className={styles.bar}><i style={{ width: `${Math.min(100, (m.progress / Math.max(1, m.target)) * 100)}%` }} /></div>
            <div className={styles.row}><span>{m.progress}/{m.target} · recompensa {money(m.reward)}</span>
              <button disabled={!m.done || m.claimed} onClick={() => say(claimQuickMission(sim, m.id))}>{m.claimed ? "Resgatada" : "Resgatar"}</button></div>
          </div>
        ))}
      </section>
      <section>
        <h4>Objetivos de gestão (longo prazo)</h4>
        {long.map((def) => {
          const st = sim.world.missions.find((x) => x.id === def.id);
          return (
            <div key={def.id} className={styles.listItem}>
              <b>{def.title}</b><span>{st ? `${Math.round(st.progress)}/${st.target}${st.completed ? " · concluído" : ""}` : ""}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}

function Melhorias({ say }: { say: (r: { ok: boolean; message: string }) => void }) {
  const sim = getSim()!;
  const [pick, setPick] = useState<Record<string, string>>({});
  const stars = starBreakdown(sim.world).stars;
  const blocked = hasUpgrade(sim.world, "sinalizacao") ? blockedAccesses(sim) : null;
  return (
    <section>
      <p className={styles.muted}>Saldo {money(sim.world.budget)} · {stars.toFixed(1)}★. Cada melhoria aparece no prédio escolhido e o efeito acompanha o prédio se ele for movido.</p>
      {DIRECTOR_UPGRADES.map((u) => {
        const targets = upgradeTargets(sim.world, u.id);
        const sel = pick[u.id] ?? targets.find((b) => !b.upgrades?.includes(u.id))?.id ?? "";
        const installed = targets.filter((b) => b.upgrades?.includes(u.id));
        const locked = u.minStars && stars < u.minStars;
        return (
          <div key={u.id} className={styles.card}>
            <div className={styles.row}><b>{u.name}</b><span>{money(u.cost)}{u.minStars ? ` · ${u.minStars.toFixed(1)}★` : ""}</span></div>
            <p className={styles.muted}>{u.effect}</p>
            {installed.length > 0 && <p>Instalado em: {installed.map((b) => `${BUILDABLE_BY_KIND[b.kind]?.name} (${Math.round(b.x)}, ${Math.round(b.z)})`).join(", ")}</p>}
            {targets.length === 0 ? <p className={styles.muted}>Construa: {u.kinds.map((k) => BUILDABLE_BY_KIND[k]?.name ?? k).join(" ou ")}.</p> : (
              <div className={styles.actions}>
                <select value={sel} onChange={(e) => setPick({ ...pick, [u.id]: e.target.value })}>
                  {targets.map((b) => <option key={b.id} value={b.id}>{BUILDABLE_BY_KIND[b.kind]?.name} ({Math.round(b.x)}, {Math.round(b.z)}){b.upgrades?.includes(u.id) ? " ✓" : ""}</option>)}
                </select>
                <button disabled={!!locked || !sel} onClick={() => say(buyDirectorUpgrade(sim, u.id, sel))}>{locked ? "Bloqueado" : "Instalar"}</button>
              </div>
            )}
          </div>
        );
      })}
      {blocked && (
        <div className={styles.card}>
          <b>Sinalização: acessos interrompidos</b>
          <p>{blocked.length ? blocked.join(", ") : "Todos os prédios têm rota a partir do portão."}</p>
        </div>
      )}
    </section>
  );
}

function Secretaria() {
  const sim = getSim()!;
  const d = dir(sim.world);
  const day = sim.world.day;
  return (
    <section>
      <h4>Arquivo da secretaria</h4>
      <p className={styles.muted}>Fichas deste save — separadas do cadastro escolar real da PEG.</p>
      {d.archive.length === 0 && <p className={styles.muted}>Nenhuma matrícula encerrada.</p>}
      {d.archive.map((r) => (
        <button key={r.id} className={styles.listItem} onClick={() => useDirectorUI.getState().set({ tab: "alunos", studentId: r.id })}>
          <b>{r.name}</b><span>{r.group} · {r.status === "formado" ? "formado(a)" : "encerrada"} · {r.exitReason}</span>
        </button>
      ))}
      <h4>Histórico recente</h4>
      {d.history.slice(-7).reverse().map((h) => (
        <div key={h.day} className={styles.listItem}><b>Dia {h.day}</b><span>{h.stars.toFixed(1)}★ · presença {h.attendance} · refeições {h.meals} · fila máx. {h.queuePeak}</span></div>
      ))}
      <p className={styles.muted}>Hoje é o dia {day}.</p>
    </section>
  );
}
