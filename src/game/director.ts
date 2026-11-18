/**
 * Gabinete do diretor — camada de gestão integrada à simulação (sim.ts).
 * Responsável única por: fichas dos alunos do save, ações do diretor, suspensão/expulsão,
 * foco do dia, ocorrências, lixo do recreio, estrelas de reputação, melhorias por prédio,
 * missões rápidas e o resumo de fechamento do dia.
 * Dados de alunos aqui pertencem apenas a este save — não são o cadastro escolar real do PEG.
 */
import { BUILDABLE_BY_KIND, GATE, phaseFor } from "./config";
import { entryPoint, hashString } from "./layout";
import { findPath, walkableAt } from "./nav";
import { noiseComfortTick } from "./noise";
import {
  addLedger,
  assignTarget,
  classroomSeat,
  goChill,
  goLeave,
  notify,
  planOf,
  rebuildWorldModel,
  releaseSeat,
  takeSeat,
  type Sim,
  WALK_SCALE,
  MINUTES_PER_SECOND,
} from "./sim";
import type { Agent, AgentRole, BuildingInstance, BuildingKind, GameWorld } from "./types";
import { difficulty, equipmentUnlocked, prog, progressDayStart, progressTick, roomLabelFor, storyOnAction } from "./progression";

export type FocusArea = "ensino" | "convivencia" | "alimentacao" | "infraestrutura";
export type RecordType = "conversa" | "elogio" | "orientacao" | "ocorrencia" | "mediacao" | "responsavel" | "advertencia" | "suspensao" | "retorno" | "expulsao" | "matricula";
export type OccType = "cano" | "energia" | "confusao" | "merenda" | "fiscalizacao" | "professor";

export interface RecordEntry { day: number; minute: number; type: RecordType; text: string }
export interface StudentRecord {
  id: string;
  name: string;
  group: string;
  enrolledDay: number;
  daysPresent: number;
  daysExpected: number;
  presentToday: boolean;
  history: RecordEntry[];
  status: "ativo" | "suspenso" | "expulso" | "formado";
  returnDay?: number;
  warnings: number;
  calmUntilDay?: number;
  exitReason?: string;
}
export interface Occurrence {
  id: string;
  type: OccType;
  title: string;
  x: number;
  z: number;
  buildingId: string | null;
  startedAt: number;
  deadline: number;
  activeSeconds: number;
  status: "aberta" | "resolvida" | "ignorada";
  agents: string[];
  helperId: string | null;
  size: number;
  outcome?: string;
  viaDirector?: boolean;
  stage: number;
  history: string[];
  cause: string;
  choice?: string;
  taskId?: string;
  busyUntil?: number;
  busyOpt?: string;
  busyLabel?: string;
  awaitFP?: string;
  closedValve?: boolean;
  calmed?: boolean;
}
export interface LitterItem { id: string; x: number; z: number; kind: number; at: number }
export interface QuickMission {
  id: string;
  kind: "primeiraAula" | "merenda" | "deVoltaAula" | "convivencia" | "banheiroEmDia" | "escolaParaTodos";
  title: string;
  how: string;
  progress: number;
  target: number;
  deadline: number; // minuto do dia
  reward: number;
  done: boolean;
  claimed: boolean;
  failed: boolean;
  aux?: number;
}
export interface DayLog {
  day: number;
  startBudget: number;
  startStars: number;
  actions: number;
  positive: number;
  occOpened: number;
  occResolved: number;
  occIgnored: number;
  litterCollected: number;
  conflictsMediated: number;
  orientSuccess: number;
  missionsDone: number;
  newEnrollments: number;
  counter2At: number | null;
  notes: string[];
}
export interface FocusState { day: number; area: FocusArea; baseline: number; target: number; label: string; result?: string; success?: boolean }
export interface DirectorState {
  v: 1;
  records: Record<string, StudentRecord>;
  archive: StudentRecord[];
  focus: FocusState | null;
  occurrences: Occurrence[];
  litter: LitterItem[];
  missions: QuickMission[];
  log: DayLog;
  points: { disciplina: number; convivencia: number; higiene: number };
  serial: number;
  expelled: string[];
  history: { day: number; stars: number; queuePeak: number; meals: number; attendance: number }[];
  plan: { day: number; type: OccType; at: number; done: boolean; cause?: string }[];
  powerOut: boolean;
  bathroomMaxDirt: number;
  tasks: DTask[];
  pendingFixes: number;
  electric: number;
  nonEssentialOff: boolean;
  foodReserve: boolean;
  teacherFactor: number;
  queueByClassUntil: number;
  queueHelpUntil: number;
  lastResolvedAt: number;
  followUps: { ids: string[]; untilDay: number; choice: string }[];
}

export interface DirectorDaySummary {
  day: number;
  startBudget: number;
  income: number;
  expenses: number;
  finalBudget: number;
  attendance: number;
  expected: number;
  meals: number;
  queuePeak: number;
  occurrences: { opened: number; resolved: number; ignored: number };
  actions: number;
  missionsDone: number;
  starsStart: number;
  starsEnd: number;
  focus: FocusState | null;
  observation: string | null;
  litterCollected: number;
}

type DW = GameWorld & { director?: DirectorState };

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const abs = (w: GameWorld) => w.day * 1440 + w.minutes;
const rnd = (seed: string) => hashString(seed);

function freshLog(world: GameWorld, stars: number): DayLog {
  return { day: world.day, startBudget: Math.round(world.budget), startStars: stars, actions: 0, positive: 0, occOpened: 0, occResolved: 0, occIgnored: 0, litterCollected: 0, conflictsMediated: 0, orientSuccess: 0, missionsDone: 0, newEnrollments: 0, counter2At: null, notes: [] };
}

/** Migração explícita: saves anteriores ganham o estado do gabinete na primeira leitura. */
export function dir(world: GameWorld): DirectorState {
  const w = world as DW;
  if (!w.director) {
    w.director = {
      v: 1,
      records: {},
      archive: [],
      focus: null,
      occurrences: [],
      litter: [],
      missions: [],
      log: { ...freshLog(world, 3), day: -1 },
      points: { disciplina: 0, convivencia: 0, higiene: 0 },
      serial: Math.max(100, world.agents.length + 10),
      expelled: [],
      history: [],
      plan: [],
      powerOut: false,
      bathroomMaxDirt: 0,
    } as unknown as DirectorState;
  }
  const d = w.director!;
  d.tasks ??= []; d.pendingFixes ??= 0; d.electric ??= 0; d.nonEssentialOff ??= false; d.foodReserve ??= false;
  d.teacherFactor ??= 1; d.queueByClassUntil ??= 0; d.queueHelpUntil ??= 0; d.lastResolvedAt ??= -9999; d.followUps ??= [];
  for (const o of d.occurrences) { o.stage ??= 0; o.history ??= []; o.cause ??= ""; }
  for (const a of world.agents) if (a.role === "student" && !d.records[a.id]) d.records[a.id] = newRecord(world, a);
  return d;
}

function newRecord(world: GameWorld, a: Agent): StudentRecord {
  const group = world.groups[0]?.name ?? "Turma A";
  return { id: a.id, name: a.name, group, enrolledDay: world.day, daysPresent: 0, daysExpected: 0, presentToday: false, history: [], status: a.status ?? "ativo", returnDay: a.returnDay, warnings: 0 };
}

export function recordFor(sim: Sim, a: Agent, type: RecordType, text: string) { record(sim, a, type, text); }
function record(sim: Sim, a: Agent, type: RecordType, text: string) {
  const d = dir(sim.world);
  const r = d.records[a.id] ?? (d.records[a.id] = newRecord(sim.world, a));
  r.history.unshift({ day: sim.world.day, minute: Math.round(sim.world.minutes), type, text });
  if (r.history.length > 40) r.history.length = 40;
}

/** Próximo número de matrícula: identidades novas nunca reaproveitam alunos expulsos. */
export function nextStudentIndex(world: GameWorld): number {
  const d = dir(world);
  d.serial += 1;
  return d.serial;
}

// ------------------------------------------------------------------ estrelas
export interface StarBreakdown { ensino: number; higiene: number; alimentacao: number; seguranca: number; stars: number; weakest: { key: string; label: string; value: number } }
export function starBreakdown(world: GameWorld): StarBreakdown {
  const d = dir(world);
  const open = d.occurrences.filter((o) => o.status === "aberta");
  const ensino = clamp(world.stats.learning);
  const higiene = clamp(world.stats.cleanliness - d.litter.length * 2.5 - open.filter((o) => o.type === "cano").length * 15);
  const alimentacao = clamp(100 - Math.max(0, world.daily.queuePeak - 4) * 7 - (world.stock.food < 20 ? 25 : 0) - open.filter((o) => o.type === "merenda").length * 30);
  const seguranca = clamp(100 - open.length * 12 - (100 - world.stats.accessibility) * 0.35 - open.filter((o) => o.type === "confusao").length * 8);
  const avg = (ensino + higiene + alimentacao + seguranca) / 4;
  const stars = Math.round((1 + (4 * avg) / 100) * 10) / 10;
  const list = [
    { key: "ensino", label: "Ensino", value: ensino },
    { key: "higiene", label: "Higiene", value: higiene },
    { key: "alimentacao", label: "Alimentação", value: alimentacao },
    { key: "seguranca", label: "Segurança", value: seguranca },
  ].sort((a, b) => a.value - b.value);
  return { ensino, higiene, alimentacao, seguranca, stars, weakest: list[0] };
}

