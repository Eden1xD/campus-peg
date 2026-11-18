"use client";

import { useState } from "react";
import { create } from "zustand";
import { BUILDABLE_BY_KIND, PARCELS } from "../config";
import { dir, delegate, incidentAction, incidentSteps, inspectionChecklist, staffAvailability, TASK_INFO, type Occurrence, type TaskKind } from "../director";
import { isWalled } from "../layout";
import {
  allTemplates, applyFacade, applyRoomStyle, applyUniform, buildPlan, buyParcel, CREST_NAMES, difficulty, DIFFICULTY, FACADES, FLOOR_COST,
  GREMIO_PROPOSALS, gremioDecide, PAINT_COST, paintTargets, parcelAdjacent, parcelHint, parcelPrice, planStatus, prog, removePlan, roomLabelFor,
  saveTemplateFromPlans, setDifficulty, type Difficulty, type FacadeModel,
} from "../progression";
import { getSim, placeBuilding } from "../sim";
import { useGame } from "../store";
import type { BuildingKind } from "../types";
import styles from "./director.module.css";

type Say = (r: { ok: boolean; message: string }) => void;
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// destaque no mapa compartilhado com a cena 3D ("Mostrar no mapa")
interface Highlight { x: number; z: number; w: number; d: number; label: string; until: number }
export const useHighlight = create<{ h: Highlight | null; show: (h: Omit<Highlight, "until">) => void; clear: () => void }>((set) => ({
  h: null,
  show: (h) => {
    set({ h: { ...h, until: performance.now() + 9000 } });
    useGame.getState().actions.focusOn(h.x, h.z, 26);
  },
  clear: () => set({ h: null }),
}));

// planejamento (UI): ferramenta ativa para tocar no terreno
export const usePlanning = create<{ active: boolean; kind: BuildingKind | null; template: string | null; rot: number; set: (p: Partial<{ active: boolean; kind: BuildingKind | null; template: string | null; rot: number }>) => void }>((set) => ({
  active: false, kind: null, template: null, rot: 0, set: (p) => set(p),
}));

/** Botão de confirmação em dois toques para ações caras ou destrutivas. */
export function ConfirmButton({ label, confirm, onConfirm, danger, disabled }: { label: string; confirm: string; onConfirm: () => void; danger?: boolean; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className={styles.actions} style={{ marginTop: 0 }}>
      <button className={danger ? styles.danger : ""} onClick={() => { setArmed(false); onConfirm(); }}>{confirm}</button>
      <button onClick={() => setArmed(false)}>Cancelar</button>
    </span>
  ) : <button className={danger ? styles.danger : ""} disabled={disabled} onClick={() => setArmed(true)}>{label}</button>;
}

