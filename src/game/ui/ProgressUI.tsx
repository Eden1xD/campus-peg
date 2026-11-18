"use client";

import { useState } from "react";
import { BUILDABLE_BY_KIND } from "../config";
import { isWalled } from "../layout";
import {
  advanceProject,
  arcInfo,
  buildingTier,
  buyLandscape,
  buyReform,
  claimObjective,
  compInfo,
  COSMETICS,
  equipCosmetic,
  INVESTMENTS,
  invest,
  LANDSCAPE,
  OBJECTIVES,
  prepareCompetition,
  prog,
  profileOf,
  PROJECTS,
  projectTargets,
  REFORMS,
  RIVALS,
  roomLabelFor,
  scheduleCompetition,
  semesterOf,
  SPEC_LEVELS,
  SPECS,
  specLevel,
  startProject,
  type CompType,
  type CosmeticSlot,
  type SpecId,
} from "../progression";
import { getSim } from "../sim";
import styles from "./director.module.css";

type Say = (r: { ok: boolean; message: string }) => void;
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function ProjetosTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const p = prog(sim.world);
  const [pick, setPick] = useState<Record<string, string>>({});
  return (
    <>
      <section>
        <h4>Projetos em andamento</h4>
        {p.projects.filter((x) => x.status !== "concluido").length === 0 && <p className={styles.muted}>Nenhum projeto em andamento.</p>}
        {p.projects.filter((x) => x.status !== "concluido").map((x) => {
          const def = PROJECTS.find((d) => d.id === x.defId)!;
          const b = sim.world.buildings.find((bb) => bb.id === x.buildingId);
          const step = def.steps[x.step];
          return (
            <div key={x.id} className={styles.card}>
              <div className={styles.row}><b>{def.name}</b><span>{b ? roomLabelFor(b, sim.world.buildings) : "—"}</span></div>
              <ol className={styles.steps}>
                {def.steps.map((st, i) => (
                  <li key={st.name} className={i < x.step ? styles.ok : i === x.step ? "" : styles.muted}>
                    {i < x.step ? "✓ " : ""}{st.name} · {money(st.cost)} · {st.days} dia(s) — {st.benefit}
                  </li>
                ))}
              </ol>
              <div className={styles.row}>
                <span>{x.status === "andamento" ? `Etapa “${step.name}” pronta no dia ${x.readyDay}` : `Próxima etapa: ${step.name} (${money(step.cost)})`} · investido {money(x.spent)}</span>
                {x.status === "aguardando" && <button onClick={() => say(advanceProject(sim, x.id))}>Iniciar etapa</button>}
              </div>
            </div>
          );
        })}
      </section>
      <section>
        <h4>Novos projetos</h4>
        {PROJECTS.map((def) => {
          const targets = projectTargets(sim.world, def);
          const lvl = specLevel(sim.world, def.spec);
          const sel = pick[def.id] ?? targets[0]?.id ?? "";
          const total = def.steps.reduce((s, st) => s + st.cost, 0);
          const days = def.steps.reduce((s, st) => s + st.days, 0);
          return (
            <div key={def.id} className={styles.card}>
              <div className={styles.row}><b>{def.name}</b><span>{SPECS[def.spec].name}</span></div>
              <p className={styles.muted}>{def.steps.length} etapas · {money(total)} no total · cerca de {days} dias de jogo · requer {def.kinds.map((k) => BUILDABLE_BY_KIND[k]?.name).join(" ou ")}{def.minSpec ? ` e ${SPECS[def.spec].name} nível ${def.minSpec}` : ""}.</p>
              {lvl < def.minSpec ? <p className={styles.bad}>Bloqueado: {SPECS[def.spec].name} nível {lvl}/{def.minSpec}.</p> : targets.length === 0 ? <p className={styles.muted}>Nenhum prédio disponível para este projeto.</p> : (
                <div className={styles.actions}>
                  <select value={sel} onChange={(e) => setPick({ ...pick, [def.id]: e.target.value })}>
                    {targets.map((b) => <option key={b.id} value={b.id}>{roomLabelFor(b, sim.world.buildings)}</option>)}
                  </select>
                  <button onClick={() => say(startProject(sim, def.id, sel))}>Iniciar · {money(def.steps[0].cost)}</button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}

export function EscolaTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const p = prog(sim.world);
  const [bId, setB] = useState("");
  const walled = sim.world.buildings.filter((b) => b.progress >= 1 && isWalled(b) && b.kind !== "path" && b.kind !== "tactile");
  const sel = walled.find((b) => b.id === bId) ?? walled[0];
  const nextReform = sel ? REFORMS.find((r) => r.tier === buildingTier(sel) + 1) : null;
  const nextLand = LANDSCAPE.find((l) => l.level === p.landscape + 1);
  const sem = semesterOf(sim.world.day);
  return (
    <>
      <section>
        <h4>Ano {sem.year} · {sem.semester}º semestre · dia {sem.dayInSemester} de 8</h4>
        <p className={styles.muted}>A cada 8 dias sai o relatório por turma; a cada 16, a formatura e a chegada de uma nova turma. Construções e melhorias são preservadas.</p>
      </section>
      <section>
        <h4>Decisão de investimento do dia</h4>
        {p.investDay === sim.world.day ? (
          <p>Hoje: <b>{INVESTMENTS.find((i) => i.id === p.investId)?.name}</b>. Volte amanhã para escolher outra prioridade.</p>
        ) : (
          INVESTMENTS.map((inv) => (
            <div key={inv.id} className={styles.card}>
              <div className={styles.row}><b>{inv.name}</b><button onClick={() => say(invest(sim, inv.id))}>{money(inv.cost)}</button></div>
              <p className={styles.muted}>{inv.effect}</p>
            </div>
          ))
        )}
      </section>
      <section>
        <h4>Especializações (combináveis)</h4>
        {(Object.keys(SPECS) as SpecId[]).map((s) => {
          const lvl = specLevel(sim.world, s);
          const xp = p.specs[s];
          const next = SPEC_LEVELS[lvl + 1];
          return (
            <div key={s} className={styles.card}>
              <div className={styles.row}><b style={{ color: SPECS[s].color }}>{SPECS[s].name}</b><span>nível {lvl} · {xp} XP{next ? ` / ${next}` : " (máx.)"}</span></div>
              <div className={styles.bar}><i style={{ width: `${next ? Math.min(100, (xp / next) * 100) : 100}%`, background: SPECS[s].color }} /></div>
              <p className={styles.muted}>Libera: {SPECS[s].unlocks.map((u, i) => (i <= lvl ? `✓ ${u}` : u)).join(" · ")}</p>
            </div>
          );
        })}
        <p className={styles.muted}>Ganhe XP concluindo etapas de projetos, competições e investimentos relacionados.</p>
      </section>
      <section>
        <h4>Reformas (aparecem na fachada)</h4>
        {walled.length === 0 ? <p className={styles.muted}>Nenhum prédio pronto.</p> : (
          <div className={styles.card}>
            <div className={styles.actions}>
              <select value={sel?.id} onChange={(e) => setB(e.target.value)}>
                {walled.map((b) => <option key={b.id} value={b.id}>{roomLabelFor(b, sim.world.buildings)} · nível {buildingTier(b)}</option>)}
              </select>
            </div>
            {nextReform ? (
              <>
                <p><b>{nextReform.name}</b> · {money(nextReform.cost)} · manutenção {money(nextReform.upkeep)}/dia</p>
                <p className={styles.muted}>{nextReform.benefit}</p>
                <div className={styles.actions}><button onClick={() => sel && say(buyReform(sim, sel.id))}>Reformar</button></div>
              </>
            ) : <p className={styles.ok}>Nível máximo neste prédio.</p>}
          </div>
        )}
      </section>
      <section>
        <h4>Paisagismo do campus · nível {p.landscape}</h4>
        {nextLand ? (
          <div className={styles.card}>
            <p><b>{nextLand.name}</b> · {money(nextLand.cost)} · manutenção {money(nextLand.upkeep)}/dia</p>
            <p className={styles.muted}>{nextLand.benefit}</p>
            <div className={styles.actions}><button onClick={() => say(buyLandscape(sim))}>Implantar</button></div>
          </div>
        ) : <p className={styles.ok}>Paisagismo completo.</p>}
      </section>
    </>
  );
}

export function CompeticoesTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const p = prog(sim.world);
  const [type, setType] = useState<CompType>("esportiva");
  const [rival, setRival] = useState(RIVALS[0].id);
  const scheduled = p.competitions.find((c) => c.status === "agendada");
  return (
    <>
      <section>
        <h4>Escolas rivais (fictícias)</h4>
        {RIVALS.map((r) => <div key={r.id} className={styles.listItem}><b>{r.name}</b><span>{r.note}</span></div>)}
      </section>
      <section>
        <h4>Competição agendada</h4>
        {scheduled ? (
          <div className={styles.card}>
            <b>{compInfo(scheduled.type).name} × {RIVALS.find((r) => r.id === scheduled.rivalId)?.name}</b>
            <p>Dia {scheduled.day}, 13h, no campus (acompanhe em 1ª pessoa). Preparação {scheduled.prep}%.</p>
            <div className={styles.bar}><i style={{ width: `${scheduled.prep}%` }} /></div>
            <p className={styles.muted}>O resultado depende de: nível da especialização, preparação, ânimo/energia/aprendizagem dos alunos e espaço reformado ou com projeto.</p>
            <div className={styles.actions}><button onClick={() => say(prepareCompetition(sim, scheduled.id))}>Distribuir recursos (+20%) · R$ 500</button></div>
          </div>
        ) : (
          <div className={styles.card}>
            <div className={styles.actions}>
              <select value={type} onChange={(e) => setType(e.target.value as CompType)}>
                {(["esportiva", "cientifica", "cultural"] as CompType[]).map((t) => <option key={t} value={t}>{compInfo(t).name}</option>)}
              </select>
              <select value={rival} onChange={(e) => setRival(e.target.value)}>
                {RIVALS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button onClick={() => say(scheduleCompetition(sim, type, rival))}>Agendar (daqui a 2 dias)</button>
            </div>
            <p className={styles.muted}>Requer: {compInfo(type).venues.map((k) => BUILDABLE_BY_KIND[k]?.name).join(" ou ")}.</p>
          </div>
        )}
      </section>
      <section>
        <h4>Resultados</h4>
        {p.competitions.filter((c) => c.status === "concluida").slice(-5).reverse().map((c) => (
          <div key={c.id} className={styles.card}>
            <div className={styles.row}><b>{compInfo(c.type).name} · dia {c.day}</b><span className={c.won ? styles.ok : styles.bad}>{c.won ? "Vitória" : "Derrota"} {c.ourScore} × {c.rivalScore}</span></div>
            <ul className={styles.checks}>{c.explanation?.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        ))}
      </section>
    </>
  );
}

export function ConquistasTab({ say }: { say: Say }) {
  const sim = getSim()!;
  const p = prog(sim.world);
  const slots: [CosmeticSlot, string][] = [["pintura", "Pintura das salas"], ["banco", "Bancos"], ["jardim", "Jardins"], ["placa", "Placas"], ["acessorio", "Acessório do diretor"]];
  return (
    <>
      <section>
        <h4>Objetivos de vários dias</h4>
        {OBJECTIVES.map((o) => {
          const req = o.requires?.(sim.world) ?? null;
          const prg = o.progress(sim.world);
          const claimed = p.claimed.includes(o.id);
          return (
            <div key={o.id} className={styles.card}>
              <div className={styles.row}><b>{o.title}</b><span>{Math.min(prg, o.target)}/{o.target}</span></div>
              <p className={styles.muted}>{o.how} Recompensa: {money(o.reward.money)}, +{o.reward.rep} reputação e {COSMETICS[o.reward.cosmetic].name}.</p>
              {req ? <p className={styles.bad}>{req}</p> : (
                <div className={styles.actions}><button disabled={claimed || prg < o.target} onClick={() => say(claimObjective(sim, o.id))}>{claimed ? "Resgatado" : "Resgatar"}</button></div>
              )}
            </div>
          );
        })}
      </section>
      <section>
        <h4>Itens cosméticos</h4>
        {slots.map(([slot, label]) => {
          const owned = p.cosmetics.filter((id) => COSMETICS[id]?.slot === slot);
          return (
            <div key={slot} className={styles.row}>
              <span>{label}</span>
              <select value={p.equipped[slot] ?? ""} onChange={(e) => { equipCosmetic(sim.world, e.target.value || null, slot); say({ ok: true, message: "Visual aplicado." }); }}>
                <option value="">Padrão</option>
                {owned.map((id) => <option key={id} value={id}>{COSMETICS[id].name}</option>)}
              </select>
            </div>
          );
        })}
        <p className={styles.muted}>Itens são conquistados jogando — sem compras com dinheiro real.</p>
      </section>
    </>
  );
}

export function AlbumTab() {
  const sim = getSim()!;
  const p = prog(sim.world);
  return (
    <section>
      <h4>Álbum de memórias</h4>
      {[...p.album].reverse().map((a, i) => (
        <div key={i} className={styles.listItem}><b>Dia {a.day} · {a.title}</b><span>{a.text}</span></div>
      ))}
      {p.semesterReports.length > 0 && <h4>Relatórios de semestre</h4>}
      {[...p.semesterReports].reverse().map((r) => (
        <div key={r.semester} className={styles.card}><b>{r.semester}º semestre (dia {r.day})</b>{r.lines.map((l) => <p key={l} className={styles.muted}>{l}</p>)}</div>
      ))}
    </section>
  );
}

export function StudentStory({ id }: { id: string }) {
  const sim = getSim()!;
  const p = prog(sim.world);
  const prof = profileOf(sim.world, id);
  const arcs = p.arcs.filter((a) => a.studentId === id);
  return (
    <div className={styles.card}>
      <p>Ponto forte: <b>{prof.strength}</b> · Dificuldade: <b>{prof.difficulty}</b></p>
      {arcs.map((a) => (
        <p key={a.id}>
          <b>{arcInfo(a.type).name}</b>: {a.status === "ativa" ? arcInfo(a.type).stages[Math.min(a.stage, 3)] : a.outcome}
          {a.status === "ativa" && <span className={styles.muted}> · conversar e elogiar ajudam; advertências atrapalham</span>}
        </p>
      ))}
    </div>
  );
}