// ------------------------------------------------------------------ melhorias por prédio
export interface DirectorUpgrade { id: string; name: string; kinds: BuildingKind[]; cost: number; effect: string; minStars?: number; once?: boolean }
export const DIRECTOR_UPGRADES: DirectorUpgrade[] = [
  { id: "balcao2", name: "Segundo balcão de merenda", kinds: ["canteen"], cost: 3200, effect: "Abre outro ponto de atendimento real: a fila anda no dobro da velocidade." },
  { id: "armarios", name: "Armários de turma", kinds: ["classroom"], cost: 1400, effect: "Armários junto à parede da sala: +organização, conforto e aprendizagem dessa sala." },
  { id: "kitHigiene", name: "Kit de higiene", kinds: ["bathroom"], cost: 900, effect: "Dispensadores no banheiro: a sujeira acumula pela metade." },
  { id: "bancosCobertos", name: "Bancos cobertos", kinds: ["patio", "garden"], cost: 2100, effect: "+4 assentos utilizáveis e abrigo para quem estiver na área durante a chuva." },
  { id: "sinalizacao", name: "Sinalização de corredores", kinds: ["reception"], cost: 1100, effect: "Placas coloridas por setor e lista de acessos interrompidos no gabinete.", once: true },
  { id: "mediacao", name: "Espaço de mediação", kinds: ["reception", "staffroom"], cost: 1800, effect: "Mesa de mediação: conflitos atendidos aqui recuperam mais o bem-estar.", once: true },
  { id: "coberturaQuadra", name: "Cobertura da quadra", kinds: ["court"], cost: 6800, minStars: 3.5, effect: "Estrutura metálica sobre a quadra: jogos continuam na chuva." },
  { id: "placar", name: "Placar eletrônico", kinds: ["court"], cost: 2600, effect: "Placar na quadra: +diversão em jogos e +3 nas competições esportivas. Requer Esportes nível 1." },
  { id: "lousaDigital", name: "Lousa digital", kinds: ["classroom"], cost: 3400, effect: "Tela interativa na sala: +aprendizagem dessa sala. Requer Tecnologia nível 1." },
  { id: "palcoMovel", name: "Palco móvel", kinds: ["patio"], cost: 2400, effect: "Palco no pátio: +diversão no recreio e +3 nas competições culturais. Requer Artes nível 1." },
  { id: "bibliotecaSala", name: "Biblioteca de sala", kinds: ["classroom"], cost: 1500, effect: "Estante com livros na sala: +aprendizagem dessa sala. Requer Ensino acadêmico nível 1." },
  { id: "climatizacao", name: "Ar-condicionado", kinds: ["classroom", "library", "computer", "lab"], cost: 4200, minStars: 4, effect: "Conforto térmico para quem estiver na sala." },
];
export function hasUpgrade(world: GameWorld, id: string, kind?: BuildingKind) {
  return world.buildings.some((b) => b.progress >= 1 && (!kind || b.kind === kind) && b.upgrades?.includes(id));
}
export function buyDirectorUpgrade(sim: Sim, id: string, buildingId: string): { ok: boolean; message: string } {
  const up = DIRECTOR_UPGRADES.find((u) => u.id === id);
  const b = sim.world.buildings.find((x) => x.id === buildingId);
  if (!up || !b) return { ok: false, message: "Escolha um prédio válido." };
  if (!up.kinds.includes(b.kind)) return { ok: false, message: `${up.name} só pode ser instalado em: ${up.kinds.map((k) => BUILDABLE_BY_KIND[k]?.name ?? k).join(", ")}.` };
  if (b.progress < 1) return { ok: false, message: "O prédio ainda está em obra." };
  if (b.upgrades?.includes(id)) return { ok: false, message: "Esta melhoria já está instalada neste prédio." };
  if (up.once && hasUpgrade(sim.world, id)) return { ok: false, message: "Esta melhoria já existe na escola." };
  const stars = starBreakdown(sim.world).stars;
  const lock = equipmentUnlocked(sim.world, up.id);
  if (lock) return { ok: false, message: lock };
  if (up.minStars && stars < up.minStars) return { ok: false, message: `Desbloqueia com ${up.minStars.toFixed(1)}★ (agora ${stars.toFixed(1)}★).` };
  if (sim.world.budget < up.cost) return { ok: false, message: `Saldo insuficiente: faltam R$ ${Math.ceil(up.cost - sim.world.budget)}.` };
  addLedger(sim, -up.cost, up.name, `Instalado em ${BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind}`, "melhoria");
  b.upgrades = [...(b.upgrades ?? []), id];
  if (id === "balcao2") dir(sim.world).log.counter2At = sim.world.minutes;
  rebuildWorldModel(sim);
  notify(sim, "good", up.name, `Instalado em ${BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind}. ${up.effect}`, `up-${id}-${b.id}`, 1);
  return { ok: true, message: `${up.name} instalado em ${BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind}.` };
}
export function canteenCounters(world: GameWorld) {
  return 1 + (hasUpgrade(world, "balcao2", "canteen") ? 1 : 0);
}

// ------------------------------------------------------------------ foco do dia
export const FOCUS_INFO: Record<FocusArea, { label: string; goal: (w: GameWorld) => { target: number; label: string } }> = {
  ensino: { label: "Ensino", goal: (w) => ({ target: Math.max(1, Math.ceil(activeStudents(w).length * 0.9)), label: "alunos sentados em aula no pico" }) },
  convivencia: { label: "Convivência", goal: () => ({ target: 1, label: "conflitos resolvidos sem ocorrência ignorada" }) },
  alimentacao: { label: "Alimentação", goal: () => ({ target: 5, label: "pessoas no máximo na fila" }) },
  infraestrutura: { label: "Infraestrutura", goal: () => ({ target: 30, label: "% de sujeira média máxima nos prédios" }) },
};
function activeStudents(w: GameWorld) {
  return w.agents.filter((a) => a.role === "student" && a.status !== "expulso" && a.status !== "suspenso");
}
function focusValue(world: GameWorld, area: FocusArea) {
  const d = dir(world);
  if (area === "ensino") return world.daily.studentsInClassPeak;
  if (area === "convivencia") return d.log.conflictsMediated;
  if (area === "alimentacao") return world.daily.queuePeak;
  const bs = world.buildings.filter((b) => b.progress >= 1 && BUILDABLE_BY_KIND[b.kind] && !BUILDABLE_BY_KIND[b.kind].open);
  return bs.length ? bs.reduce((s, b) => s + b.dirt, 0) / bs.length : 0;
}
export function chooseFocus(sim: Sim, area: FocusArea) {
  const d = dir(sim.world);
  if (d.focus && d.focus.day === sim.world.day) return { ok: false, message: "O foco de hoje já foi escolhido." };
  const g = FOCUS_INFO[area].goal(sim.world);
  d.focus = { day: sim.world.day, area, baseline: Math.round(focusValue(sim.world, area)), target: g.target, label: g.label };
  return { ok: true, message: `Foco do dia: ${FOCUS_INFO[area].label}. Meta: ${g.target} ${g.label}.` };
}
function evaluateFocus(world: GameWorld): void {
  const d = dir(world);
  const f = d.focus;
  if (!f || f.day !== world.day || f.result) return;
  const v = focusValue(world, f.area);
  let ok = false;
  if (f.area === "ensino") ok = v >= f.target;
  if (f.area === "convivencia") ok = v >= f.target && d.log.occIgnored === 0;
  if (f.area === "alimentacao") ok = v <= f.target && world.daily.servedMeals > 0;
  if (f.area === "infraestrutura") ok = v <= f.target;
  f.success = ok;
  f.result = ok
    ? `Meta atingida: ${Math.round(v)} (${f.label}; meta ${f.target}).`
    : `Meta não atingida: ${Math.round(v)} (${f.label}; meta ${f.target}). ${f.area === "alimentacao" ? "Um segundo balcão ou mais funcionários de cantina reduzem a fila." : f.area === "infraestrutura" ? "Contrate limpeza e instale kits de higiene." : f.area === "ensino" ? "Garanta carteiras suficientes e acompanhe a chegada." : "Medie as confusões assim que aparecerem."}`;
}

// ------------------------------------------------------------------ missões rápidas
function genMissions(world: GameWorld): QuickMission[] {
  const st = activeStudents(world);
  const seats = world.buildings.filter((b) => b.kind === "classroom" && b.progress >= 1).length;
  const pool: QuickMission[] = [];
  const base = { progress: 0, done: false, claimed: false, failed: false };
  if (seats) pool.push({ ...base, id: `pa-${world.day}`, kind: "primeiraAula", title: "Primeira aula em ordem", how: "Alunos presentes sentados na carteira antes das 7h45.", target: Math.max(1, Math.min(st.length, 30)), deadline: 465, reward: 500 });
  if (world.buildings.some((b) => b.kind === "canteen" && b.progress >= 1)) {
    const t = Math.max(3, Math.min(20, Math.round(st.length * 0.8)));
    pool.push({ ...base, id: `me-${world.day}`, kind: "merenda", title: "Hora da merenda", how: `Servir ${t} refeições até 12h com a fila sempre em até 6 pessoas.`, target: t, deadline: 720, reward: 600, aux: 6 });
  }
  if (st.length >= 4 && seats) pool.push({ ...base, id: `dv-${world.day}`, kind: "deVoltaAula", title: "De volta à aula", how: "Encontre um aluno fora da sala na aula, oriente-o e confirme a chegada à carteira.", target: 1, deadline: 850, reward: 450 });
  if (st.length >= 4) pool.push({ ...base, id: `cv-${world.day}`, kind: "convivencia", title: "Convivência", how: "Medie dois conflitos (pessoalmente ou pelo inspetor) e veja a turma retomar as atividades.", target: 2, deadline: 915, reward: 700 });
  if (world.buildings.some((b) => b.kind === "bathroom" && b.progress >= 1)) pool.push({ ...base, id: `bh-${world.day}`, kind: "banheiroEmDia", title: "Banheiro em dia", how: "Kit de higiene instalado e limpeza do banheiro acima de 80% até a saída.", target: 80, deadline: 915, reward: 550 });
  if (world.agents.some((a) => a.role === "student" && a.wheelchair && a.status !== "expulso")) pool.push({ ...base, id: `ep-${world.day}`, kind: "escolaParaTodos", title: "Escola para todos", how: "Trajeto acessível do portão até uma carteira e um aluno cadeirante sentado em aula.", target: 1, deadline: 850, reward: 650 });
  const start = world.day % Math.max(1, pool.length);
  const picked: QuickMission[] = [];
  for (let i = 0; i < pool.length && picked.length < 3; i++) picked.push(pool[(start + i) % pool.length]);
  return picked;
}
export function claimQuickMission(sim: Sim, id: string) {
  const m = dir(sim.world).missions.find((x) => x.id === id);
  if (!m || !m.done || m.claimed) return { ok: false, message: "Missão indisponível." };
  m.claimed = true;
  addLedger(sim, m.reward, "Missão do diretor", m.title, "missao");
  sim.world.reputation = clamp(sim.world.reputation + 1);
  return { ok: true, message: `${m.title}: +R$ ${m.reward}` };
}
function missionTick(sim: Sim) {
  const w = sim.world;
  const d = dir(w);
  const st = activeStudents(w).filter((a) => a.active);
  for (const m of d.missions) {
    if (m.done || m.failed) continue;
    if (m.kind === "primeiraAula") {
      m.progress = st.filter((a) => a.seatKey && a.intent === "class" && a.path.length === 0 && sim.seats.find((s) => s.key === a.seatKey)?.kind === "classroom").length;
      const present = st.length;
      m.target = Math.max(1, Math.min(present || m.target, sim.seats.filter((s) => s.kind === "classroom").length));
      if (w.minutes >= 440 && m.progress >= m.target) m.done = true;
      else if (w.minutes >= m.deadline) m.failed = true;
    } else if (m.kind === "merenda") {
      m.progress = w.daily.servedMeals;
      if (w.daily.queuePeak > (m.aux ?? 6)) m.failed = true;
      else if (m.progress >= m.target) m.done = true;
      else if (w.minutes >= m.deadline) m.failed = true;
    } else if (m.kind === "deVoltaAula") {
      m.progress = d.log.orientSuccess;
      if (m.progress >= 1) m.done = true;
      else if (w.minutes >= m.deadline) m.failed = true;
    } else if (m.kind === "convivencia") {
      m.progress = d.log.conflictsMediated;
      if (m.progress >= 2) m.done = true;
      else if (w.minutes >= m.deadline) m.failed = true;
    } else if (m.kind === "banheiroEmDia") {
      const b = w.buildings.find((x) => x.kind === "bathroom" && x.progress >= 1 && x.upgrades?.includes("kitHigiene"));
      m.progress = b ? Math.round(100 - b.dirt) : 0;
      if (b) d.bathroomMaxDirt = Math.max(d.bathroomMaxDirt, b.dirt);
      if (w.minutes >= m.deadline) {
        if (b && d.bathroomMaxDirt <= 20 && m.progress >= 80) m.done = true;
        else m.failed = true;
      }
    } else if (m.kind === "escolaParaTodos") {
      const room = w.buildings.find((b) => b.kind === "classroom" && b.progress >= 1 && b.accessible);
      const route = room ? findPath(sim.grid, { x: GATE.x, z: GATE.z + 0.6 }, entryPoint(room), { accessibleOnly: true }).reachable : false;
      const seated = st.some((a) => a.wheelchair && a.seatKey && a.path.length === 0 && sim.seats.find((s) => s.key === a.seatKey)?.kind === "classroom");
      m.progress = route && seated ? 1 : 0;
      if (m.progress >= 1) m.done = true;
      else if (w.minutes >= m.deadline) m.failed = true;
    }
    if (m.done) {
      d.log.missionsDone += 1;
      notify(sim, "good", "Missão concluída", `${m.title} — resgate R$ ${m.reward} no gabinete.`, `qm-${m.id}`, 1);
      sfxQueue.push("conquista");
    }
  }
}