export function IncidentCard({ o, say }: { o: Occurrence; say: Say }) {
  const sim = getSim()!;
  const steps = incidentSteps(o);
  const cur = steps[o.stage];
  const task = o.taskId ? dir(sim.world).tasks.find((t) => t.id === o.taskId) : null;
  const t0 = sim.world.day * 1440 + sim.world.minutes;
  const helper = task ? sim.world.agents.find((a) => a.id === task.agentId) : null;
  const left = o.deadline - t0;
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <b>⚠ {o.title}</b>
        <button className={styles.link} onClick={() => useHighlight.getState().show({ x: o.x, z: o.z, w: 3, d: 3, label: o.title })}>Mostrar no mapa</button>
      </div>
      {o.cause && <p className={styles.muted}><b>Por que aconteceu?</b> {o.cause}</p>}
      {o.type === "confusao" && <p>Envolvidos: {o.agents.map((id) => sim.world.agents.find((a) => a.id === id)?.name).filter(Boolean).join(" e ")}</p>}
      {o.type === "fiscalizacao" ? (
        <ul className={styles.checks}>
          <li>Tempo ativo restante: <b>{Math.max(0, Math.ceil(60 - o.activeSeconds))} s</b> (pausar congela)</li>
          {inspectionChecklist(sim.world).map((c) => <li key={c.label} className={c.ok ? styles.ok : styles.bad}>{c.ok ? "✓" : "✗"} {c.label}</li>)}
        </ul>
      ) : (
        <>
          <ol className={styles.steps}>
            {steps.map((s, i) => <li key={s.title} className={i < o.stage ? styles.ok : i === o.stage ? "" : styles.muted}>{i < o.stage ? "✓ " : i === o.stage ? "→ " : ""}{s.title}{i < o.stage && o.history[i] ? ` — ${o.history[i].split(": ").slice(1).join(": ")}` : ""}</li>)}
          </ol>
          {cur?.info && <p>{cur.info(sim, o)}</p>}
          {task && <p>{task.status === "a caminho" ? `${helper?.name ?? "Funcionário"} a caminho (~${task.eta} min)` : task.status === "executando" ? `${helper?.name ?? "Funcionário"} executando · ${Math.max(0, Math.ceil((task.until ?? t0) - t0))} min restantes` : task.note}</p>}
          {o.busyUntil && <p>{o.busyLabel}: {Math.max(0, Math.ceil(o.busyUntil - t0))} min restantes.</p>}
          {o.awaitFP && <p className={styles.muted}>Aguardando você no local em 1ª pessoa (ou escolha outra opção).</p>}
          {cur && !task && !o.busyUntil && (
            <div className={styles.optionList}>
              {cur.options(sim, o).map((op) => {
                const cost = Math.round((op.cost ?? 0) * difficulty(sim.world).costMult);
                return (
                  <button key={op.id} className={styles.option} disabled={!!op.block} onClick={() => say(incidentAction(sim, o.id, op.id))}>
                    <b>{op.label}</b>
                    <span>{op.detail}</span>
                    <small>{[cost ? money(cost) : "sem custo", op.minutes ? `${op.minutes} min` : "imediato", op.role ? "delegado" : op.fp ? "pessoalmente" : ""].filter(Boolean).join(" · ")}{op.block ? ` — ${op.block}` : ""}</small>
                  </button>
                );
              })}
            </div>
          )}
          {o.stage === 0 && left > 0 && <p className={styles.muted}>Comece a agir em até {Math.ceil(left)} min de jogo para evitar consequências.</p>}
        </>
      )}
    </div>
  );
}

