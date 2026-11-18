"use client";

import { useMemo, useState } from "react";
import { useGame, type Panel } from "../store";
import { Icon } from "./icons";
import styles from "./game.module.css";
import {
  BUILDABLES,
  BUILD_DURATION_MINUTES_PER_HOUR,
  EVENTS,
  IMPROVEMENTS,
  MISSION_DEFS,
  MODES,
  STAFF_ROLES,
  formatClock,
  formatMoney,
} from "../config";
import { furnitureFor, isWalled, specFor } from "../layout";
import {
  buildingStage,
  friendGroups,
  getSim,
  minutesToHours,
  phaseLabel,
  schoolReport,
  scheduleConflicts,
  studentsNeedingHelp,
  totalSeats,
} from "../sim";
import type { BuildingKind, GameMode, QualityTier } from "../types";

function PanelShell({
  title,
  subtitle,
  children,
  onClose,
  narrow,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  narrow?: boolean;
}) {
  return (
    <section aria-label={title} className={`peg-management ${styles.panel} ${narrow ? styles.panelNarrow : ""}`}>
      <style>{`
        .peg-management {box-sizing:border-box; height:fit-content; bottom:auto; max-height:calc(100% - 106px); display:flex;flex-direction:column;}
        .peg-management > header {flex:none}
        .peg-management > .${styles.panelBody} {min-height:0; overflow-y:auto; overscroll-behavior:contain}
        .peg-management details {border-bottom:1px solid var(--border,#61576d);padding:6px 0}
        .peg-management summary {cursor:pointer;padding:7px 0;font-weight:600}
        .peg-management .peg-section {display:grid;gap:10px;padding:8px 0}
        .peg-management .peg-filter {display:grid;grid-template-columns:minmax(0,1fr) minmax(7em,40%);gap:6px}
        .peg-filter input,.peg-filter select {width:100%;min-width:0;box-sizing:border-box}
        .peg-management .peg-item {display:grid;gap:5px}
        @media(max-width:700px) {
          .peg-management {inset:auto 8px 12px; width:auto;max-width:none;max-height:52dvh}
        }
      `}</style>
      <header className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {subtitle && <div className={styles.panelSub}>{subtitle}</div>}
        </div>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Fechar painel">
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function realSeats(kind: BuildingKind) {
  const spec = specFor(kind);
  return furnitureFor(kind, spec.w, spec.d).filter((item) => item.seat).length;
}

function NeedBar({ label, value }: { label: string; value: number }) {
  const color = value > 65 ? "var(--good)" : value > 35 ? "var(--warn)" : "var(--bad)";
  return (
    <div className={styles.needRow}>
      <span className={styles.muted}>{label}</span>
      <div className={styles.progress}>
        <div className={styles.progressFill} style={{ width: `${Math.max(2, value)}%`, background: color }} />
      </div>
      <span className={styles.tabular}>{Math.round(value)}</span>
    </div>
  );
}

function BuildPanel() {
  const actions = useGame((s) => s.actions);
  const reputation = useGame((s) => s.snapshot?.reputation ?? 0);
  const budget = useGame((s) => s.snapshot?.budget ?? 0);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("todas");
  const categories = { todas:"Todas", ensino:"Ensino", convivencia:"Convivência", esportes:"Esportes", administracao:"Administração", apoio:"Apoio", circulacao:"Circulação", acessibilidade:"Acessibilidade" };
  const items = useMemo(
    () =>
      BUILDABLES.filter(
        (item) =>
          (category === "todas" || item.category === category) &&
          (search.trim() === "" || item.name.toLowerCase().includes(search.trim().toLowerCase()) || item.description.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [category, search],
  );
  return (
    <PanelShell
      title="Construir"
      onClose={() => actions.setPanel("none")}
    >
      <div className={`${styles.field} peg-filter`}>
        <input type="search" aria-label="Buscar instalação" placeholder="Buscar instalação" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Categoria" value={category} onChange={(event) => setCategory(event.target.value)}>
          {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {items.length === 0 && <p className={styles.muted}>Nenhuma instalação encontrada.</p>}
      {items.map((item) => {
        const locked = reputation < item.minReputation;
        const seats = realSeats(item.kind);
        const minutes = item.hours * BUILD_DURATION_MINUTES_PER_HOUR;
        return (
          <div key={item.kind} className={`${styles.card} peg-item`}>
            <div className={styles.between}>
              <strong><Icon name={item.icon} size={15} /> {item.name}</strong>
              <span className={budget < item.cost ? styles.warn : styles.tabular}>{formatMoney(item.cost)}</span>
            </div>
            <div className={styles.between}>
              <details><summary>Detalhes</summary>
                <div className={styles.small}>{item.description}</div>
                <p className={styles.tiny}>{item.w} × {item.d} m · {seats} assentos · {minutes ? minutesToHours(minutes) : "Imediato"}</p>
                <p className={styles.tiny}>{item.impact}</p>
              </details>
              <button type="button" className={styles.btn} disabled={locked}
                aria-label={`Posicionar ${item.name}`}
                onClick={() => { actions.beginBuild(item.kind); actions.setPanel("none"); }}>
                {locked ? `Reputação ${item.minReputation}` : "Posicionar"}
              </button>
            </div>
          </div>
        );
      })}
    </PanelShell>
  );
}

function MissionsPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  return (
    <PanelShell title="Missões" subtitle="Recompensas locais do protótipo (sem XP oficial do PEG)" onClose={() => actions.setPanel("none")}>
      {snapshot.missions.map((mission) => {
        const def = MISSION_DEFS.find((d) => d.id === mission.id);
        if (!def) return null;
        const pct = Math.min(100, (mission.progress / Math.max(1, mission.target)) * 100);
        return (
          <div key={mission.id} className={styles.card}>
            <div className={styles.between}>
              <div className={styles.row} style={{ gap: 7 }}>
                <Icon name={def.icon} size={16} />
                <span className={styles.strong}>{def.title}</span>
              </div>
              <span className={`${styles.tag} ${def.difficulty === "Difícil" || def.difficulty === "Muito difícil" ? styles.pillWarn : ""}`}>{def.difficulty}</span>
            </div>
            <div className={`${styles.small} ${styles.muted}`}>{def.description}</div>
            <div className={styles.progress}>
              <div className={`${styles.progressFill} ${mission.completed ? styles.progressFillGood : ""}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`${styles.tiny} ${styles.muted}`}>
              {Math.min(mission.progress, mission.target)}/{mission.target} {def.unit}
            </div>
            <div className={`${styles.tiny} ${styles.muted}`}>
              <Icon name="spark" size={11} /> {def.hint}
            </div>
            <div className={styles.row}>
              <span className={`${styles.tag} ${styles.pillGood}`}>{formatMoney(def.reward)}</span>
              <span className={styles.tag}>+{def.reputation} reputação</span>
              {mission.completed && !mission.claimed && (
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnGood}`} onClick={() => actions.claimMissionReward(mission.id)}>
                  Resgatar
                </button>
              )}
              {mission.claimed && <span className={`${styles.tag} ${styles.pillGood}`}>resgatada</span>}
              {def.teleport && !mission.claimed && (
                <button className={styles.btn} style={{ padding: "4px 8px" }} onClick={() => actions.focusOn(def.teleport!.x, def.teleport!.z, 32)}>
                  Ver local
                </button>
              )}
            </div>
          </div>
        );
      })}
    </PanelShell>
  );
}

function AgentsPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const selected = useGame((s) => s.selectedAgentId);
  const actions = useGame((s) => s.actions);
  const [filter, setFilter] = useState<"todos" | "student" | "staff">("todos");
  const [enrolled, setEnrolled] = useState(snapshot?.enrolled ?? 10);
  if (!snapshot) return null;
  const agents = snapshot.agents.filter((agent) =>
    filter === "todos" ? true : filter === "student" ? agent.role === "student" : agent.role !== "student",
  );
  return (
    <PanelShell title="Pessoas na escola" subtitle={`${snapshot.agents.length} presentes agora`} onClose={() => actions.setPanel("none")}>
      <div className={styles.card}>
        <div className={styles.between}>
          <span className={styles.strong}>Matrículas</span>
          <span className={styles.tag}>{snapshot.enrolled} alunos · {snapshot.stats.seatsTotal} assentos</span>
        </div>
        <div className={styles.row}>
          <input
            type="number"
            min={0}
            max={30}
            value={enrolled}
            onChange={(event) => setEnrolled(Number(event.target.value))}
            style={{ width: 74, background: "var(--panel-soft)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "6px 8px" }}
          />
          <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnPrimary}`} onClick={() => actions.setEnrolled(enrolled)}>
            Aplicar
          </button>
          <span className={`${styles.tiny} ${styles.muted}`}>A capacidade vem das carteiras/mesas construídas.</span>
        </div>
      </div>
      <div className={styles.searchRow}>
        {(["todos", "student", "staff"] as const).map((item) => (
          <button key={item} className={`${styles.btn} ${styles.btnSmall} ${filter === item ? styles.btnPrimary : ""}`} onClick={() => setFilter(item)}>
            {item === "todos" ? "Todos" : item === "student" ? "Alunos" : "Equipe"}
          </button>
        ))}
      </div>
      {agents.length === 0 && <div className={`${styles.small} ${styles.muted}`}>Fora do horário letivo. Avance o tempo ou ajuste a velocidade.</div>}
      {agents.map((agent) => (
        <button
          key={agent.id}
          className={`${styles.card} ${styles.cardSelectable} ${selected === agent.id ? styles.buildCardCheap : ""}`}
          onClick={() => {
            actions.selectAgent(agent.id);
            actions.focusOn(agent.x, agent.z, 22);
          }}
        >
          <div className={styles.between}>
            <span className={styles.strong}>{agent.name}</span>
            <span className={styles.tag}>{agent.role === "student" ? "aluno" : agent.role}</span>
          </div>
          <div className={`${styles.tiny} ${styles.muted}`}>{agent.activity} · {agent.destination}</div>
          <div className={`${styles.tiny} ${agent.mood > 60 ? styles.good : agent.mood > 35 ? styles.warn : styles.bad}`}>Humor {agent.mood}%</div>
        </button>
      ))}
    </PanelShell>
  );
}

function StaffPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  const payroll = snapshot.staff.reduce((sum, member) => sum + member.salary, 0);
  return (
    <PanelShell title="Equipe" subtitle={`Folha diária ${formatMoney(payroll)} · descontada às 7h10`} onClose={() => actions.setPanel("none")}>
      {snapshot.staff.map((member) => (
        <div key={member.id} className={styles.card}>
          <div className={styles.between}>
            <span className={styles.strong}>{member.name}</span>
            <span className={styles.tag}>{member.role}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.tag}>habilidade {member.skill}</span>
            <span className={styles.tag}>{formatMoney(member.salary)}/dia</span>
            <span className={styles.tag}>descanso {Math.round(member.rest)}%</span>
          </div>
          <div className={styles.progress}>
            <div className={styles.progressFill} style={{ width: `${member.rest}%` }} />
          </div>
          <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={() => actions.fire(member.id)}>
            Desligar
          </button>
        </div>
      ))}
      <div className={`${styles.small} ${styles.strong}`}>Contratar</div>
      {STAFF_ROLES.map((role) => (
        <div key={role.role} className={styles.card}>
          <div className={styles.between}>
            <span className={styles.strong}>{role.label}</span>
            <span className={styles.tag}>{formatMoney(role.cost)} + {formatMoney(role.salary)}/dia</span>
          </div>
          <div className={`${styles.tiny} ${styles.muted}`}>{role.description}</div>
          <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnPrimary}`} onClick={() => actions.hire(role.role)}>
            <Icon name="staff" size={12} /> Contratar
          </button>
        </div>
      ))}
    </PanelShell>
  );
}

function SchedulePanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  const sim = getSim();
  const schedule = sim ? scheduleConflicts(sim) : snapshot.schedule;
  const classroomSeats = snapshot.stats.seatsTotal;
  const teachers = snapshot.staff.filter((member) => member.role === "teacher");
  return (
    <PanelShell title="Horário escolar" subtitle="Turmas, salas, professores e conflitos detectados" onClose={() => actions.setPanel("none")}>
      {snapshot.groups.map((group) => (
        <div key={group.id} className={styles.card}>
          <div className={styles.between}>
            <span className={styles.strong}>{group.name}</span>
            <span className={styles.tag}>{group.students} alunos</span>
          </div>
          <div className={`${styles.tiny} ${styles.muted}`}>Capacidade total real da escola: {classroomSeats} assentos</div>
        </div>
      ))}
      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => actions.autoSchedule()}>
        <Icon name="rotate" size={14} /> Reorganizar automaticamente
      </button>
      <div className={`${styles.tiny} ${styles.muted}`}>Professores: {teachers.length} · salas construídas: {snapshot.buildings.filter((b) => b.kind === "classroom" && b.progress >= 1).length}</div>
      {schedule.map((slot) => {
        const group = snapshot.groups.find((g) => g.id === slot.groupId);
        const room = snapshot.buildings.find((b) => b.id === slot.buildingId);
        return (
          <div key={slot.id} className={styles.card}>
            <div className={styles.between}>
              <span className={`${styles.small} ${styles.strong}`}>{slot.subject}</span>
              <span className={styles.tag}>{formatClock(slot.start)}–{formatClock(slot.end)}</span>
            </div>
            <div className={`${styles.tiny} ${styles.muted}`}>
              {group?.name} · {room ? specFor(room.kind).name : "sem sala"} · {room && room.progress < 1 ? "obra em andamento" : "disponível"}
            </div>
            {slot.conflict && <div className={`${styles.tiny} ${styles.bad}`}>{slot.conflict}</div>}
          </div>
        );
      })}
      <div className={`${styles.card} ${styles.tiny}`}>
        <span className={styles.strong}>Conflitos verificados</span>
        <span className={styles.muted}>Mesma sala em dois grupos, professor ausente, capacidade real de assentos e tempo de deslocamento entre salas.</span>
      </div>
    </PanelShell>
  );
}

function FinancePanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  const report = getSim() ? schoolReport(getSim()!) : null;
  return (
    <PanelShell title="Finanças" subtitle={`Verba diária ${formatMoney(MODES[snapshot.modes].grant)} · folha ${formatMoney(report?.payroll ?? 0)}`} onClose={() => actions.setPanel("none")}>
      <div className={styles.grid2}>
        <div className={styles.card}>
          <span className={styles.muted}>Saldo</span>
          <span className={styles.strong}>{formatMoney(snapshot.budget)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.muted}>Receita cantina hoje</span>
          <span className={styles.strong}>{formatMoney(snapshot.daily.servedMeals * 7)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.muted}>Refeições servidas</span>
          <span className={styles.strong}>{snapshot.daily.servedMeals}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.muted}>Obras ativas</span>
          <span className={styles.strong}>{snapshot.activeWorks}</span>
        </div>
      </div>
      <div className={`${styles.card} ${styles.tiny}`}>
        <span className={styles.strong}>Previsão</span>
        <span className={styles.muted}>
          Amanhã: +{formatMoney(MODES[snapshot.modes].grant)} de verba · −{formatMoney(report?.payroll ?? 0)} de salários · utilidades proporcionais aos prédios ativos e melhorias.
        </span>
      </div>
      <div className={`${styles.small} ${styles.strong}`}>Histórico explicado</div>
      {snapshot.ledger.length === 0 && <div className={`${styles.tiny} ${styles.muted}`}>Nenhum lançamento ainda.</div>}
      {snapshot.ledger.map((entry) => (
        <div key={entry.id} className={styles.card}>
          <div className={styles.between}>
            <span className={`${styles.small} ${styles.strong}`}>{entry.label}</span>
            <span className={`${styles.small} ${entry.amount >= 0 ? styles.good : styles.bad}`}>{entry.amount >= 0 ? "+" : ""}{formatMoney(entry.amount)}</span>
          </div>
          <div className={`${styles.tiny} ${styles.muted}`}>{entry.detail} · dia {Math.floor(entry.at / 1440) || 1} {formatClock(entry.at % 1440)}</div>
        </div>
      ))}
    </PanelShell>
  );
}

function StockPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  const sim = getSim();
  const buy = (key: "food" | "supplies" | "cleaning" | "materials", amount: number, unit: number) => {
    if (!sim) return;
    const cost = amount * unit;
    if (sim.world.budget < cost) {
      actions.notify("warn", "Saldo insuficiente", `Compra de ${amount} un. custa ${formatMoney(cost)}.`);
      return;
    }
    sim.world.budget -= cost;
    sim.world.stock[key] += amount;
    sim.world.ledger.unshift({
      id: `stock-${Date.now()}`,
      at: sim.world.day * 1440 + sim.world.minutes,
      amount: -cost,
      label: "Compra de estoque",
      detail: `${amount} un. de ${key}`,
      category: "estoque",
    });
    actions.refresh();
  };
  const entries: { key: "food" | "supplies" | "cleaning" | "materials"; label: string; unit: number }[] = [
    { key: "food", label: "Alimentos (merenda)", unit: 4 },
    { key: "supplies", label: "Materiais escolares", unit: 2 },
    { key: "cleaning", label: "Produtos de limpeza", unit: 3 },
    { key: "materials", label: "Peças de manutenção", unit: 6 },
  ];
  return (
    <PanelShell title="Estoque & logística" subtitle="Chegadas pela entrada de serviço · reposição automática opcional" onClose={() => actions.setPanel("none")}>
      <label className={`${styles.row} ${styles.small}`}>
        <input
          type="checkbox"
          checked={snapshot.stock.autoReorder}
          onChange={() => {
            if (!sim) return;
            sim.world.stock.autoReorder = !sim.world.stock.autoReorder;
            actions.refresh();
          }}
        />
        Reposição automática ao atingir o mínimo
      </label>
      {entries.map((entry) => {
        const value = snapshot.stock[entry.key];
        const min = snapshot.stock.min[entry.key];
        const critical = value < min;
        return (
          <div key={entry.key} className={styles.card}>
            <div className={styles.between}>
              <span className={styles.strong}>{entry.label}</span>
              <span className={`${styles.tag} ${critical ? styles.pillBad : styles.pillGood}`}>{value.toFixed(0)} un.</span>
            </div>
            <div className={`${styles.tiny} ${critical ? styles.bad : styles.muted}`}>mínimo {min} un. · {critical ? "reposição necessária" : "nível saudável"}</div>
            <div className={styles.row}>
              <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnPrimary}`} onClick={() => buy(entry.key, 20, entry.unit)}>
                Comprar 20 · {formatMoney(entry.unit * 20)}
              </button>
            </div>
          </div>
        );
      })}
      <div className={`${styles.card} ${styles.tiny}`}>
        <span className={styles.strong}>Conservação</span>
        {snapshot.buildings
          .filter((b) => b.progress >= 1 && b.kind !== "path" && b.kind !== "tactile")
          .slice(0, 8)
          .map((building) => (
            <span key={building.id} className={styles.muted}>
              {specFor(building.kind).name}: conservação {Math.round(building.condition)}% · sujeira {Math.round(building.dirt)}%
            </span>
          ))}
      </div>
      <div className={`${styles.tiny} ${styles.muted}`}>Sem produtos de limpeza, sujeira e filas de manutenção crescem e a satisfação cai.</div>
    </PanelShell>
  );
}

function ImprovementsPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  const selected = useGame((s) => s.selectedBuildingId);
  if (!snapshot) return null;
  const walled = snapshot.buildings.filter((b) => ["classroom", "canteen", "library", "lab", "computer", "arts", "auditorium", "reception", "staffroom", "bathroom", "infirmary", "makerspace"].includes(b.kind));
  return (
    <PanelShell title="Melhorias" subtitle="Custo e efeito claro no cenário e nos indicadores" onClose={() => actions.setPanel("none")}>
      <div className={`${styles.card} ${styles.small}`}>
        <span className={styles.strong}>Rota acessível por prédio · {formatMoney(1200)}</span>
        <span className={`${styles.tiny} ${styles.muted}`}>Escolha o prédio. Sem rota, Ana (cadeirante) não consegue entrar e o indicador de acessibilidade cai.</span>
        {walled.map((building) => (
          <div key={building.id} className={styles.between}>
            <span className={styles.tiny}>{specFor(building.kind).name}</span>
            {building.accessible ? (
              <span className={`${styles.tag} ${styles.pillGood}`}>acessível</span>
            ) : (
              <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => actions.makeAccessible(building.id)}>
                Instalar · {formatMoney(1200)}
              </button>
            )}
          </div>
        ))}
        {selected && <div className={`${styles.tiny} ${styles.muted}`}>Prédio selecionado no mapa: {specFor(snapshot.buildings.find((b) => b.id === selected)?.kind ?? "classroom").name}</div>}
      </div>
      {IMPROVEMENTS.filter((item) => item.id !== "accessible").map((improvement) => {
        const applied = getSim()?.world.improvements.includes(improvement.id) ?? false;
        return (
          <div key={improvement.id} className={styles.card}>
            <div className={styles.between}>
              <div className={styles.row} style={{ gap: 6 }}>
                <Icon name={improvement.icon} size={15} />
                <span className={styles.strong}>{improvement.name}</span>
              </div>
              <span className={styles.tag}>{applied ? "instalado" : formatMoney(improvement.cost)}</span>
            </div>
            <div className={`${styles.tiny} ${styles.muted}`}>{improvement.description}</div>
            <div className={`${styles.tiny} ${styles.good}`}>{improvement.effect}</div>
            <button className={`${styles.btn} ${styles.btnSmall} ${applied ? "" : styles.btnPrimary}`} disabled={applied} onClick={() => actions.buyImprovement(improvement.id)}>
              {applied ? "Aplicado" : "Instalar melhoria"}
            </button>
          </div>
        );
      })}
    </PanelShell>
  );
}

function EventsPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  if (!snapshot) return null;
  const minutes = snapshot.day * 1440 + snapshot.minutes;
  return (
    <PanelShell title="Eventos escolares" subtitle="Preparação → realização → resultado no cenário" onClose={() => actions.setPanel("none")}>
      {snapshot.events.length > 0 && (
        <div className={`${styles.small} ${styles.strong}`}>Agenda</div>
      )}
      {snapshot.events.map((event) => {
        const start = event.startsAt - minutes;
        return (
          <div key={event.id} className={styles.card}>
            <div className={styles.between}>
              <span className={styles.strong}>{event.name}</span>
              <span className={styles.tag}>{event.status === "preparing" ? "preparação" : event.status === "running" ? "acontecendo" : "encerrado"}</span>
            </div>
            {event.status === "preparing" && <div className={`${styles.tiny} ${styles.muted}`}>Começa em {minutesToHours(Math.max(0, start))} · barracas aparecem no pátio</div>}
            {event.status === "running" && <div className={`${styles.tiny} ${styles.good}`}>Público em circulação, som e decoração ativos.</div>}
            {event.result && <div className={`${styles.tiny} ${styles.muted}`}>{event.result} · {event.attendance} participantes</div>}
          </div>
        );
      })}
      {EVENTS.map((event) => {
        const missingVenue = !event.venue.some((kind) => snapshot.buildings.some((b) => b.kind === kind && b.progress >= 1));
        const locked = snapshot.reputation < event.requiredReputation;
        return (
          <div key={event.id} className={styles.card}>
            <div className={styles.between}>
              <div className={styles.row} style={{ gap: 6 }}>
                <Icon name={event.icon} size={15} />
                <span className={styles.strong}>{event.name}</span>
              </div>
              <span className={styles.tag}>{formatMoney(event.cost)}</span>
            </div>
            <div className={`${styles.tiny} ${styles.muted}`}>{event.description}</div>
            <div className={`${styles.tiny} ${styles.muted}`}>Preparação {minutesToHours(event.prep)} · duração {minutesToHours(event.duration)} · reputação mín. {event.requiredReputation}</div>
            {missingVenue && <div className={`${styles.tiny} ${styles.warn}`}>Local necessário: {event.venue.map((kind) => specFor(kind).name).join(" ou ")}</div>}
            {locked && <div className={`${styles.tiny} ${styles.warn}`}>Reputação insuficiente ({snapshot.reputation}/{event.requiredReputation}).</div>}
            <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnPrimary}`} disabled={locked || missingVenue} onClick={() => actions.runEvent(event.id)}>
              <Icon name="trophy" size={12} /> Agendar evento
            </button>
          </div>
        );
      })}
    </PanelShell>
  );
}

function ReportPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  const overlay = useGame((s) => s.overlay);
  if (!snapshot) return null;
  const sim = getSim();
  const report = sim ? schoolReport(sim) : null;
  const help = sim ? studentsNeedingHelp(sim) : [];
  const friends = sim ? friendGroups(sim.world) : [];
  const overlays: { key: typeof overlay; label: string }[] = [
    { key: "occupancy", label: "Lotação" },
    { key: "cleanliness", label: "Limpeza" },
    { key: "condition", label: "Conservação" },
    { key: "accessibility", label: "Acessibilidade" },
    { key: "seats", label: "Assentos" },
  ];
  return (
    <PanelShell title="Relatório da escola" subtitle={`Dia ${snapshot.day} · ${phaseLabel(snapshot.minutes)}`} onClose={() => actions.setPanel("none")}>
      <div className={styles.searchRow}>
        {overlays.map((item) => (
          <button
            key={item.key}
            className={`${styles.btn} ${styles.btnSmall} ${overlay === item.key ? styles.btnPrimary : ""}`}
            onClick={() => actions.setOverlay(overlay === item.key ? "none" : item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.grid2}>
        {[
          ["Aprendizagem", snapshot.stats.learning],
          ["Conforto", snapshot.stats.comfort],
          ["Limpeza", snapshot.stats.cleanliness],
          ["Satisfação", snapshot.stats.satisfaction],
          ["Acessibilidade", snapshot.stats.accessibility],
          ["Ocupação de assentos", snapshot.stats.occupancy],
        ].map(([label, value]) => (
          <div key={label as string} className={styles.card}>
            <span className={`${styles.tiny} ${styles.muted}`}>{label}</span>
            <span className={`${styles.strong} ${(value as number) > 60 ? styles.good : (value as number) > 35 ? styles.warn : styles.bad}`}>{value}%</span>
            <div className={styles.progress}>
              <div className={styles.progressFill} style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
      {report && (
        <div className={`${styles.card} ${styles.tiny}`}>
          <span className={styles.strong}>Resumo operacional</span>
          <span className={styles.muted}>Alunos {report.students} · assentos {report.seats} · saldo {formatMoney(report.budget)} · folha {formatMoney(report.payroll)} · obras ativas {report.activeWorks}</span>
        </div>
      )}
      <div className={`${styles.small} ${styles.strong}`}>Alunos que precisam de atenção</div>
      {help.map((student) => (
        <div key={student.name} className={styles.card}>
          <div className={styles.between}>
            <span className={styles.strong}>{student.name}</span>
            <span className={`${styles.tag} ${student.mood < 40 ? styles.pillBad : styles.pillWarn}`}>{student.mood}%</span>
          </div>
          <div className={`${styles.tiny} ${styles.muted}`}>{student.reason}</div>
        </div>
      ))}
      <div className={`${styles.small} ${styles.strong}`}>Grupos e histórias</div>
      {friends.map(({ agent, friends: names }) => (
        <div key={agent.id} className={styles.card}>
          <span className={`${styles.small} ${styles.strong}`}>{agent.name}</span>
          <div className={`${styles.tiny} ${styles.muted}`}>{agent.story}</div>
          <div className={`${styles.tiny} ${styles.muted}`}>Amizades: {names.join(", ") || "ainda formando grupos"}</div>
        </div>
      ))}
      <div className={`${styles.small} ${styles.strong}`}>Notificações</div>
      <div className={styles.notificationList}>
        {snapshot.notifications.map((notification) => (
          <div key={notification.id} className={styles.notification}>{notification.title} — {notification.body}</div>
        ))}
      </div>
    </PanelShell>
  );
}

function SettingsPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const settings = useGame((s) => s.settings);
  const actions = useGame((s) => s.actions);
  const [name, setName] = useState(getSim()?.world.schoolName ?? "Escola PEG");
  const [confirmReset, setConfirmReset] = useState(false);
  if (!snapshot) return null;
  return (
    <PanelShell title="Configurações & salvamento" subtitle="Preferências do jogo isoladas do PEG principal" onClose={() => actions.setPanel("none")}>
      <details><summary>Identidade da escola</summary><div className="peg-section">
      <div className={styles.field}>
        <span>Nome da escola</span>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={48} />
        <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => actions.setSchoolIdentity({ schoolName: name })}>
          Salvar identidade
        </button>
      </div>
      <div className={`${styles.field}`}>
        <span>Cor da escola</span>
        <div className={styles.row}>
          {["#6d4aa8", "#2f7d8a", "#a3555c", "#3f7d5a", "#8a6a2f"].map((color) => (
            <button
              key={color}
              aria-label={`Cor ${color}`}
              onClick={() => actions.setSchoolIdentity({ schoolColors: { primary: color, accent: "#f0b95a" } })}
              style={{ width: 26, height: 26, borderRadius: 8, background: color, border: "2px solid rgba(255,255,255,0.4)", cursor: "pointer" }}
            />
          ))}
        </div>
      </div>
      </div></details>
      <details><summary>Tela, som e controles</summary><div className="peg-section">
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span>Tema da interface</span>
          <select value={settings.theme} onChange={(event) => actions.updateSettings({ theme: event.target.value as "dark" | "light" })}>
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Qualidade gráfica</span>
          <select value={settings.quality} onChange={(event) => actions.setQuality(event.target.value as QualityTier)}>
            <option value="low">Baixa (mobile)</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Tamanho da interface</span>
          <input type="range" min={0.85} max={1.3} step={0.05} value={settings.uiScale} onChange={(event) => actions.updateSettings({ uiScale: Number(event.target.value) })} />
        </label>
        <label className={styles.field}>
          <span>Música {Math.round(settings.music * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.music} onChange={(event) => actions.updateSettings({ music: Number(event.target.value) })} />
        </label>
        <label className={styles.field}>
          <span>Ambiente {Math.round(settings.ambience * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.ambience} onChange={(event) => actions.updateSettings({ ambience: Number(event.target.value) })} />
        </label>
        <label className={styles.field}>
          <span>Efeitos {Math.round(settings.effects * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.effects} onChange={(event) => actions.updateSettings({ effects: Number(event.target.value) })} />
        </label>
      </div>
      <label className={`${styles.row} ${styles.small}`}>
        <input type="checkbox" checked={settings.showNames} onChange={(event) => actions.updateSettings({ showNames: event.target.checked })} />
        Mostrar nomes ao selecionar personagens
      </label>
      <label className={styles.tiny} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Sensibilidade da câmera
          <input type="range" min={0.3} max={2.5} step={0.1} value={settings.sensitivity ?? 1} onChange={(event) => actions.updateSettings({ sensitivity: Number(event.target.value) })} />
          {(settings.sensitivity ?? 1).toFixed(1)}×
        </label>
        <label className={styles.tiny} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={!!settings.invertY} onChange={(event) => actions.updateSettings({ invertY: event.target.checked })} /> Inverter eixo vertical
        </label>
        <label className={`${styles.row} ${styles.small}`}>
        <input type="checkbox" checked={settings.reduceMotion} onChange={(event) => actions.updateSettings({ reduceMotion: event.target.checked })} />
        Reduzir movimento (câmera e animações)
      </label>
      </div></details>
      <details><summary>Salvamento e novo jogo</summary><div className="peg-section">
      <div className={styles.grid2}>
        <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnPrimary}`} onClick={() => actions.saveNow(true)}>
          <Icon name="save" size={13} /> Salvar agora
        </button>
        <button className={styles.btn} onClick={actions.exportGame}>
          <Icon name="download" size={13} /> Exportar JSON
        </button>
        <label className={styles.btn} style={{ cursor: "pointer" }}>
          <Icon name="upload" size={13} /> Importar JSON
          <input
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await actions.importGame(file);
            }}
          />
        </label>
        <button className={styles.btn} onClick={() => actions.newGame("creative")}>
          <Icon name="spark" size={13} /> Modo criativo
        </button>
      </div>
      <div className={styles.card}>
        <span className={styles.strong}>Reiniciar</span>
        <span className={`${styles.tiny} ${styles.muted}`}>Apaga o save local e cria uma nova escola em modo Carreira. O save do servidor é substituído no próximo salvamento.</span>
        {confirmReset ? (
          <div className={styles.row}>
            <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={async () => { await actions.resetGame(); setConfirmReset(false); }}>
              Confirmar reinício
            </button>
            <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setConfirmReset(false)}>Cancelar</button>
          </div>
        ) : (
          <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={() => setConfirmReset(true)}>
            Reiniciar escola
          </button>
        )}
      </div>
      </div></details>
      <details><summary>Modos de jogo</summary><div className="peg-section">
      <div className={styles.card}>
        <span className={styles.strong}>Modos</span>
        {Object.entries(MODES).map(([mode, preset]) => (
          <div key={mode} className={styles.between}>
            <div>
              <div className={styles.small}>{preset.label}</div>
              <div className={`${styles.tiny} ${styles.muted}`}>{preset.hint}</div>
            </div>
            <button className={`${styles.btn} ${styles.btnSmall} ${snapshot.modes === mode ? styles.btnPrimary : ""}`} onClick={() => actions.changeMode(mode as GameMode)}>
              {snapshot.modes === mode ? "Atual" : "Aplicar"}
            </button>
          </div>
        ))}
        <span className={`${styles.tiny} ${styles.muted}`}>Modos alteram verba, custos e velocidade de obra. Trocar no jogo é permitido no protótipo.</span>
      </div>
      </div></details>
      <details><summary>Atalhos e informações</summary><div className="peg-section">
      <div className={`${styles.card} ${styles.tiny}`}>
        <span className={styles.strong}>Atalhos</span>
        <span className={styles.muted}>B construir · M missões · C câmera · F 1ª pessoa · P foto · Espaço pausar · R girar · Esc cancelar · 1/2/3 velocidade</span>
      </div>
      <div className={`${styles.card} ${styles.tiny}`}>
        <span className={styles.strong}>Publicidade do PEG</span>
        <span className={styles.muted}>Opcional, com sessão emitida pelo servidor e resgate idempotente. A escola não depende de anúncios. Recompensas locais, sem XP oficial.</span>
      </div>
      </div></details>
    </PanelShell>
  );
}

function CameraPanel() {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  const cameraMode = useGame((s) => s.cameraMode);
  const showRoofs = useGame((s) => s.showRoofs);
  const showGrid = useGame((s) => s.showGrid);
  const minimapOpen = useGame((s) => s.minimapOpen);
  const overlay = useGame((s) => s.overlay);
  if (!snapshot) return null;
  const favorites = getSim()?.world.cameraFavorites ?? [];
  return (
    <PanelShell title="Câmera & mapas" subtitle="Isométrica, navegação e visão interna" onClose={() => actions.setPanel("none")}>
      <div className={styles.grid2}>
        <button className={`${styles.btn} ${cameraMode === "orbit" ? styles.btnPrimary : ""}`} onClick={() => actions.setCameraMode("orbit")}>
          <Icon name="camera" size={13} /> Visão geral
        </button>
        <button className={`${styles.btn} ${cameraMode === "first" ? styles.btnPrimary : ""}`} onClick={() => actions.setCameraMode("first")}>
          <Icon name="firstperson" size={13} /> 1ª pessoa
        </button>
        <button className={`${styles.btn} ${showRoofs ? styles.btnPrimary : ""}`} onClick={actions.toggleRoofs}>
          <Icon name="layers" size={13} /> {showRoofs ? "Ocultar telhados" : "Mostrar telhados"}
        </button>
        <button className={`${styles.btn} ${showGrid ? styles.btnPrimary : ""}`} onClick={actions.toggleGrid}>
          <Icon name="grid" size={13} /> Grade
        </button>
        <button className={styles.btn} onClick={actions.toggleMinimap}>
          <Icon name="map" size={13} /> {minimapOpen ? "Ocultar mapa" : "Mostrar mapa"}
        </button>
        <button className={styles.btn} onClick={() => actions.saveCameraFavorite()}>
          <Icon name="save" size={13} /> Salvar vista
        </button>
      </div>
      <details><summary>Controles da câmera</summary>
        <p className={styles.small}>Botão direito gira a câmera. Shift + arraste desloca a visão. Use a roda para aproximar. No celular, arraste com um dedo ou use dois para mover e aproximar.</p>
      </details>
      <div className={`${styles.small} ${styles.strong}`}>Vistas favoritas</div>
      {favorites.length === 0 && <div className={`${styles.tiny} ${styles.muted}`}>Nenhuma vista salva. Ajuste a câmera e clique em Salvar vista.</div>}
      {favorites.map((favorite) => (
        <div key={favorite.id} className={styles.between}>
          <span className={styles.small}>{favorite.name}</span>
          <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => actions.applyCameraFavorite(favorite.id)}>
            Aplicar
          </button>
        </div>
      ))}
      <div className={`${styles.small} ${styles.strong}`}>Mapa de calor</div>
      <div className={styles.searchRow}>
        {(["occupancy", "cleanliness", "condition", "accessibility", "seats"] as const).map((item) => (
          <button key={item} className={`${styles.btn} ${styles.btnSmall} ${overlay === item ? styles.btnPrimary : ""}`} onClick={() => actions.setOverlay(overlay === item ? "none" : item)}>
            {item === "occupancy" ? "Lotação" : item === "cleanliness" ? "Limpeza" : item === "condition" ? "Conservação" : item === "accessibility" ? "Acesso" : "Assentos"}
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

function BuildingInspector({ id }: { id: string }) {
  const snapshot = useGame((s) => s.snapshot);
  const actions = useGame((s) => s.actions);
  const [confirm, setConfirm] = useState(false);
  const building = snapshot?.buildings.find((b) => b.id === id);
  if (!building) return null;
  const spec = specFor(building.kind);
  const stage = buildingStage(building.progress);
  const sim = getSim();
  const seats = sim?.seats.filter((seat) => seat.buildingId === id) ?? [];
  const used = seats.filter((seat) => sim?.claims.has(seat.key)).length;
  const improvementNeeded = isWalled(building) && !building.accessible;
  return (
    <PanelShell
      title={spec.name}
      subtitle={building.progress < 1 ? `Obra: ${stage.label} · ${Math.round(building.progress * 100)}%` : `${seats.length} assentos · ${spec.impact}`}
      onClose={() => actions.selectBuilding(null)}
      narrow
    >
      <div className={styles.grid2}>
        <div className={styles.card}><span className={styles.tiny}>Conservação</span><span className={styles.strong}>{Math.round(building.condition)}%</span></div>
        <div className={styles.card}><span className={styles.tiny}>Sujeira</span><span className={styles.strong}>{Math.round(building.dirt)}%</span></div>
        <div className={styles.card}><span className={styles.tiny}>Acessível</span><span className={`${styles.strong} ${building.accessible ? styles.good : styles.bad}`}>{building.accessible ? "sim" : "não"}</span></div>
        <div className={styles.card}><span className={styles.tiny}>Ocupação</span><span className={styles.strong}>{used}/{seats.length}</span></div>
      </div>
      {building.progress < 1 && (
        <>
          <div className={styles.progress}>
            <div className={styles.progressFill} style={{ width: `${building.progress * 100}%` }} />
          </div>
          <div className={`${styles.tiny} ${styles.muted}`}>Etapas: preparação, fundação, estrutura, paredes, cobertura, acabamento, móveis e abertura. A instalação ainda não oferece benefícios.</div>
          <button className={styles.btn} onClick={() => actions.openAd("finish_work")}>
            <Icon name="play" size={12} /> Publicidade: adiantar esta obra
          </button>
        </>
      )}
      <div className={styles.row}>
        <button className={styles.btn} onClick={() => actions.focusOn(building.x, building.z, 30)}>
          <Icon name="camera" size={13} /> Centralizar
        </button>
        <button className={styles.btn} onClick={() => actions.beginMove(building.id)}>
          <Icon name="move" size={13} /> Mover
        </button>
        <button className={`${styles.btn} ${building.accessible ? "" : styles.btnPrimary}`} disabled={building.accessible} onClick={() => actions.makeAccessible(building.id)}>
          <Icon name="access" size={13} /> {building.accessible ? "Rota ok" : `Acessível ${formatMoney(1200)}`}
        </button>
      </div>
      {confirm ? (
        <div className={styles.row}>
          <button
            className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
            onClick={() => {
              actions.demolish(building.id);
              setConfirm(false);
            }}
          >
            Confirmar demolição
          </button>
          <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setConfirm(false)}>Cancelar</button>
        </div>
      ) : (
        <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={() => setConfirm(true)}>
          <Icon name="trash" size={12} /> Demolir (35% de reaproveitamento)
        </button>
      )}
      {improvementNeeded && <div className={`${styles.tiny} ${styles.warn}`}>Sem rota acessível: alunos cadeirantes não entram neste prédio.</div>}
      <details><summary>Assentos ({seats.length})</summary><div className={`${styles.card} ${styles.tiny}`}>
        {seats.slice(0, 8).map((seat) => (
          <div key={seat.key} className={styles.between}>
            <span className={styles.muted}>{seat.label}</span>
            <span className={sim?.claims.has(seat.key) ? styles.warn : styles.good}>{sim?.claims.has(seat.key) ? "ocupado" : "livre"}</span>
          </div>
        ))}
        {seats.length > 8 && <span className={styles.muted}>+{seats.length - 8} assentos</span>}
      </div></details>
    </PanelShell>
  );
}

function AgentInspector({ id }: { id: string }) {
  const selected = useGame((s) => s.snapshot?.agents.find((agent) => agent.id === id));
  const actions = useGame((s) => s.actions);
  const sim = getSim();
  const agent = sim?.world.agents.find((a) => a.id === id);
  if (!selected || !agent) return null;
  return (
    <PanelShell title={selected.name} subtitle={`${selected.role === "student" ? "Aluno(a)" : selected.role} · ${selected.activity}`} onClose={() => actions.selectAgent(null)} narrow>
      <div className={styles.card}>
        <span className={`${styles.tiny} ${styles.muted}`}>Destino atual</span>
        <span className={styles.small}>{selected.destination}</span>
        <span className={`${styles.tiny} ${styles.muted}`}>História: {selected.story}</span>
      </div>
      <div className={styles.card}>
        <div className={styles.between}>
          <span className={styles.small}>Necessidades</span>
          <span className={`${styles.tag} ${selected.mood > 60 ? styles.pillGood : selected.mood > 35 ? styles.pillWarn : styles.pillBad}`}>humor {selected.mood}%</span>
        </div>
        <NeedBar label="Aprendizado" value={selected.needs.learning} />
        <NeedBar label="Fome" value={100 - selected.needs.hunger} />
        <NeedBar label="Energia" value={selected.needs.energy} />
        <NeedBar label="Higiene" value={selected.needs.hygiene} />
        <NeedBar label="Diversão" value={selected.needs.fun} />
        <NeedBar label="Conforto" value={selected.needs.comfort} />
        <NeedBar label="Social" value={selected.needs.social} />
      </div>
      <div className={styles.row}>
        <button className={styles.btn} onClick={() => actions.focusOn(agent.x, agent.z, 18)}>
          <Icon name="camera" size={13} /> Seguir posição
        </button>
        {agent.wheelchair && (
          <button className={styles.btn} onClick={() => actions.setPanel("improvements")}>
            <Icon name="access" size={13} /> Rotas acessíveis
          </button>
        )}
      </div>
      {agent.wheelchair && !sim?.world.buildings.some((b) => b.kind === "classroom" && b.accessible) && (
        <div className={`${styles.tiny} ${styles.warn}`}>Ana depende de uma rota acessível na sala de aula. Sem isso, ela permanece no pátio.</div>
      )}
    </PanelShell>
  );
}

export function Panels() {
  const panel = useGame((s) => s.panel);
  const selectedBuildingId = useGame((s) => s.selectedBuildingId);
  const selectedAgentId = useGame((s) => s.selectedAgentId);
  if (panel === "build") return <BuildPanel />;
  if (panel === "missions") return <MissionsPanel />;
  if (panel === "agents") return <AgentsPanel />;
  if (panel === "staff") return <StaffPanel />;
  if (panel === "schedule") return <SchedulePanel />;
  if (panel === "finance") return <FinancePanel />;
  if (panel === "stock") return <StockPanel />;
  if (panel === "improvements") return <ImprovementsPanel />;
  if (panel === "events") return <EventsPanel />;
  if (panel === "report") return <ReportPanel />;
  if (panel === "settings") return <SettingsPanel />;
  if (panel === "camera") return <CameraPanel />;
  if (selectedBuildingId) return <BuildingInspector id={selectedBuildingId} />;
  if (selectedAgentId) return <AgentInspector id={selectedAgentId} />;
  return null;
}

export type { Panel };