// ------------------------------------------------------------------ incidentes em etapas: identificar → decidir → executar → verificar
export const OCC_INFO: Record<OccType, { title: string; how: string; payCost: number }> = {
  cano: { title: "Cano estourado", how: "Localize o vazamento, feche o registro, escolha o reparo, execute e limpe antes de reabrir.", payCost: 0 },
  energia: { title: "Queda de energia", how: "Identifique o setor, verifique a sobrecarga, desligue o que não é essencial e solicite o reparo.", payCost: 0 },
  confusao: { title: "Conflito entre alunos", how: "Interrompa, ouça os envolvidos, escolha uma intervenção e acompanhe nos próximos dias.", payCost: 0 },
  merenda: { title: "Falta de merenda", how: "Confira o estoque, escolha uma alternativa, ajuste o atendimento e reorganize o abastecimento.", payCost: 0 },
  fiscalizacao: { title: "Fiscalização surpresa", how: "60 s de jogo ativo: higiene, organização (pouco lixo) e segurança (sem incidentes).", payCost: 0 },
  professor: { title: "Professor ausente", how: "Escolha como cobrir a aula: substituto, remanejamento ou atividade supervisionada.", payCost: 0 },
};
export interface StepOption { id: string; label: string; detail: string; cost?: number; minutes?: number; role?: AgentRole; fp?: boolean; block?: string | null }
interface StepDef { title: string; info?: (sim: Sim, o: Occurrence) => string; options: (sim: Sim, o: Occurrence) => StepOption[]; apply?: (sim: Sim, o: Occurrence, opt: string) => void }
const roleName: Partial<Record<AgentRole, string>> = { maintenance: "manutenção", custodian: "zeladoria", coordinator: "coordenação", teacher: "professor(a)", canteen: "cantina" };
function staffFree(sim: Sim, role: AgentRole) {
  return sim.world.agents.filter((a) => a.role === role && a.active && a.visible && !a.taskId && a.id.startsWith("crew-") && !(role === "teacher" && a.intent === "teach"));
}
function loadOf(w: GameWorld) {
  const load = w.buildings.filter((b) => b.progress >= 1 && (b.kind === "computer" || b.kind === "media")).length * 2 +
    w.buildings.reduce((s, b) => s + (b.upgrades ?? []).filter((u) => u === "climatizacao" || u === "lousaDigital" || u === "placar").length, 0);
  return { load, capacity: 4 + dir(w).electric * 3 };
}
const STEPS: Partial<Record<OccType, StepDef[]>> = {
  cano: [
    { title: "Localizar o vazamento", options: () => [
      { id: "mapa", label: "Localizar no mapa", detail: "A câmera vai até a poça; você confirma o ponto." },
      { id: "fp", label: "Ir até lá (1ª pessoa)", detail: "Caminhe até a poça e toque em Inspecionar.", fp: true },
      { id: "busca", label: "Pedir à manutenção para procurar", detail: "Um funcionário caminha até o local.", role: "maintenance", minutes: 4 },
    ] },
    { title: "Fechar o registro do setor", info: () => "Enquanto o registro estiver aberto, a poça cresce e o prédio suja.", options: () => [
      { id: "fp", label: "Fechar você mesmo(a)", detail: "Vá até o local em 1ª pessoa e toque em Fechar registro.", fp: true },
      { id: "zelador", label: "Delegar à zeladoria", detail: "Fecha o registro do setor.", role: "custodian", minutes: 3 },
      { id: "manut", label: "Delegar à manutenção", detail: "Fecha o registro do setor.", role: "maintenance", minutes: 3 },
    ], apply: (sim, o) => { o.closedValve = true; } },
    { title: "Escolher o reparo", info: (sim) => `Material de manutenção em estoque: ${Math.floor(sim.world.stock.materials)} unid.`, options: (sim) => [
      { id: "provisorio", label: "Reparo provisório", detail: "Barato e rápido, mas fica uma pendência e o vazamento pode voltar.", cost: 150 },
      { id: "definitivo", label: "Reparo definitivo", detail: "Troca a conexão. Usa 3 unid. de material e um funcionário de manutenção.", cost: 350, block: sim.world.stock.materials < 3 ? "Material insuficiente (compre em Estoque ou escolha outra opção)." : null },
      { id: "externo", label: "Encanador externo", detail: "Mais caro; não usa material nem funcionário.", cost: 650 },
    ], apply: (sim, o, opt) => { o.choice = opt; if (opt === "definitivo") sim.world.stock.materials = Math.max(0, sim.world.stock.materials - 3); } },
    { title: "Executar o reparo", info: (_s, o) => (o.choice === "externo" ? "O encanador externo chega e trabalha sozinho." : "Um funcionário de manutenção precisa ir ao local."), options: (sim, o) => o.choice === "externo"
      ? [{ id: "aguardar", label: "Receber o encanador", detail: "Serviço externo (sem funcionário).", minutes: 15 }]
      : [{ id: "manut", label: "Enviar manutenção", detail: o.choice === "provisorio" ? "Remendo rápido." : "Troca completa da conexão.", role: "maintenance", minutes: o.choice === "provisorio" ? 8 : 20, block: staffFree(sim, "maintenance").length ? null : "Sem manutenção disponível agora." },
        { id: "externo2", label: "Chamar externo agora", detail: "Sem funcionário disponível? Pague o serviço externo.", cost: 300, minutes: 15 }],
      apply: (sim, o) => { if (o.choice === "provisorio") dir(sim.world).pendingFixes += 1; } },
    { title: "Limpar a água", options: () => [
      { id: "zelador", label: "Delegar à zeladoria", detail: "Seca o piso.", role: "custodian", minutes: 8 },
      { id: "fp", label: "Secar você mesmo(a)", detail: "Em 1ª pessoa, toque em Secar o piso.", fp: true },
      { id: "terceirizada", label: "Limpeza terceirizada", detail: "Equipe externa rápida.", cost: 120, minutes: 5 },
    ], apply: (_s, o) => { o.size = 0; } },
    { title: "Reabrir o ambiente", info: (_s, o) => (o.size <= 0 ? "Piso seco: pode reabrir." : "Ainda há água no piso."), options: () => [{ id: "reabrir", label: "Verificar e reabrir", detail: "Confere o local e libera o uso." }] },
  ],
  energia: [
    { title: "Identificar o setor afetado", options: () => [
      { id: "mapa", label: "Localizar no mapa", detail: "Mostra o prédio sem luz." },
      { id: "busca", label: "Pedir à manutenção", detail: "Percorre o setor e confirma.", role: "maintenance", minutes: 4 },
    ] },
    { title: "Verificar sobrecarga", info: (sim) => { const l = loadOf(sim.world); return `Carga ligada: ${l.load} · capacidade do quadro: ${l.capacity}. ${l.load > l.capacity ? "Sobrecarga provável." : "Carga dentro do limite — pode ter sido um desgaste."}`; }, options: () => [
      { id: "painel", label: "Conferir o painel de cargas", detail: "Leitura do consumo (sem instruções técnicas reais).", minutes: 2 },
    ] },
    { title: "Desligar equipamentos não essenciais", options: () => [
      { id: "desligar", label: "Desligar computadores e climatização", detail: "Reduz a carga; a informática pausa até o reparo." },
      { id: "manter", label: "Manter tudo ligado", detail: "Sem perdas agora, mas o reparo leva o dobro do tempo." },
    ], apply: (sim, o, opt) => { o.choice = opt; dir(sim.world).nonEssentialOff = opt === "desligar"; } },
    { title: "Solicitar o reparo", options: (sim, o) => [
      { id: "manut", label: "Equipe de manutenção", detail: "Usa 1 unid. de material.", role: "maintenance", minutes: o.choice === "manter" ? 24 : 12, block: sim.world.stock.materials < 1 ? "Sem material de manutenção." : staffFree(sim, "maintenance").length ? null : "Sem manutenção disponível agora." },
      { id: "externo", label: "Técnico externo", detail: "Serviço contratado.", cost: 450, minutes: o.choice === "manter" ? 30 : 15 },
    ], apply: (sim, o, opt) => { if (opt === "manut") sim.world.stock.materials = Math.max(0, sim.world.stock.materials - 1); const d = dir(sim.world); d.powerOut = false; d.nonEssentialOff = false; } },
    { title: "Evitar que volte a acontecer", info: (sim) => { const l = loadOf(sim.world); return `Carga ${l.load} / capacidade ${l.capacity}.`; }, options: () => [
      { id: "reforcar", label: "Reforçar o quadro elétrico", detail: "+3 de capacidade: reduz quedas futuras.", cost: 1800 },
      { id: "depois", label: "Agora não", detail: "Encerra o incidente; o risco continua." },
    ], apply: (sim, _o, opt) => { if (opt === "reforcar") dir(sim.world).electric += 1; } },
  ],
  merenda: [
    { title: "Conferir estoque e refeições", info: (sim) => { const st = sim.world.agents.filter((a) => a.role === "student" && a.active).length; return `Estoque: ${Math.floor(sim.world.stock.food)} refeições · alunos presentes: ${st}.`; }, options: () => [
      { id: "conferir", label: "Conferir com a cantina", detail: "Confirma quanto falta.", minutes: 2 },
    ] },
    { title: "Escolher alternativa de cardápio", options: () => [
      { id: "lanche", label: "Lanche reforçado com o que há", detail: "Sem custo; sacia menos e a nota de Alimentação cai um pouco." },
      { id: "compra", label: "Compra emergencial", detail: "+60 refeições chegam em 30 min.", cost: 420, minutes: 30 },
    ], apply: (sim, _o, opt) => { if (opt === "lanche") { sim.world.stock.food += 25; sim.world.reputation = clamp(sim.world.reputation - 0.5); } else sim.world.stock.food += 60; } },
    { title: "Ajustar o atendimento", options: () => [
      { id: "turmas", label: "Servir por turmas", detail: "Fila mais organizada: os alunos esperam mais sem desistir." },
      { id: "normal", label: "Manter atendimento normal", detail: "Sem mudança." },
    ], apply: (sim, _o, opt) => { if (opt === "turmas") dir(sim.world).queueByClassUntil = abs(sim.world) + 90; } },
    { title: "Reorganizar o abastecimento", info: (sim) => `Mínimo atual: ${sim.world.stock.min.food} · reposição automática: ${sim.world.stock.autoReorder ? "ligada" : "desligada"}.`, options: (sim) => [
      { id: "minimo", label: "Subir o estoque mínimo", detail: `Mínimo passa a ${Math.max(sim.world.stock.min.food, sim.world.enrolled * 2)} e a reposição automática é ligada.` },
      { id: "reserva", label: "Criar reserva estratégica", detail: "+40 refeições guardadas: reduz faltas futuras.", cost: 300 },
    ], apply: (sim, _o, opt) => { if (opt === "minimo") { sim.world.stock.min.food = Math.max(sim.world.stock.min.food, sim.world.enrolled * 2); sim.world.stock.autoReorder = true; } else { sim.world.stock.food += 40; dir(sim.world).foodReserve = true; } } },
  ],
  confusao: [
    { title: "Interromper a situação", options: (sim) => [
      { id: "fp", label: "Ir até lá (1ª pessoa)", detail: "Toque em Interromper perto dos alunos.", fp: true },
      { id: "inspetor", label: "Enviar coordenação", detail: "Caminha até o pátio.", role: "coordinator", minutes: 2, block: staffFree(sim, "coordinator").length ? null : "Sem coordenação disponível." },
      { id: "professor", label: "Pedir a um professor livre", detail: "Somente fora do horário de aula.", role: "teacher", minutes: 2, block: staffFree(sim, "teacher").length ? null : "Nenhum professor livre agora." },
    ], apply: (_s, o) => { o.calmed = true; } },
    { title: "Ouvir os envolvidos", options: () => [
      { id: "ouvir", label: "Conversar com cada um", detail: "Entender o que aconteceu antes de decidir.", minutes: 5 },
    ] },
    { title: "Escolher a intervenção", info: () => "Não existe resposta automática: a punição mais severa não é necessariamente a melhor.", options: () => [
      { id: "mediacao", label: "Mediação com acordo", detail: "Bem-estar sobe e a chance de novo conflito cai." },
      { id: "projeto", label: "Atividade em dupla", detail: "Aproxima os dois (podem virar amigos); efeito mais lento." },
      { id: "responsavel", label: "Chamar os responsáveis", detail: "3 dias sem conflitos; ânimo cai um pouco." },
      { id: "advertencia", label: "Advertência formal", detail: "Registro na ficha; ânimo cai e o risco de reincidência sobe." },
    ], apply: (sim, o, opt) => interveneConflict(sim, o, opt) },
    { title: "Acompanhar nos próximos dias", options: () => [{ id: "acompanhar", label: "Agendar acompanhamento", detail: "A ficha registra a evolução amanhã e depois." }],
      apply: (sim, o) => { dir(sim.world).followUps.push({ ids: [...o.agents], untilDay: sim.world.day + 2, choice: o.choice ?? "mediacao" }); } },
  ],
  professor: [
    { title: "Cobrir a aula", info: (sim, o) => `${sim.world.staff.find((m) => `crew-${m.id}` === o.agents[0])?.name ?? "Um professor"} faltou hoje.`, options: (sim) => [
      { id: "substituto", label: "Convocar substituto", detail: "Aprendizagem de hoje em 85%.", cost: 260 },
      { id: "remanejar", label: "Remanejar horários", detail: "Sem custo; aprendizagem em 70% e salas mais cheias." },
      { id: "supervisionada", label: "Atividade supervisionada", detail: sim.world.staff.some((m) => m.role === "coordinator") ? "Coordenação acompanha: aprendizagem em 55%." : "Sem coordenação: aprendizagem em 45%." },
    ], apply: (sim, _o, opt) => { dir(sim.world).teacherFactor = opt === "substituto" ? 0.85 : opt === "remanejar" ? 0.7 : sim.world.staff.some((m) => m.role === "coordinator") ? 0.55 : 0.45; } },
  ],
};
export function incidentSteps(o: Occurrence) { return STEPS[o.type] ?? []; }
function interveneConflict(sim: Sim, o: Occurrence, opt: string) {
  o.choice = opt;
  const d = dir(sim.world);
  for (const id of o.agents) {
    const a = sim.world.agents.find((x) => x.id === id);
    if (!a) continue;
    const r = d.records[a.id];
    if (opt === "mediacao") { a.mood = clamp(a.mood + 10); a.needs.social = clamp(a.needs.social + 10); record(sim, a, "mediacao", "Conflito resolvido com mediação e acordo."); }
    if (opt === "projeto") { a.mood = clamp(a.mood + 5); const other = o.agents.find((x) => x !== id); if (other && !a.friends.includes(other)) a.friends.push(other); record(sim, a, "mediacao", "Atividade em dupla após conflito."); }
    if (opt === "responsavel") { if (r) r.calmUntilDay = sim.world.day + 3; a.mood = clamp(a.mood - 4); record(sim, a, "responsavel", "Responsáveis chamados após conflito."); }
    if (opt === "advertencia") { if (r) r.warnings += 1; a.mood = clamp(a.mood - 10); record(sim, a, "advertencia", "Advertência formal após conflito."); }
    a.conflictId = null;
    a.waitTimer = 0;
    a.path = [];
    if (a.active && a.status !== "expulso") assignTarget(sim, a);
  }
  if (opt === "mediacao" || opt === "projeto") { d.log.conflictsMediated += 1; d.points.convivencia += 1; }
  else d.log.conflictsMediated += 1;
}
const now = (w: GameWorld) => abs(w);
function openOcc(sim: Sim, type: OccType, x: number, z: number, buildingId: string | null, agents: string[] = [], deadlineMin = 120, cause = ""): Occurrence {
  const d = dir(sim.world);
  const mult = difficulty(sim.world).deadline;
  const o: Occurrence = { id: `oc-${sim.world.day}-${type}-${Math.round(sim.world.minutes)}`, type, title: OCC_INFO[type].title, x, z, buildingId, startedAt: abs(sim.world), deadline: abs(sim.world) + Math.round(deadlineMin * mult), activeSeconds: 0, status: "aberta", agents, helperId: null, size: 0.2, stage: 0, history: [], cause };
  d.occurrences.unshift(o);
  if (d.occurrences.length > 30) d.occurrences.length = 30;
  d.log.occOpened += 1;
  notify(sim, type === "fiscalizacao" ? "warn" : "bad", o.title, `${cause ? cause + " " : ""}Abra o Gabinete para decidir.`, o.id, 1);
  sfxQueue.push("alerta");
  return o;
}
function closeOcc(sim: Sim, o: Occurrence, status: "resolvida" | "ignorada", outcome: string) {
  if (o.status !== "aberta") return; // desfecho registrado uma única vez
  o.status = status;
  o.outcome = outcome;
  const d = dir(sim.world);
  d.lastResolvedAt = abs(sim.world);
  if (status === "resolvida") d.log.occResolved += 1;
  else d.log.occIgnored += 1;
  if (o.type === "energia") { d.powerOut = false; d.nonEssentialOff = false; }
  for (const t of d.tasks) if (t.ref === o.id && t.status !== "concluida") cancelTask(sim, t, "Incidente encerrado.");
  if (o.type === "confusao") {
    for (const id of o.agents) {
      const a = sim.world.agents.find((x) => x.id === id);
      if (!a || !a.conflictId) continue;
      a.conflictId = null;
      a.waitTimer = 0;
      a.path = [];
      if (a.active && a.status !== "expulso") assignTarget(sim, a);
    }
  }
  notify(sim, status === "resolvida" ? "good" : "bad", `${o.title}: ${status}`, outcome, `${o.id}-end`, 1);
}
function completeStep(sim: Sim, o: Occurrence, optId: string, label: string) {
  const steps = incidentSteps(o);
  const st = steps[o.stage];
  if (!st || o.status !== "aberta") return;
  st.apply?.(sim, o, optId);
  o.history.push(`${st.title}: ${label}`);
  o.busyUntil = undefined;
  o.awaitFP = undefined;
  o.stage += 1;
  if (o.stage >= steps.length) {
    const pend = o.type === "cano" && o.choice === "provisorio" ? " Ficou uma pendência: faça o reparo definitivo depois." : "";
    closeOcc(sim, o, "resolvida", `${o.history.slice(-2).join(" · ")}.${pend}`);
  }
}
/** Executa a opção escolhida para a etapa atual do incidente. */
export function incidentAction(sim: Sim, id: string, optId: string): { ok: boolean; message: string } {
  const o = dir(sim.world).occurrences.find((x) => x.id === id);
  if (!o || o.status !== "aberta") return { ok: false, message: "Incidente já encerrado." };
  if (o.busyUntil || o.taskId) return { ok: false, message: "A etapa atual ainda está em execução." };
  const st = incidentSteps(o)[o.stage];
  if (!st) return { ok: false, message: "Nada a fazer." };
  const opt = st.options(sim, o).find((x) => x.id === optId);
  if (!opt) return { ok: false, message: "Opção inválida." };
  if (opt.block) return { ok: false, message: opt.block };
  const cost = Math.round((opt.cost ?? 0) * difficulty(sim.world).costMult);
  if (cost && sim.world.budget < cost) return { ok: false, message: `Saldo insuficiente (R$ ${cost}).` };
  if (opt.fp) { o.awaitFP = opt.id; return { ok: true, message: "Vá até o local em 1ª pessoa: o botão de ação aparece quando estiver perto." }; }
  if (opt.role) {
    const t = delegateTask(sim, { kind: "incidente", label: `${o.title}: ${st.title}`, role: opt.role, x: o.x, z: o.z, minutes: opt.minutes ?? 5, ref: o.id, opt: opt.id });
    if (!t.ok) return t;
    if (cost) addLedger(sim, -cost, o.title, st.title, "utilidades");
    o.taskId = t.taskId;
    return { ok: true, message: t.message };
  }
  if (cost) addLedger(sim, -cost, o.title, `${st.title}: ${opt.label}`, "utilidades");
  if (opt.minutes) { o.busyUntil = now(sim.world) + opt.minutes; o.busyOpt = opt.id; o.busyLabel = opt.label; return { ok: true, message: `${opt.label}: em andamento (${opt.minutes} min de jogo).` }; }
  completeStep(sim, o, opt.id, opt.label);
  return { ok: true, message: `${opt.label}: feito.` };
}
function planDay(world: GameWorld) {
  const d = dir(world);
  const s = `${world.rngSeed}-${world.day}`;
  const diff = difficulty(world);
  const plan: DirectorState["plan"] = [];
  const wetRooms = world.buildings.filter((b) => (b.kind === "bathroom" || b.kind === "canteen") && b.progress >= 1);
  const cond = wetRooms.length ? wetRooms.reduce((a, b) => a + b.condition, 0) / wetRooms.length : 90;
  const preventive = prog(world).investId === "manutencao" && world.day - prog(world).investDay <= 3;
  const pCano = Math.min(0.85, 0.12 + Math.max(0, (85 - cond) / 100)) * (preventive ? 0.35 : 1) * (d.pendingFixes > 0 ? 1.8 : 1) * diff.incident;
  const l = loadOf(world);
  const pEnergia = (l.load > l.capacity ? 0.55 : 0.06) * diff.incident;
  const st = world.agents.filter((a) => a.role === "student" && a.status !== "expulso" && a.status !== "suspenso");
  const tense = st.length ? st.filter((a) => a.mood < 45).length / st.length : 0;
  const pConf = Math.min(0.8, 0.15 + tense * 1.2) * diff.incident;
  const tired = world.staff.filter((m) => m.role === "teacher" && m.rest < 40).length;
  const pProf = world.day >= 2 && world.staff.filter((m) => m.role === "teacher").length ? (0.06 + tired * 0.15) * diff.incident : 0;
  const pick = (k: string, p: number) => rnd(s + k) < p;
  const convMission = d.missions.some((m) => m.kind === "convivencia");
  if (pick("cano", pCano)) plan.push({ day: world.day, type: "cano", at: 480 + Math.floor(rnd(s + "cano-t") * 330), done: false, cause: `Conservação média dos banheiros/cantina em ${Math.round(cond)}%${d.pendingFixes ? `, ${d.pendingFixes} reparo(s) provisório(s) pendente(s)` : ""}${preventive ? " (a manutenção preventiva reduziu o risco)" : ""}.` });
  if (pick("energia", pEnergia)) plan.push({ day: world.day, type: "energia", at: 500 + Math.floor(rnd(s + "en-t") * 300), done: false, cause: `Carga elétrica ${l.load} para capacidade ${l.capacity}.` });
  if (convMission || pick("conf", pConf)) plan.push({ day: world.day, type: "confusao", at: 560 + Math.floor(rnd(s + "c1") * 15), done: false, cause: `${Math.round(tense * 100)}% dos alunos estão com ânimo baixo; o intervalo concentra a turma no pátio.` });
  if (pick("prof", pProf)) plan.push({ day: world.day, type: "professor", at: 455, done: false, cause: tired ? `${tired} professor(es) com descanso abaixo de 40%.` : "Imprevisto pessoal." });
  if (world.day >= 3 && pick("fisc", 0.25 * diff.incident)) plan.push({ day: world.day, type: "fiscalizacao", at: 600 + Math.floor(rnd(s + "fi") * 200), done: false, cause: "Visita de rotina da secretaria de educação." });
  d.plan = plan;
}
function startPlanned(sim: Sim, type: OccType, cause = "") {
  const w = sim.world;
  const d = dir(w);
  const diff = difficulty(w);
  const open = d.occurrences.filter((o) => o.status === "aberta");
  if (open.some((o) => o.type === type && type !== "confusao")) return;
  // limite de incidentes simultâneos e período de recuperação: a partida nunca vira uma sequência impossível
  if (type !== "fiscalizacao" && (open.length >= diff.maxOpen || abs(w) - d.lastResolvedAt < diff.recovery)) return;
  if (type === "cano") {
    const b = w.buildings.filter((x) => (x.kind === "bathroom" || x.kind === "canteen") && x.progress >= 1).sort((a, b2) => a.condition - b2.condition)[0];
    if (!b) return;
    const e = entryPoint(b);
    if (d.pendingFixes > 0) d.pendingFixes -= 1;
    openOcc(sim, "cano", e.x + 0.8, e.z + 0.4, b.id, [], 150, cause);
  } else if (type === "energia") {
    const r = w.buildings.find((x) => (x.kind === "computer" || x.kind === "media") && x.progress >= 1) ?? w.buildings.find((x) => x.kind === "reception" && x.progress >= 1) ?? w.buildings.find((x) => x.progress >= 1);
    if (!r) return;
    const e = entryPoint(r);
    d.powerOut = true;
    openOcc(sim, "energia", e.x, e.z, r.id, [], 180, cause);
  } else if (type === "confusao") {
    const free = activeStudents(w).filter((a) => a.active && a.visible && !a.conflictId && a.intent !== "leave" && !(a.seatKey && sim.seats.find((s) => s.key === a.seatKey)?.kind === "classroom"));
    const calm = (a: Agent) => (d.records[a.id]?.calmUntilDay ?? 0) >= w.day;
    const pool = free.filter((a) => !calm(a));
    if (pool.length < 2) return;
    const a = pool[Math.floor(rnd(`${w.day}-${w.minutes}`) * pool.length)];
    const b = pool.filter((x) => x !== a).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
    const patio = w.buildings.find((x) => x.kind === "patio" && x.progress >= 1);
    const spot = patio ? entryPoint(patio) : { x: a.x, z: a.z };
    const o = openOcc(sim, "confusao", spot.x, spot.z, patio?.id ?? null, [a.id, b.id], 45, cause);
    for (const [k, ag] of [a, b].entries()) {
      releaseSeat(sim, ag);
      sim.queue = sim.queue.filter((id) => id !== ag.id);
      ag.conflictId = o.id;
      planOf(sim, ag, { x: spot.x + (k ? 0.55 : -0.55), z: spot.z });
      ag.activity = "Discussão no pátio";
      record(sim, ag, "ocorrencia", "Envolvido(a) em conflito no intervalo.");
    }
  } else if (type === "merenda") {
    const c = w.buildings.find((x) => x.kind === "canteen" && x.progress >= 1);
    if (!c) return;
    const e = entryPoint(c);
    openOcc(sim, "merenda", e.x, e.z, c.id, [], 75, cause);
  } else if (type === "professor") {
    const t = w.agents.find((a) => a.role === "teacher" && a.id.startsWith("crew-"));
    if (!t) return;
    t.absentDay = w.day;
    if (t.active) { t.active = false; t.visible = false; t.path = []; }
    d.teacherFactor = 0.4;
    const r = w.buildings.find((x) => x.kind === "classroom" && x.progress >= 1);
    openOcc(sim, "professor", r?.x ?? 0, r?.z ?? 0, r?.id ?? null, [t.id], 60, cause);
  } else if (type === "fiscalizacao") {
    openOcc(sim, "fiscalizacao", GATE.x, GATE.z + 2, null, [], 600, cause);
  }
}
export function inspectionChecklist(world: GameWorld) {
  const d = dir(world);
  const bs = world.buildings.filter((b) => b.progress >= 1 && BUILDABLE_BY_KIND[b.kind] && !BUILDABLE_BY_KIND[b.kind].open);
  const dirt = bs.length ? bs.reduce((s, b) => s + b.dirt, 0) / bs.length : 0;
  const open = d.occurrences.filter((o) => o.status === "aberta" && o.type !== "fiscalizacao" && o.type !== "confusao");
  return [
    { label: `Higiene: sujeira média ≤ 35% (agora ${Math.round(dirt)}%)`, ok: dirt <= 35 },
    { label: `Organização: até 3 lixos no chão (agora ${d.litter.length})`, ok: d.litter.length <= 3 },
    { label: `Segurança: nenhum incidente de infraestrutura aberto (${open.length})`, ok: open.length === 0 },
  ];
}
function occurrencesTick(sim: Sim, dtMinutes: number) {
  const w = sim.world;
  const d = dir(w);
  const t = now(w);
  for (const p of d.plan) {
    if (!p.done && p.day === w.day && w.minutes >= p.at) {
      p.done = true;
      startPlanned(sim, p.type, p.cause ?? "");
    }
  }
  if (w.minutes >= 690 && w.minutes < 692 && w.stock.food < activeStudents(w).length * 0.9 && !d.occurrences.some((o) => o.type === "merenda" && Math.floor(o.startedAt / 1440) === w.day))
    startPlanned(sim, "merenda", `Estoque de ${Math.floor(w.stock.food)} refeições para ${activeStudents(w).length} alunos${d.foodReserve ? "" : " e nenhuma reserva"}.`);
  for (const o of d.occurrences) {
    if (o.status !== "aberta") continue;
    if (o.busyUntil && t >= o.busyUntil) completeStep(sim, o, o.busyOpt ?? "", o.busyLabel ?? "concluído");
    if (o.type === "cano") {
      if (!o.closedValve) o.size = Math.min(1, o.size + dtMinutes / 60);
      const b = w.buildings.find((x) => x.id === o.buildingId);
      if (b && !o.closedValve) b.dirt = clamp(b.dirt + dtMinutes * 0.12);
    }
    if (o.type === "energia" && o.stage < 4) d.powerOut = true;
    if (o.type === "confusao" && !o.calmed) {
      for (const id of o.agents) {
        const a = w.agents.find((x) => x.id === id);
        if (!a || !a.active || a.status === "expulso") continue;
        if (a.path.length === 0) {
          a.state = "idle";
          a.activity = "Discussão no pátio";
          a.waitTimer = Math.max(a.waitTimer, 3);
          const other = w.agents.find((x) => o.agents.includes(x.id) && x.id !== a.id);
          if (other) a.heading = Math.atan2(other.x - a.x, other.z - a.z);
        }
        a.needs.comfort = clamp(a.needs.comfort - dtMinutes * 0.2);
      }
    }
    if (o.type === "fiscalizacao") {
      const checks = inspectionChecklist(w);
      if (checks.every((c) => c.ok)) {
        closeOcc(sim, o, "resolvida", "Fiscalização aprovada: higiene, organização e segurança em dia. Bônus de R$ 900.");
        addLedger(sim, 900, "Fiscalização aprovada", "Bônus de qualidade", "verba");
        w.reputation = clamp(w.reputation + 3);
      } else if (o.activeSeconds >= 60) {
        closeOcc(sim, o, "ignorada", `Fiscalização reprovada: ${checks.filter((c) => !c.ok).map((c) => c.label.split(":")[0]).join(", ")}. Multa de R$ 600.`);
        addLedger(sim, -600, "Multa da fiscalização", "Critérios não atendidos", "utilidades");
        w.reputation = clamp(w.reputation - 3);
      }
      continue;
    }
    // prazo: só pune quem não começou a agir; quem está agindo sofre só o efeito gradual (poça, luz apagada)
    if (t >= o.deadline && o.stage === 0 && !o.taskId && !o.busyUntil && !o.awaitFP) {
      const cost = Math.round(500 * difficulty(w).costMult);
      if (o.type === "cano") { addLedger(sim, -cost, "Reparo emergencial", "Vazamento ignorado", "utilidades"); w.reputation = clamp(w.reputation - 2); closeOcc(sim, o, "ignorada", `Sem resposta: reparo emergencial por R$ ${cost} e reputação −2.`); }
      else if (o.type === "confusao") { for (const id of o.agents) { const a = w.agents.find((x) => x.id === id); if (a) a.needs.comfort = clamp(a.needs.comfort - 12); } w.reputation = clamp(w.reputation - 1); closeOcc(sim, o, "ignorada", "O conflito se dispersou sem intervenção; conforto e reputação caíram."); }
      else if (o.type === "merenda") { w.reputation = clamp(w.reputation - 2); closeOcc(sim, o, "ignorada", "Parte dos alunos ficou sem almoço; reputação −2."); }
      else if (o.type === "energia") { w.reputation = clamp(w.reputation - 2); addLedger(sim, -cost, "Técnico emergencial", "Queda ignorada", "utilidades"); closeOcc(sim, o, "ignorada", `Técnico emergencial por R$ ${cost}.`); }
      else if (o.type === "professor") { d.teacherFactor = 0.3; w.reputation = clamp(w.reputation - 1); closeOcc(sim, o, "ignorada", "A turma ficou sem atividade organizada (aprendizagem em 30% hoje)."); }
    }
  }
}
/** Compatibilidade: mediação direta pelo gabinete (ficha do aluno) percorre as etapas com a mediação. */
export function mediateOccurrence(sim: Sim, id: string, how: "diretor" | "gabinete") {
  const o = dir(sim.world).occurrences.find((x) => x.id === id);
  if (!o || o.status !== "aberta" || o.type !== "confusao") return { ok: false, message: "Ocorrência indisponível." };
  if (o.taskId || o.busyUntil) return { ok: false, message: "Uma etapa já está em andamento." };
  const steps = incidentSteps(o);
  while (o.status === "aberta" && o.stage < steps.length) {
    const opts = steps[o.stage].options(sim, o);
    const pick = opts.find((x) => x.id === "mediacao") ?? opts.find((x) => !x.role && !x.fp && !x.block) ?? opts[0];
    completeStep(sim, o, pick.id, pick.label);
  }
  dir(sim.world).log.actions += 1;
  dir(sim.world).log.positive += 1;
  o.viaDirector = how === "diretor";
  if (how === "diretor") prog(sim.world).counters.personal += 1;
  return { ok: true, message: "Conflito mediado com acordo; acompanhamento agendado." };
}