export function DelegacaoTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const d = dir(sim.world);
  const [kind, setKind] = useState<Exclude<TaskKind, "incidente">>("inspecionar");
  const info = TASK_INFO[kind];
  const free = staffAvailability(sim, info.role);
  const targets: { id: string; label: string }[] =
    kind === "conversar" ? sim.world.agents.filter((a) => a.role === "student" && a.active).map((a) => ({ id: a.id, label: a.name })) :
    kind === "conflito" ? d.occurrences.filter((o) => o.status === "aberta" && o.type === "confusao").map((o) => ({ id: o.id, label: `Conflito: ${o.agents.map((id) => sim.world.agents.find((a) => a.id === id)?.name.split(" ")[0]).join(" × ")}` })) :
    kind === "obra" ? sim.world.buildings.filter((b) => b.progress < 1).map((b) => ({ id: b.id, label: `${roomLabelFor(b, sim.world.buildings)} (${Math.round(b.progress * 100)}%)` })) :
    kind === "fila" ? [{ id: "cantina", label: "Cantina" }] :
    sim.world.buildings.filter((b) => b.progress >= 1 && b.kind !== "path" && b.kind !== "tactile").map((b) => ({ id: b.id, label: `${roomLabelFor(b, sim.world.buildings)} · conservação ${Math.round(b.condition)}%` }));
  const [target, setTarget] = useState("");
  const sel = targets.find((t) => t.id === target)?.id ?? targets[0]?.id ?? "";
  const t0 = sim.world.day * 1440 + sim.world.minutes;
  return (
    <>
      <section>
        <h4>Delegar uma tarefa</h4>
        <div className={styles.actions}>
          {(Object.keys(TASK_INFO) as Exclude<TaskKind, "incidente">[]).map((k) => <button key={k} className={k === kind ? styles.tabOnBtn : ""} onClick={() => { setKind(k); setTarget(""); }}>{TASK_INFO[k].label}</button>)}
        </div>
        <div className={styles.card}>
          <p>{info.effect}</p>
          <p className={styles.muted}>Disponíveis agora: {free.length ? free.map((a) => a.name).join(", ") : "ninguém dessa função livre"} · duração ~{info.minutes} min de jogo + caminhada.</p>
          {targets.length === 0 ? <p className={styles.muted}>Nenhum alvo disponível.</p> : (
            <div className={styles.actions}>
              <select value={sel} onChange={(e) => setTarget(e.target.value)}>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <button disabled={!free.length} onClick={() => say(delegate(sim, kind, sel))}>Delegar</button>
            </div>
          )}
        </div>
      </section>
      <section>
        <h4>Tarefas em andamento</h4>
        {d.tasks.length === 0 && <p className={styles.muted}>Nenhuma tarefa delegada ainda.</p>}
        {d.tasks.slice(0, 8).map((t) => {
          const a = sim.world.agents.find((x) => x.id === t.agentId);
          return (
            <div key={t.id} className={styles.listItem}>
              <b>{t.label} — {a?.name ?? "funcionário"}</b>
              <span>{t.status === "a caminho" ? `a caminho (~${t.eta} min)` : t.status === "executando" ? `executando · ${Math.max(0, Math.ceil((t.until ?? t0) - t0))} min` : t.status === "impedida" ? `impedida: ${t.note}` : `concluída${t.note ? `: ${t.note}` : ""}`}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}

export function ComunidadeTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const p = prog(sim.world);
  const g = p.gremio;
  const name = (id: string) => sim.world.agents.find((a) => a.id === id)?.name ?? "Aluno(a)";
  const prop = (id: string) => GREMIO_PROPOSALS.find((x) => x.id === id)!;
  return (
    <>
      <section>
        <h4>Grêmio Estudantil PEG</h4>
        {g.status === "nenhum" && <p className={styles.muted}>A primeira eleição acontece a partir do dia 2, quando houver pelo menos 6 alunos e espaços para as propostas.</p>}
        {g.status === "campanha" && (
          <div className={styles.card}>
            <b>Campanha em andamento — resultado no fim do dia</b>
            {g.candidates.map((c) => <p key={c.studentId}>{name(c.studentId)}: “{prop(c.proposal).title}”</p>)}
          </div>
        )}
        {g.winner && (g.status === "eleito" || g.status === "adiado") && (
          <div className={styles.card}>
            <b>{name(g.winner.studentId)} foi eleito(a): “{prop(g.winner.proposal).title}”</b>
            <p className={styles.muted}>Orçamento completo executa todas as etapas automaticamente; por etapas você aprova cada uma em Projetos; adiar desanima os apoiadores.</p>
            <div className={styles.actions}>
              <ConfirmButton label="Aprovar orçamento completo" confirm="Confirmar orçamento" onConfirm={() => say(gremioDecide(sim, "completo"))} />
              <button onClick={() => say(gremioDecide(sim, "etapas"))}>Negociar por etapas</button>
              {g.status !== "adiado" && <button onClick={() => say(gremioDecide(sim, "adiar"))}>Adiar</button>}
            </div>
          </div>
        )}
        {(g.status === "aprovado" || g.status === "etapas") && <p>Proposta em execução — acompanhe em Projetos.</p>}
        <div className={styles.card}>
          <b>Mural do Grêmio — conquistas</b>
          {g.achievements.length ? g.achievements.map((a) => <p key={a}>★ {a}</p>) : <p className={styles.muted}>Ainda sem conquistas.</p>}
        </div>
      </section>
      <section>
        <h4>Voz da escola</h4>
        <p className={styles.muted}>Pedidos nascem dos dados do dia; repetidos são agrupados. No máximo 4 ativos.</p>
        {p.voice.length === 0 && <p className={styles.muted}>Nenhum pedido por enquanto.</p>}
        {p.voice.slice(0, 8).map((v) => (
          <div key={v.id} className={styles.card}>
            <div className={styles.row}><b>{v.from}: {v.who}</b><span className={v.status === "resolvido" ? styles.ok : ""}>{v.status === "resolvido" ? "resolvido" : v.count > 1 ? `pedido ${v.count}×` : "novo"}</span></div>
            <p>{v.problem}</p>
            {v.status === "aberto" ? <p className={styles.muted}>Soluções: {v.solutions.join(" · ")} · custo estimado {money(v.cost)}</p> : <p className={styles.ok}>{v.result} Agradecimento recebido.</p>}
            {v.x !== undefined && v.status === "aberto" && <button className={styles.link} onClick={() => useHighlight.getState().show({ x: v.x!, z: v.z!, w: 6, d: 6, label: v.problem })}>Mostrar no mapa</button>}
          </div>
        ))}
      </section>
    </>
  );
}

export function TerrenoTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const owned = prog(sim.world).parcels;
  const actions = useGame((s) => s.actions);
  const diff = prog(sim.world).difficulty;
  return (
    <>
      <section>
        <h4>Lotes do terreno</h4>
        <p className={styles.muted}>O muro acompanha a área comprada; ao comprar, o trecho interno é removido. Cada lote só é cobrado uma vez.</p>
        {PARCELS.map((p) => {
          const own = owned.includes(p.id);
          const adj = parcelAdjacent(sim.world, p);
          return (
            <div key={p.id} className={styles.card}>
              <div className={styles.row}><b>{p.name}</b><span className={own ? styles.ok : ""}>{own ? "da escola" : money(parcelPrice(sim.world, p))}</span></div>
              <p className={styles.muted}>{parcelHint(p)} · {p.hint}</p>
              <div className={styles.actions}>
                <button onClick={() => actions.focusOn((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2, 70)}>Ver no mapa</button>
                {!own && <ConfirmButton label={adj ? "Comprar lote" : "Requer lote vizinho"} disabled={!adj} confirm={`Confirmar ${money(parcelPrice(sim.world, p))}`} onConfirm={() => say(buyParcel(sim, p.id))} />}
              </div>
            </div>
          );
        })}
      </section>
      <section>
        <h4>Dificuldade</h4>
        {(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => (
          <div key={k} className={styles.card}>
            <div className={styles.row}><b>{DIFFICULTY[k].label}</b>{diff === k ? <span className={styles.ok}>atual</span> : <button onClick={() => { setDifficulty(sim.world, k); say({ ok: true, message: `Dificuldade: ${DIFFICULTY[k].label}. Vale a partir de agora para custos, incidentes e prazos.` }); }}>Usar</button>}</div>
            <p className={styles.muted}>{DIFFICULTY[k].desc} Até {DIFFICULTY[k].maxOpen} incidente(s) ao mesmo tempo; prazos ×{DIFFICULTY[k].deadline}.</p>
          </div>
        ))}
      </section>
    </>
  );
}

const WALLS = ["#ece4d3", "#ddd0f0", "#cfe8e2", "#f3dcc7", "#d9e4f2", "#f2efe6"];
const FLOORS: [string, string][] = [["terrazzo", "Granilite"], ["wood", "Madeira"], ["ceramic", "Cerâmica"], ["vinyl", "Vinílico"], ["carpet", "Carpete"], ["darkwood", "Madeira escura"]];
export function PersonalizarTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const actions = useGame((s) => s.actions);
  const selectedId = useGame((s) => s.selectedBuildingId);
  const p = prog(sim.world);
  const [name, setName] = useState(sim.world.schoolName);
  const [c1, setC1] = useState(sim.world.schoolColors.primary);
  const [c2, setC2] = useState(sim.world.schoolColors.accent);
  const [paint, setPaint] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [scope, setScope] = useState<"sala" | "tipo">("sala");
  const [facade, setFacade] = useState<FacadeModel>(p.custom.facade);
  const [uni, setUni] = useState(p.custom.uniform);
  const walled = sim.world.buildings.filter((b) => b.progress >= 1 && isWalled(b) && b.kind !== "path" && b.kind !== "tactile");
  const [bId, setB] = useState(selectedId ?? walled[0]?.id ?? "");
  const targets = bId ? paintTargets(sim.world, bId, scope) : [];
  const roomCost = Math.round(((paint ? PAINT_COST : 0) + (floor ? FLOOR_COST : 0)) * targets.length * difficulty(sim.world).costMult);
  const students = sim.world.agents.filter((a) => a.role === "student").length;
  const contrast = (hex: string) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#1d1830" : "#ffffff"; };
  return (
    <>
      <section>
        <h4>Identidade (gratuito)</h4>
        <div className={styles.card}>
          <div className={styles.previewPlate} style={{ background: c1, color: contrast(c1), borderColor: c2 }}>
            <CrestSvg index={p.custom.crest} color={c2} />
            <div><small>PEG · Progressão Estudantil Gremista</small><b>{name || "Escola PEG"}</b></div>
          </div>
          <label className={styles.field}>Nome <input value={name} maxLength={42} onChange={(e) => setName(e.target.value)} /></label>
          <label className={styles.field}>Cor principal <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} /> Secundária <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} /></label>
          <div className={styles.actions}>
            {CREST_NAMES.map((n, i) => <button key={n} className={p.custom.crest === i ? styles.tabOnBtn : ""} onClick={() => { p.custom.crest = i; say({ ok: true, message: `Brasão: ${n}` }); }}><CrestSvg index={i} color={c2} small /> {n}</button>)}
          </div>
          <div className={styles.actions}><button onClick={() => { actions.setSchoolIdentity({ schoolName: name.trim() || "Escola PEG", schoolColors: { primary: c1, accent: c2 } }); say({ ok: true, message: "Identidade aplicada na placa, faixas e eventos." }); }}>Aplicar identidade</button></div>
        </div>
      </section>
      <section>
        <h4>Paredes e pisos</h4>
        <div className={styles.card}>
          <div className={styles.actions}>
            <select value={bId} onChange={(e) => setB(e.target.value)}>{walled.map((b) => <option key={b.id} value={b.id}>{roomLabelFor(b, sim.world.buildings)}</option>)}</select>
            <select value={scope} onChange={(e) => setScope(e.target.value as "sala" | "tipo")}><option value="sala">Aplicar nesta sala</option><option value="tipo">Aplicar em salas do mesmo tipo</option></select>
          </div>
          <div className={styles.swatches}>{WALLS.map((c) => <button key={c} aria-label={`Parede ${c}`} className={paint === c ? styles.swatchOn : styles.swatch} style={{ background: c }} onClick={() => setPaint(paint === c ? null : c)} />)}</div>
          <div className={styles.actions}>{FLOORS.map(([id, label]) => <button key={id} className={floor === id ? styles.tabOnBtn : ""} onClick={() => setFloor(floor === id ? null : id)}>{label}</button>)}</div>
          <div className={styles.previewRoom} style={{ background: paint ?? "#ece4d3" }}><span>{floor ? FLOORS.find((f) => f[0] === floor)?.[1] : "Piso atual"}</span></div>
          <div className={styles.row}><span>{targets.length} ambiente(s) · total {money(roomCost)}</span>
            <ConfirmButton label="Aplicar" confirm={`Confirmar ${money(roomCost)}`} disabled={!roomCost} onConfirm={() => say(applyRoomStyle(sim, bId, scope, { paint: paint ?? undefined, floor: floor ?? undefined }))} /></div>
        </div>
      </section>
      <section>
        <h4>Fachadas</h4>
        <div className={styles.actions}>{(Object.keys(FACADES) as FacadeModel[]).map((f) => <button key={f} className={facade === f ? styles.tabOnBtn : ""} onClick={() => setFacade(f)}>{FACADES[f].name}</button>)}</div>
        <p className={styles.muted}>{FACADES[facade].desc} Custo: {money(Math.round(800 * walled.length * difficulty(sim.world).costMult))} ({walled.length} prédios).</p>
        <ConfirmButton label="Aplicar fachada" confirm="Confirmar fachada" disabled={facade === p.custom.facade} onConfirm={() => say(applyFacade(sim, facade))} />
      </section>
      <section>
        <h4>Uniforme</h4>
        <div className={styles.actions}>{(["camiseta", "polo", "agasalho"] as const).map((st) => <button key={st} className={uni.style === st ? styles.tabOnBtn : ""} onClick={() => setUni({ ...uni, style: st })}>{st}</button>)}</div>
        <label className={styles.field}>Blusa <input type="color" value={uni.shirt} onChange={(e) => setUni({ ...uni, shirt: e.target.value })} /> Calça <input type="color" value={uni.pants} onChange={(e) => setUni({ ...uni, pants: e.target.value })} /></label>
        <div className={styles.uniformPreview}><i style={{ background: uni.shirt }} /><i style={{ background: uni.pants }} /></div>
        <ConfirmButton label={`Entregar uniformes · ${money(Math.round(40 * students * difficulty(sim.world).costMult))}`} confirm="Confirmar entrega" onConfirm={() => say(applyUniform(sim, uni))} />
      </section>
    </>
  );
}
export function CrestSvg({ index, color, small }: { index: number; color: string; small?: boolean }) {
  const s = small ? 18 : 40;
  const shapes = [
    <polygon key="0" points="20,8 23,16 32,16 25,21 28,30 20,25 12,30 15,21 8,16 17,16" fill={color} />,
    <path key="1" d="M8 12 Q14 9 20 12 Q26 9 32 12 V29 Q26 26 20 29 Q14 26 8 29 Z" fill={color} />,
    <path key="2" d="M20 7 C30 17 27 30 20 31 C13 30 10 17 20 7 Z" fill={color} />,
    <ellipse key="3" cx="20" cy="19" rx="7" ry="12" transform="rotate(35 20 19)" fill={color} />,
    <g key="4" fill="none" stroke={color} strokeWidth="2"><ellipse cx="20" cy="19" rx="12" ry="4" /><ellipse cx="20" cy="19" rx="12" ry="4" transform="rotate(60 20 19)" /><ellipse cx="20" cy="19" rx="12" ry="4" transform="rotate(120 20 19)" /></g>,
    <circle key="5" cx="20" cy="19" r="9" fill="none" stroke={color} strokeWidth="5" strokeDasharray="4 3" />,
  ];
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
      <path d="M4 4 H36 V20 Q36 34 20 38 Q4 34 4 20 Z" fill="#2a2140" stroke={color} strokeWidth="2" />
      {shapes[index % shapes.length]}
    </svg>
  );
}