// ------------------------------------------------------------------ delegação: funcionários caminham e executam
export type TaskKind = "incidente" | "inspecionar" | "conversar" | "fila" | "obra" | "conflito" | "manutencao";
export interface DTask { id: string; kind: TaskKind; label: string; agentId: string; x: number; z: number; minutes: number; status: "a caminho" | "executando" | "concluida" | "impedida"; until?: number; eta: number; ref?: string; opt?: string; note?: string; createdAt: number }
export const TASK_INFO: Record<Exclude<TaskKind, "incidente">, { label: string; role: AgentRole[]; minutes: number; effect: string }> = {
  inspecionar: { label: "Inspecionar uma sala", role: ["coordinator", "teacher"], minutes: 8, effect: "Relata limpeza, conservação e ocupação; −10 de sujeira." },
  conversar: { label: "Conversar com um aluno", role: ["coordinator", "teacher"], minutes: 6, effect: "+ânimo e +socialização do aluno; registro na ficha." },
  fila: { label: "Acompanhar a fila da cantina", role: ["coordinator", "canteen"], minutes: 40, effect: "A fila anda 40% mais rápido enquanto o funcionário organiza." },
  obra: { label: "Verificar uma obra", role: ["maintenance"], minutes: 10, effect: "Remove impedimentos: +8% de progresso." },
  conflito: { label: "Resolver um conflito", role: ["coordinator", "teacher"], minutes: 6, effect: "Interrompe e media o conflito aberto." },
  manutencao: { label: "Chamar manutenção", role: ["maintenance"], minutes: 15, effect: "Conservação +20 no prédio (usa 1 unid. de material)." },
};
export function staffAvailability(sim: Sim, roles: AgentRole[]) {
  return roles.flatMap((r) => staffFree(sim, r));
}
export function delegateTask(sim: Sim, req: { kind: TaskKind; label: string; role?: AgentRole; roles?: AgentRole[]; x: number; z: number; minutes: number; ref?: string; opt?: string }): { ok: boolean; message: string; taskId?: string } {
  const roles = req.roles ?? (req.role ? [req.role] : []);
  const free = staffAvailability(sim, roles).sort((a, b) => Math.hypot(a.x - req.x, a.z - req.z) - Math.hypot(b.x - req.x, b.z - req.z));
  const agent = free[0];
  if (!agent) return { ok: false, message: `Nenhum funcionário de ${roles.map((r) => roleName[r] ?? r).join(" ou ")} disponível agora. Contrate ou escolha outra opção.` };
  releaseSeat(sim, agent);
  if (!planOf(sim, agent, { x: req.x, z: req.z })) return { ok: false, message: `${agent.name} não encontrou caminho até o local. Verifique acessos bloqueados.` };
  const len = agent.path.reduce((s, p, i) => s + (i ? Math.hypot(p.x - agent.path[i - 1].x, p.z - agent.path[i - 1].z) : Math.hypot(p.x - agent.x, p.z - agent.z)), 0);
  const eta = Math.ceil((len / (agent.speed * WALK_SCALE)) * MINUTES_PER_SECOND);
  const d = dir(sim.world);
  const t: DTask = { id: `tk-${Date.now().toString(36)}-${d.tasks.length}`, kind: req.kind, label: req.label, agentId: agent.id, x: req.x, z: req.z, minutes: req.minutes, status: "a caminho", eta, ref: req.ref, opt: req.opt, createdAt: abs(sim.world) };
  agent.taskId = t.id;
  agent.activity = `A caminho: ${req.label}`;
  d.tasks.unshift(t);
  if (d.tasks.length > 20) d.tasks.length = 20;
  return { ok: true, message: `${agent.name} está indo (~${eta} min de caminhada).`, taskId: t.id };
}
function cancelTask(sim: Sim, t: DTask, note: string) {
  t.status = "impedida";
  t.note = note;
  const a = sim.world.agents.find((x) => x.id === t.agentId);
  if (a && a.taskId === t.id) { a.taskId = null; a.waitTimer = 0; }
  const o = dir(sim.world).occurrences.find((x) => x.id === t.ref);
  if (o && o.taskId === t.id) o.taskId = undefined;
}
export function delegate(sim: Sim, kind: Exclude<TaskKind, "incidente">, targetId: string) {
  const w = sim.world;
  const info = TASK_INFO[kind];
  const b = w.buildings.find((x) => x.id === targetId);
  const s = w.agents.find((x) => x.id === targetId);
  const o = dir(w).occurrences.find((x) => x.id === targetId);
  const target = b ? entryPoint(b) : s ? { x: s.x, z: s.z } : o ? { x: o.x, z: o.z } : null;
  if (kind === "fila") { const c = w.buildings.find((x) => x.kind === "canteen" && x.progress >= 1); if (c) return delegateTask(sim, { kind, label: info.label, roles: info.role, ...entryPoint(c), minutes: info.minutes, ref: c.id }); }
  if (!target) return { ok: false, message: "Escolha um alvo." };
  if (kind === "conflito" && o) {
    if (o.taskId || o.busyUntil) return { ok: false, message: "Já há alguém cuidando deste conflito." };
    const r = delegateTask(sim, { kind, label: info.label, roles: info.role, x: target.x, z: target.z, minutes: info.minutes, ref: o.id });
    if (r.ok) o.taskId = r.taskId;
    return r;
  }
  if (kind === "manutencao" && w.stock.materials < 1) return { ok: false, message: "Sem material de manutenção em estoque." };
  return delegateTask(sim, { kind, label: info.label, roles: info.role, x: target.x, z: target.z, minutes: info.minutes, ref: targetId });
}
function finishTask(sim: Sim, t: DTask) {
  const w = sim.world;
  const d = dir(w);
  t.status = "concluida";
  const a = w.agents.find((x) => x.id === t.agentId);
  if (a) { a.taskId = null; a.waitTimer = 0; }
  if (t.kind === "incidente" || t.kind === "conflito") {
    const o = d.occurrences.find((x) => x.id === t.ref);
    if (!o || o.status !== "aberta") return;
    o.taskId = undefined;
    if (t.kind === "conflito") {
      if (o.stage === 0) completeStep(sim, o, "inspetor", `Interrompido por ${a?.name ?? "funcionário"}`);
      if (o.stage === 1) completeStep(sim, o, "ouvir", "Envolvidos ouvidos");
      t.note = "Conflito interrompido e envolvidos ouvidos: escolha a intervenção no gabinete.";
      return;
    }
    const st = incidentSteps(o)[o.stage];
    const opt = st?.options(sim, o).find((x) => x.id === t.opt);
    completeStep(sim, o, t.opt ?? "", `${opt?.label ?? "Delegado"} (${a?.name ?? "equipe"})`);
    return;
  }
  const b = w.buildings.find((x) => x.id === t.ref);
  const s = w.agents.find((x) => x.id === t.ref);
  if (t.kind === "inspecionar" && b) { b.dirt = clamp(b.dirt - 10); t.note = `Limpeza ${Math.round(100 - b.dirt)}%, conservação ${Math.round(b.condition)}%, ${sim.seats.filter((x) => x.buildingId === b.id && sim.claims.has(x.key)).length}/${sim.seats.filter((x) => x.buildingId === b.id).length} lugares ocupados.`; }
  if (t.kind === "conversar" && s) { s.mood = clamp(s.mood + 8); s.needs.social = clamp(s.needs.social + 8); record(sim, s, "conversa", `Conversa com ${a?.name ?? "equipe"} (delegada pelo diretor).`); t.note = `${s.name} se sentiu ouvido(a).`; }
  if (t.kind === "fila") { d.queueHelpUntil = abs(w) + 1; t.note = "Fila acompanhada."; }
  if (t.kind === "obra" && b && b.progress < 1) { b.progress = Math.min(0.999, b.progress + 0.08); t.note = "Impedimentos resolvidos: +8% na obra."; }
  if (t.kind === "manutencao" && b) { b.condition = clamp(b.condition + 20); w.stock.materials = Math.max(0, w.stock.materials - 1); t.note = `Conservação de ${roomLabelFor(b, w.buildings)} em ${Math.round(b.condition)}%.`; }
}
function tasksTick(sim: Sim) {
  const w = sim.world;
  const d = dir(w);
  const t0 = abs(w);
  for (const t of d.tasks) {
    if (t.status === "concluida" || t.status === "impedida") continue;
    const a = w.agents.find((x) => x.id === t.agentId);
    if (!a || !a.active) { cancelTask(sim, t, "Funcionário saiu do expediente."); continue; }
    if (w.minutes >= 1015) { cancelTask(sim, t, "Fim do expediente."); continue; }
    const dist = Math.hypot(a.x - t.x, a.z - t.z);
    if (t.status === "a caminho") {
      if (dist < 1.9) {
        t.status = "executando";
        const member = w.staff.find((m) => `crew-${m.id}` === a.id);
        const speed = 1.3 - (member?.skill ?? 60) / 200;
        t.until = t0 + Math.max(1, Math.round(t.minutes * speed));
        a.path = [];
        a.state = t.kind === "manutencao" || t.kind === "obra" || t.kind === "incidente" ? "fix" : "idle";
        a.activity = `Executando: ${t.label}`;
      } else if (a.path.length === 0 && !planOf(sim, a, { x: t.x, z: t.z })) {
        cancelTask(sim, t, "Sem caminho até o local (acesso bloqueado).");
      }
    } else if (t.status === "executando") {
      a.waitTimer = Math.max(a.waitTimer, 1);
      if (t.kind === "fila") d.queueHelpUntil = t0 + 2;
      if (t.until !== undefined && t0 >= t.until) finishTask(sim, t);
    }
  }
}

// ------------------------------------------------------------------ lixo do recreio
function spawnLitter(sim: Sim, reason: string) {
  const w = sim.world;
  const d = dir(w);
  const users = activeStudents(w).filter((a) => a.active && a.visible && !(a.seatKey && sim.seats.find((s) => s.key === a.seatKey)?.kind === "classroom"));
  const factor = w.improvements.includes("bins") ? 0.18 : 0.35;
  const n = Math.min(12, Math.ceil(users.length * factor));
  for (let i = 0; i < n && d.litter.length < 30; i++) {
    const a = users[Math.floor(rnd(`${w.day}-${reason}-${i}`) * users.length)];
    if (!a) break;
    const x = a.x + (rnd(a.id + i) - 0.5) * 1.6;
    const z = a.z + (rnd(a.id + i + "z") - 0.5) * 1.6;
    if (!walkableAt(sim.grid, x, z)) continue;
    d.litter.push({ id: `lx-${w.day}-${reason}-${i}`, x, z, kind: i % 3, at: abs(w) });
  }
}
export function collectLitter(sim: Sim, id: string, by: "diretor" | "zelador") {
  const d = dir(sim.world);
  const i = d.litter.findIndex((l) => l.id === id);
  if (i < 0) return false; // já recolhido: sem segunda recompensa
  d.litter.splice(i, 1);
  d.log.litterCollected += 1;
  if (by === "diretor") d.points.higiene += 1;
  return true;
}
const custodianTarget = new Map<string, string>();
function litterTick(sim: Sim, dtMinutes: number, prevMinutes: number) {
  const w = sim.world;
  const d = dir(w);
  if (prevMinutes < 585 && w.minutes >= 585) spawnLitter(sim, "recreio");
  if (prevMinutes < 750 && w.minutes >= 750) spawnLitter(sim, "almoco");
  if (d.litter.length) {
    for (const a of w.agents) if (a.role === "student" && a.active) {
      a.needs.hygiene = clamp(a.needs.hygiene - dtMinutes * 0.004 * d.litter.length);
      a.mood = clamp(a.mood - dtMinutes * 0.003 * d.litter.length);
    }
  }
  for (const c of w.agents) {
    if (c.role !== "custodian" || !c.active) continue;
    const tid = custodianTarget.get(c.id);
    const target = tid ? d.litter.find((l) => l.id === tid) : undefined;
    if (target) {
      if (Math.hypot(c.x - target.x, c.z - target.z) < 0.9) {
        collectLitter(sim, target.id, "zelador");
        custodianTarget.delete(c.id);
        c.waitTimer = 2;
      } else if (c.path.length === 0) planOf(sim, c, { x: target.x, z: target.z });
    } else if (d.litter.length && (c.path.length === 0 || c.state === "idle")) {
      const near = [...d.litter].sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[0];
      custodianTarget.set(c.id, near.id);
      c.intent = "clean";
      c.activity = "Recolhendo lixo do recreio";
      planOf(sim, c, { x: near.x, z: near.z });
    }
  }
}