export function PlanejamentoTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const planning = usePlanning();
  const status = planStatus(sim);
  const [name, setName] = useState("Meu bloco");
  const total = status.reduce((s, x) => s + x.cost, 0);
  const upkeep = status.reduce((s, x) => s + x.upkeep, 0);
  const seats = status.reduce((s, x) => s + x.seats, 0);
  const kinds = Object.values(BUILDABLE_BY_KIND).filter((b) => b.kind !== "path" && b.kind !== "tactile");
  const place = (kind: BuildingKind, x: number, z: number, rot: number) => placeBuilding(sim, kind, x, z, rot);
  return (
    <>
      <section>
        <h4>Modo planejamento</h4>
        <p className={styles.muted}>Desenhe construções futuras sem gastar. Cada plano é validado no terreno atual (portas, acessos e sobreposição), inclusive contra os outros planos.</p>
        <div className={styles.actions}>
          <button className={planning.active ? styles.tabOnBtn : ""} onClick={() => planning.set({ active: !planning.active })}>{planning.active ? "Planejamento ligado (toque no terreno)" : "Ligar planejamento"}</button>
          <button onClick={() => planning.set({ rot: (planning.rot + 1) % 4 })}>Girar ({planning.rot * 90}°)</button>
        </div>
        <div className={styles.actions}>
          <select value={planning.template ? `t:${planning.template}` : planning.kind ? `k:${planning.kind}` : ""} onChange={(e) => {
            const v = e.target.value;
            planning.set(v.startsWith("t:") ? { template: v.slice(2), kind: null, active: true } : { kind: v.slice(2) as BuildingKind, template: null, active: true });
          }}>
            <option value="" disabled>Escolha o que desenhar</option>
            <optgroup label="Modelos de blocos">{allTemplates(sim.world).map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}{t.custom ? " (meu)" : ""}</option>)}</optgroup>
            <optgroup label="Construções">{kinds.map((k) => <option key={k.kind} value={`k:${k.kind}`}>{k.name}</option>)}</optgroup>
          </select>
        </div>
      </section>
      <section>
        <h4>Planos ({status.length})</h4>
        <p>Custo total {money(total)} · manutenção prevista {money(upkeep)}/dia · +{seats} lugares</p>
        {status.map((st) => (
          <div key={st.plan.id} className={styles.listItem}>
            <b className={st.ok ? styles.ok : styles.bad}>{st.ok ? "✓" : "✗"} {BUILDABLE_BY_KIND[st.plan.kind].name} · {money(st.cost)}</b>
            <span>{st.ok ? "Pronto para construir" : `${st.message}${st.reason ? ` — ${st.reason}` : ""}`}</span>
            <span className={styles.actions} style={{ marginTop: 4 }}>
              <button disabled={!st.ok || sim.world.budget < st.cost} onClick={() => say(buildPlan(sim, st.plan.id, place))}>{sim.world.budget < st.cost ? "Saldo insuficiente" : "Construir esta etapa"}</button>
              <button onClick={() => { removePlan(sim.world, st.plan.id); say({ ok: true, message: "Plano removido." }); }}>Remover</button>
            </span>
          </div>
        ))}
        {status.length > 0 && (
          <div className={styles.actions}>
            <input className={styles.search} style={{ maxWidth: 180, marginBottom: 0 }} value={name} onChange={(e) => setName(e.target.value)} />
            <button onClick={() => say(saveTemplateFromPlans(sim.world, name))}>Salvar como modelo</button>
            <ConfirmButton label="Limpar planos" confirm="Apagar todos" danger onConfirm={() => { prog(sim.world).plans = []; say({ ok: true, message: "Planos apagados." }); }} />
          </div>
        )}
      </section>
    </>
  );
}