// ------------------------------------------------------------------ ações do diretor
export type DirectorActionId = "conversar" | "elogiar" | "orientar" | "mediar" | "responsavel" | "advertir" | "suspender" | "expulsar";
export function returnDayFor(world: GameWorld, days: number) {
  return world.day + Math.max(1, Math.min(10, Math.round(days)));
}
export function directorAction(sim: Sim, studentId: string, action: DirectorActionId, opts: { days?: number; reason?: string } = {}): { ok: boolean; message: string } {
  const w = sim.world;
  const a = w.agents.find((x) => x.id === studentId && x.role === "student");
  const d = dir(w);
  if (!a) return { ok: false, message: "Aluno não encontrado." };
  if (a.status === "expulso") return { ok: false, message: "Matrícula encerrada." };
  const r = d.records[a.id] ?? (d.records[a.id] = newRecord(w, a));
  const phase = phaseFor(w.minutes);
  const atSchool = a.active && a.visible;
  d.log.actions += 1;
  storyOnAction(sim, a.id, action);
  switch (action) {
    case "conversar":
      a.needs.social = clamp(a.needs.social + 8);
      a.mood = clamp(a.mood + 6);
      record(sim, a, "conversa", "Conversa com o diretor.");
      d.log.positive += 1;
      return { ok: true, message: `${a.name} se sentiu ouvido(a). Socialização +8.` };
    case "elogiar":
      a.mood = clamp(a.mood + 10);
      a.needs.learning = clamp(a.needs.learning + 4);
      record(sim, a, "elogio", "Elogio do diretor.");
      d.log.positive += 1;
      return { ok: true, message: `${a.name} recebeu um elogio. Ânimo +10.` };
    case "orientar": {
      if (!atSchool) return { ok: false, message: `${a.name} não está na escola agora.` };
      if (phase !== "class") return { ok: false, message: "Orientar de volta à aula só funciona durante o horário de aula." };
      const seat = a.seatKey ? sim.seats.find((s) => s.key === a.seatKey) : null;
      if (seat?.kind === "classroom" && a.intent === "class") return { ok: false, message: `${a.name} já está indo/sentado na carteira.` };
      if (a.conflictId) return { ok: false, message: "Resolva primeiro a confusão em que o aluno está envolvido." };
      a.skipping = false;
      sim.queue = sim.queue.filter((id) => id !== a.id);
      const free = classroomSeat(sim, a);
      if (!free) {
        record(sim, a, "orientacao", "Orientado a voltar à aula, mas não havia carteira livre.");
        notify(sim, "warn", "Sem carteira livre", `${a.name} não tem onde sentar. Amplie a sala ou adicione outra.`, "orient-noseat", 30);
        return { ok: false, message: "Não há carteira livre. Nenhum ponto de Disciplina foi concedido." };
      }
      takeSeat(sim, a, free, "class");
      if (!a.seatKey) return { ok: false, message: "Não há rota até a sala. Verifique a entrada do prédio." };
      a.orientPending = true;
      a.activity = "Voltando para a aula (orientado)";
      record(sim, a, "orientacao", "Orientado a voltar à aula.");
      return { ok: true, message: `${a.name} reservou uma carteira e está a caminho. O ponto é dado quando sentar.` };
    }
    case "mediar": {
      const o = d.occurrences.find((x) => x.status === "aberta" && x.type === "confusao" && x.agents.includes(a.id));
      if (!o) return { ok: false, message: "Não há conflito aberto com este aluno." };
      d.log.actions -= 1;
      return mediateOccurrence(sim, o.id, "gabinete");
    }
    case "responsavel":
      r.calmUntilDay = w.day + 3;
      a.mood = clamp(a.mood - 4);
      record(sim, a, "responsavel", "Responsável chamado à escola. Combinado acompanhamento por 3 dias.");
      return { ok: true, message: "Responsável chamado. Nos próximos 3 dias o aluno não se envolve em confusões." };
    case "advertir":
      r.warnings += 1;
      a.mood = clamp(a.mood - 6);
      record(sim, a, "advertencia", `Advertência nº ${r.warnings}${opts.reason ? `: ${opts.reason}` : ""}.`);
      return { ok: true, message: `Advertência registrada (${r.warnings}).` };
    case "suspender": {
      const back = returnDayFor(w, opts.days ?? 1);
      a.status = "suspenso";
      a.returnDay = back;
      r.status = "suspenso";
      r.returnDay = back;
      a.orientPending = false;
      a.skipping = false;
      sim.queue = sim.queue.filter((id) => id !== a.id);
      d.occurrences.filter((o) => o.status === "aberta" && o.agents.includes(a.id)).forEach((o) => closeOcc(sim, o, "resolvida", "Encerrada por suspensão do envolvido."));
      releaseSeat(sim, a);
      record(sim, a, "suspensao", `Suspenso(a) por ${back - w.day} dia(s) letivo(s); retorno no dia ${back}.${opts.reason ? ` Motivo: ${opts.reason}` : ""}`);
      if (atSchool) goLeave(sim, a);
      return { ok: true, message: `${a.name} suspenso(a). Retorna no dia ${back}.` };
    }
    case "expulsar": {
      a.status = "expulso";
      r.status = "expulso";
      r.exitReason = opts.reason || "Não informado";
      a.orientPending = false;
      a.skipping = false;
      sim.queue = sim.queue.filter((id) => id !== a.id);
      d.occurrences.filter((o) => o.status === "aberta" && o.agents.includes(a.id)).forEach((o) => closeOcc(sim, o, "resolvida", "Encerrada: matrícula do envolvido foi encerrada."));
      releaseSeat(sim, a);
      record(sim, a, "expulsao", `Matrícula encerrada. Motivo: ${r.exitReason}.`);
      d.expelled.push(a.id);
      d.archive.unshift({ ...r });
      w.enrolled = Math.max(0, w.enrolled - 1);
      if (atSchool) {
        goLeave(sim, a);
        a.activity = "Deixando a escola (matrícula encerrada)";
      } else {
        w.agents = w.agents.filter((x) => x.id !== a.id);
      }
      d.log.actions -= 0; // registro sem dinheiro, XP ou progresso de missão
      return { ok: true, message: `Matrícula de ${a.name} encerrada. A ficha fica no histórico da secretaria.` };
    }
  }
  return { ok: false, message: "Ação desconhecida." };
}

/** Retorna true quando o gabinete controla o aluno neste momento (o sim não deve escolher outro destino). */
export function directorHoldsStudent(sim: Sim, a: Agent): boolean {
  if (a.status === "expulso" || a.status === "suspenso") {
    if (a.active && a.intent !== "leave") goLeave(sim, a);
    return true;
  }
  if (a.conflictId) {
    a.waitTimer = Math.max(a.waitTimer, 2);
    return true;
  }
  if (a.skipping && phaseFor(sim.world.minutes) === "class") {
    if (a.path.length === 0 && a.intent !== "idle") goChill(sim, a);
    a.activity = "Fora da sala durante a aula";
    a.waitTimer = Math.max(a.waitTimer, 4);
    return true;
  }
  if (a.skipping && phaseFor(sim.world.minutes) !== "class") a.skipping = false;
  return false;
}
/** Alunos fora da escola por suspensão/expulsão não embarcam nem entram. */
export function studentAway(world: GameWorld, a: Agent): boolean {
  if (a.status === "expulso") return true;
  if (a.status === "suspenso" && (a.returnDay ?? 0) > world.day) return true;
  return false;
}

export function onAgentArrive(sim: Sim, a: Agent) {
  if (a.role !== "student") return;
  if (a.intent === "leave" && a.status === "expulso") {
    sim.world.agents = sim.world.agents.filter((x) => x.id !== a.id);
    return;
  }
  if (a.orientPending) {
    const seat = a.seatKey ? sim.seats.find((s) => s.key === a.seatKey) : null;
    a.orientPending = false;
    if (seat?.kind === "classroom") {
      const d = dir(sim.world);
      d.points.disciplina += 1;
      d.log.orientSuccess += 1;
      d.log.positive += 1;
      record(sim, a, "orientacao", "Chegou à carteira após orientação. +1 Disciplina.");
      notify(sim, "good", "De volta à aula", `${a.name} chegou à carteira. +1 ponto de Disciplina.`, `orient-${a.id}-${sim.world.minutes}`, 1);
    }
  }
  if (a.intent === "class") {
    const r = dir(sim.world).records[a.id];
    if (r && !r.presentToday) {
      r.presentToday = true;
      r.daysPresent += 1;
    }
  }
}

// ------------------------------------------------------------------ interação em 1ª pessoa (toque único, sem segurar)
export interface Interactable { kind: "lixo" | "incidente" | "gabinete"; id: string; label: string; hold: boolean; x: number; z: number; opt?: string }
export function nearestInteractable(sim: Sim): Interactable | null {
  const w = sim.world;
  const d = dir(w);
  const p = w.player;
  const list: Interactable[] = [];
  for (const l of d.litter) list.push({ kind: "lixo", id: l.id, label: "Recolher embalagem", hold: false, x: l.x, z: l.z });
  for (const o of d.occurrences) {
    if (o.status !== "aberta" || o.taskId || o.busyUntil) continue;
    const st = incidentSteps(o)[o.stage];
    if (!st) continue;
    const fpOpt = st.options(sim, o).find((x) => x.fp && (o.awaitFP === x.id || o.stage === 0));
    let x = o.x, z = o.z;
    if (o.type === "confusao") { const a = w.agents.find((ag) => ag.id === o.agents[0]); if (a) { x = a.x; z = a.z; } }
    if (fpOpt) list.push({ kind: "incidente", id: o.id, label: o.type === "confusao" ? "Interromper a discussão" : o.stage === 0 ? `Inspecionar: ${o.title}` : fpOpt.label.replace(" você mesmo(a)", ""), hold: false, x, z, opt: fpOpt.id });
  }
  const rec = w.buildings.find((b) => b.kind === "reception" && b.progress >= 1);
  if (rec) list.push({ kind: "gabinete", id: rec.id, label: "Abrir gabinete do diretor", hold: false, x: rec.x, z: rec.z });
  let best: Interactable | null = null;
  let bd = 1e9;
  for (const it of list) {
    const dist = Math.hypot(it.x - p.x, it.z - p.z);
    const range = it.kind === "gabinete" ? 2.6 : 2;
    if (dist < range && dist < bd) { bd = dist; best = it; }
  }
  return best;
}
export function interact(sim: Sim, it: Interactable): string {
  if (it.kind === "lixo") return collectLitter(sim, it.id, "diretor") ? "Embalagem recolhida. +1 Higiene." : "Já foi recolhida.";
  if (it.kind === "incidente") {
    const o = dir(sim.world).occurrences.find((x) => x.id === it.id);
    if (!o || o.status !== "aberta") return "Já resolvido.";
    const st = incidentSteps(o)[o.stage];
    const opt = st?.options(sim, o).find((x) => x.id === it.opt);
    if (!opt) return "";
    completeStep(sim, o, opt.id, `${opt.label} (pessoalmente)`);
    prog(sim.world).counters.personal += 1;
    dir(sim.world).log.positive += 1;
    return `${st.title}: feito pessoalmente.`;
  }
  return "";
}
export function holdInteract(sim: Sim, it: Interactable): string { return interact(sim, it); }

// ------------------------------------------------------------------ ciclo
export const sfxQueue: ("conquista" | "alerta")[] = [];
let lastMinutes = -1;
export function directorTick(sim: Sim, dtMinutes: number) {
  const w = sim.world;
  const d = dir(w);
  const prev = lastMinutes < 0 || lastMinutes > w.minutes ? w.minutes : lastMinutes;
  lastMinutes = w.minutes;
  if (d.log.day !== w.day) directorDayStart(sim);
  occurrencesTick(sim, dtMinutes);
  tasksTick(sim);
  noiseComfortTick(sim, dtMinutes);
  litterTick(sim, dtMinutes, prev);
  // "aluno fora da sala": oportunidade real para a missão De volta à aula
  const dv = d.missions.find((m) => m.kind === "deVoltaAula" && !m.done && !m.failed);
  if (dv && ((prev < 470 && w.minutes >= 470) || (prev < 600 && w.minutes >= 600)) && !w.agents.some((a) => a.skipping)) {
    const cand = activeStudents(w).filter((a) => a.active && a.seatKey && !a.wheelchair);
    const a = cand[Math.floor(rnd(`${w.day}-${w.minutes}-skip`) * cand.length)];
    if (a) {
      releaseSeat(sim, a);
      a.skipping = true;
      goChill(sim, a);
      notify(sim, "warn", "Aluno fora da sala", `${a.name} saiu da aula e está no pátio. Oriente-o pelo gabinete ou em 1ª pessoa.`, `skip-${w.day}`, 1);
    }
  }
  // efeitos das melhorias por prédio
  for (const b of w.buildings) {
    if (!b.upgrades?.length || b.progress < 1) continue;
    if (b.upgrades.includes("kitHigiene")) b.dirt = clamp(b.dirt - dtMinutes * 0.05);
  }
  for (const a of w.agents) {
    if (a.role !== "student" || !a.active || !a.seatKey) continue;
    const b = w.buildings.find((x) => x.id === a.buildingId);
    if (!b?.upgrades) continue;
    if (b.upgrades.includes("armarios")) {
      a.needs.comfort = clamp(a.needs.comfort + dtMinutes * 0.04);
      a.needs.learning = clamp(a.needs.learning + dtMinutes * 0.02);
    }
    if (b.upgrades.includes("lousaDigital") || b.upgrades.includes("bibliotecaSala")) a.needs.learning = clamp(a.needs.learning + dtMinutes * 0.02);
    if (b.upgrades.includes("palcoMovel") || b.upgrades.includes("placar")) a.needs.fun = clamp(a.needs.fun + dtMinutes * 0.04);
    if (b.upgrades.includes("climatizacao")) a.needs.comfort = clamp(a.needs.comfort + dtMinutes * 0.06);
    if (b.upgrades.includes("bancosCobertos") && w.weather === "rain") a.needs.comfort = clamp(a.needs.comfort + dtMinutes * 0.08);
  }
  if (d.powerOut) for (const a of w.agents) if (a.role === "student" && a.active && a.seatKey) a.needs.learning = clamp(a.needs.learning - dtMinutes * 0.02);
  if (d.teacherFactor < 1) for (const a of w.agents) if (a.role === "student" && a.active && a.intent === "class" && a.seatKey && a.path.length === 0) a.needs.learning = clamp(a.needs.learning - dtMinutes * 0.05 * (1 - d.teacherFactor));
  progressTick(sim, dtMinutes);
  missionTick(sim);
}
/** Prazo da fiscalização em segundos reais de jogo ativo (pausa congela, 4× não acelera). */
export function directorRealtime(dtReal: number) {
  const sim = (globalThis as { __pegSim?: Sim }).__pegSim;
  if (!sim) return;
  for (const o of dir(sim.world).occurrences) if (o.status === "aberta" && o.type === "fiscalizacao") o.activeSeconds += Math.min(0.25, dtReal);
}

export function directorDayStart(sim: Sim) {
  const w = sim.world;
  const d = dir(w);
  // estudantes começam o dia em casa
  for (const a of w.agents) {
    if (a.role !== "student") continue;
    a.conflictId = null;
    a.skipping = false;
    a.orientPending = false;
    if (a.status === "suspenso" && (a.returnDay ?? 0) <= w.day) {
      a.status = "ativo";
      const r = d.records[a.id];
      if (r) {
        r.status = "ativo";
        r.returnDay = undefined;
      }
      record(sim, a, "retorno", "Retornou da suspensão.");
      notify(sim, "info", "Retorno de suspensão", `${a.name} volta às aulas hoje.`, `ret-${a.id}-${w.day}`, 1);
    }
    const r = d.records[a.id];
    if (r && a.status !== "expulso") {
      r.presentToday = false;
      if (a.status !== "suspenso") r.daysExpected += 1;
    }
  }
  d.occurrences = d.occurrences.filter((o) => o.status === "aberta" || abs(w) - o.startedAt < 2880);
  for (const o of d.occurrences) if (o.status === "aberta" && o.type !== "fiscalizacao") closeOcc(sim, o, "ignorada", "Encerrada na virada do dia.");
  d.powerOut = false;
  d.nonEssentialOff = false;
  d.teacherFactor = 1;
  d.bathroomMaxDirt = 0;
  d.tasks = d.tasks.filter((t) => t.status === "a caminho" || t.status === "executando").length ? d.tasks.map((t) => (t.status === "a caminho" || t.status === "executando" ? { ...t, status: "impedida" as const, note: "Virada do dia." } : t)) : d.tasks;
  for (const ag of w.agents) ag.taskId = null;
  for (const f of d.followUps) {
    if (f.untilDay < w.day) continue;
    const people = f.ids.map((id) => w.agents.find((x) => x.id === id)).filter(Boolean) as Agent[];
    const ok = people.every((x) => x.mood >= 45);
    for (const x of people) record(sim, x, ok ? "mediacao" : "conversa", ok ? "Acompanhamento: a convivência melhorou." : `Acompanhamento: ainda há tensão (intervenção: ${f.choice}). Considere outra abordagem.`);
    if (ok) d.points.convivencia += 1;
  }
  d.followUps = d.followUps.filter((f) => f.untilDay > w.day);
  const stars = starBreakdown(w).stars;
  d.log = freshLog(w, stars);
  d.missions = genMissions(w);
  d.focus = d.focus && d.focus.day === w.day ? d.focus : null;
  planDay(w);
  progressDayStart(sim);
}

export function directorDayEnd(sim: Sim, totals: { income: number; expenses: number }): DirectorDaySummary {
  const w = sim.world;
  const d = dir(w);
  evaluateFocus(w);
  const st = w.agents.filter((a) => a.role === "student" && a.status !== "expulso");
  const present = Object.values(d.records).filter((r) => r.presentToday && r.status !== "expulso").length;
  const starsEnd = starBreakdown(w).stars;
  const prev = d.history[d.history.length - 1];
  let observation: string | null = null;
  if (d.log.counter2At !== null && prev && w.daily.queuePeak < prev.queuePeak) observation = `A maior fila caiu de ${prev.queuePeak} para ${w.daily.queuePeak} alunos após a abertura do segundo balcão.`;
  else if (prev && w.daily.queuePeak < prev.queuePeak) observation = `A maior fila da cantina caiu de ${prev.queuePeak} para ${w.daily.queuePeak} alunos em relação a ontem.`;
  else if (d.log.conflictsMediated > 0) observation = `${d.log.conflictsMediated} conflito(s) mediado(s) e os envolvidos voltaram às atividades.`;
  else if (d.log.litterCollected > 0) observation = `${d.log.litterCollected} embalagem(ns) recolhida(s) depois do recreio e do almoço.`;
  else if (prev && present > prev.attendance) observation = `A presença subiu de ${prev.attendance} para ${present} alunos.`;
  d.history.push({ day: w.day, stars: starsEnd, queuePeak: w.daily.queuePeak, meals: w.daily.servedMeals, attendance: present });
  if (d.history.length > 30) d.history.shift();
  return {
    day: w.day,
    startBudget: d.log.startBudget,
    income: Math.round(totals.income),
    expenses: Math.round(totals.expenses),
    finalBudget: Math.round(w.budget),
    attendance: present,
    expected: Math.max(present, st.filter((a) => a.status !== "suspenso").length),
    meals: w.daily.servedMeals,
    queuePeak: w.daily.queuePeak,
    occurrences: { opened: d.log.occOpened, resolved: d.log.occResolved, ignored: d.log.occIgnored },
    actions: d.log.actions,
    missionsDone: d.log.missionsDone,
    starsStart: d.log.startStars,
    starsEnd,
    focus: d.focus && d.focus.day === w.day ? { ...d.focus } : null,
    observation,
    litterCollected: d.log.litterCollected,
  };
}

/** Acessos interrompidos (sinalização de corredores). */
export function blockedAccesses(sim: Sim): string[] {
  const out: string[] = [];
  for (const b of sim.world.buildings) {
    if (b.progress < 1 || !BUILDABLE_BY_KIND[b.kind] || b.kind === "path" || b.kind === "tactile") continue;
    const r = findPath(sim.grid, { x: GATE.x, z: GATE.z + 0.6 }, entryPoint(b));
    if (!r.reachable) out.push(BUILDABLE_BY_KIND[b.kind].name);
  }
  return out;
}

export function upgradeTargets(world: GameWorld, id: string): BuildingInstance[] {
  const up = DIRECTOR_UPGRADES.find((u) => u.id === id);
  return up ? world.buildings.filter((b) => b.progress >= 1 && up.kinds.includes(b.kind)) : [];
}
