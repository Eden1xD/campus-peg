/**
 * Progressão da escola — uma única camada, ligada à simulação existente (sim.ts) e ao gabinete (director.ts).
 * Responsável por: reformas e paisagismo, especializações, projetos de vários dias, investimento do dia,
 * competições com escolas rivais (fictícias), histórias dos alunos, semestres/formatura, álbum,
 * objetivos com recompensas cosméticas e a prévia confirmada de amanhã.
 * Nada aqui controla o movimento dos alunos: só lê o estado e aplica efeitos/registros.
 */
import { BUILDABLE_BY_KIND, PARCELS, phaseFor, type ParcelDef } from "./config";
import { setOwnedParcels } from "./nav";
import { dir, recordFor, starBreakdown } from "./director";
import { entryPoint, hashString, isWalled } from "./layout";
import { addLedger, notify, rebuildWorldModel, startEvent, validatePlacement, type Sim } from "./sim";
import type { BuildingInstance, BuildingKind, GameWorld } from "./types";

export const SEMESTER_DAYS = 8;
export const YEAR_DAYS = SEMESTER_DAYS * 2;

export type SpecId = "esportes" | "tecnologia" | "artes" | "academico";
export type CompType = "esportiva" | "cientifica" | "cultural";
export type CosmeticSlot = "pintura" | "banco" | "jardim" | "placa" | "acessorio";

export interface ProjectInstance { id: string; defId: string; buildingId: string; step: number; readyDay: number; status: "andamento" | "aguardando" | "concluido"; startedDay: number; spent: number; prepaid?: boolean; gremio?: boolean }
export interface Competition { id: string; type: CompType; rivalId: string; day: number; prep: number; status: "agendada" | "concluida"; ourScore?: number; rivalScore?: number; won?: boolean; explanation?: string[] }
export interface StoryArc { id: string; studentId: string; type: "adaptacao" | "notas" | "representante"; stage: number; startDay: number; status: "ativa" | "concluida" | "encerrada"; lastActionDay: number; support: number; outcome?: string }
export interface AlbumEntry { day: number; title: string; text: string }
export interface ProgressState {
  v: 1;
  landscape: number;
  specs: Record<SpecId, number>;
  projects: ProjectInstance[];
  investDay: number;
  investId: string | null;
  competitions: Competition[];
  arcs: StoryArc[];
  profiles: Record<string, { strength: string; difficulty: string }>;
  album: AlbumEntry[];
  cosmetics: string[];
  equipped: Partial<Record<CosmeticSlot, string>>;
  claimed: string[];
  objectiveBase: Record<string, number>;
  counters: { personal: number; reforms: number; projects: number; goodBreak: number; compPrepared: number; fourStars: number };
  pendingEnroll: number;
  pendingGraduates: string[];
  lastStartDay: number;
  semesterReports: { semester: number; day: number; lines: string[] }[];
  history: { day: number; income: number; expenses: number; learning: number; hygiene: number; stars: number; attendance: number; meals: number }[];
  todayEvents: string[];
  parcels: string[];
  difficulty: Difficulty;
  plans: PlanItem[];
  templates: TemplateDef[];
  gremio: GremioState;
  voice: VoiceRequest[];
  tutorial: TutorialState;
  whatsNewSeen: number;
  moments: Moment[];
  custom: Customization;
  lastStarFloor: number;
  enrollLimit: string | null;
}

type PW = GameWorld & { progress?: ProgressState };
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

/** Migração explícita: saves antigos recebem o estado na primeira leitura, sem mexer nas construções. */
export function prog(world: GameWorld): ProgressState {
  const w = world as PW;
  if (!w.progress) {
    w.progress = {
      v: 1, landscape: 0, specs: { esportes: 0, tecnologia: 0, artes: 0, academico: 0 }, projects: [], investDay: 0, investId: null,
      competitions: [], arcs: [], profiles: {}, album: [{ day: world.day, title: "Primeiro dia na direção", text: `${world.schoolName} abriu as portas com ${world.enrolled} estudantes.` }],
      cosmetics: [], equipped: {}, claimed: [], objectiveBase: {}, counters: { personal: 0, reforms: 0, projects: 0, goodBreak: 0, compPrepared: 0, fourStars: 0 },
      pendingEnroll: 0, pendingGraduates: [], lastStartDay: 0, semesterReports: [], history: [], todayEvents: [],
    } as unknown as ProgressState;
  }
  ensure(w.progress!, world);
  return w.progress!;
}
function ensure(p: ProgressState, world: GameWorld) {
  // Libera todas as parcelas existentes para esta versão do jogo.
p.parcels = ["centro"];
  p.difficulty ??= "gestao";
  p.plans ??= [];
  p.templates ??= [];
  p.gremio ??= { status: "nenhum", candidates: [], achievements: [], electionDay: 0 };
  p.voice ??= [];
  p.tutorial ??= { active: false, done: [], skipped: false, flags: {}, baseline: { classrooms: world.buildings.filter((b) => b.kind === "classroom").length, teachers: world.staff.filter((m) => m.role === "teacher").length } };
  p.whatsNewSeen ??= 0;
  p.moments ??= [];
  p.custom ??= { facade: "classica", uniform: { style: "camiseta", shirt: "#6d4aa8", pants: "#2f3542" }, crest: 0 };
  p.lastStarFloor ??= 0;
  p.enrollLimit ??= null;
}
function album(world: GameWorld, title: string, text: string) {
  const p = prog(world);
  if (p.album.some((a) => a.title === title && a.day === world.day)) return;
  p.album.push({ day: world.day, title, text });
  if (p.album.length > 80) p.album.shift();
  p.todayEvents.push(title);
  if (/Vitória|concluído|Formatura|Conquista|Representante|lote|Grêmio|inaugura/i.test(title)) moment(world, title, text);
}
export function moment(world: GameWorld, title: string, text: string, x?: number, z?: number) {
  const p = prog(world);
  if (p.moments.some((m) => m.title === title && m.day === world.day)) return;
  p.moments.push({ id: `mo-${world.day}-${p.moments.length}-${Math.round(world.minutes)}`, day: world.day, title, text, x, z, seen: false });
  if (p.moments.length > 20) p.moments.shift();
}

// ------------------------------------------------------------------ identidade e reformas
export function roomLabelFor(b: BuildingInstance, all: BuildingInstance[]): string {
  const same = all.filter((x) => x.kind === b.kind);
  const n = same.findIndex((x) => x.id === b.id) + 1;
  if (b.kind === "classroom") return `Sala ${String(n).padStart(2, "0")}`;
  if (b.kind === "bathroom") return n > 1 ? `Banheiros ${n}` : "Banheiros";
  if (b.kind === "reception") return "Secretaria · Direção";
  const name = BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind;
  return same.length > 1 ? `${name} ${n}` : name;
}
export function buildingTier(b: Pick<BuildingInstance, "upgrades">): number {
  return b.upgrades?.includes("tier2") ? 2 : b.upgrades?.includes("tier1") ? 1 : 0;
}
export const REFORMS = [
  { tier: 1, name: "Reforma de fachada", cost: 2400, upkeep: 25, benefit: "Marquise, faixa roxa e pintura nova. +conforto para quem usa o prédio." },
  { tier: 2, name: "Requalificação completa", cost: 5200, upkeep: 55, benefit: "Revestimento, jardineiras e iluminação de fachada. +conforto e +aprendizagem." },
];
export const LANDSCAPE = [
  { level: 1, name: "Canteiros e gramado aparado", cost: 1500, upkeep: 15, benefit: "Canteiros floridos nos caminhos. +conforto no pátio." },
  { level: 2, name: "Arborização dos corredores", cost: 3200, upkeep: 30, benefit: "Árvores de sombra ao longo do eixo central. +conforto em dias de sol." },
  { level: 3, name: "Jardim de convivência", cost: 5400, upkeep: 50, benefit: "Pergolado e bancos extras na área central. +socialização." },
];
export function buyReform(sim: Sim, buildingId: string) {
  const b = sim.world.buildings.find((x) => x.id === buildingId);
  if (!b || b.progress < 1 || !isWalled(b) || b.kind === "path" || b.kind === "tactile") return { ok: false, message: "Escolha um prédio fechado e pronto." };
  const t = buildingTier(b);
  const r = REFORMS.find((x) => x.tier === t + 1);
  if (!r) return { ok: false, message: "Este prédio já está no nível máximo." };
  if (sim.world.budget < r.cost) return { ok: false, message: `Saldo insuficiente: faltam R$ ${Math.ceil(r.cost - sim.world.budget)}.` };
  addLedger(sim, -r.cost, r.name, roomLabelFor(b, sim.world.buildings), "melhoria");
  b.upgrades = [...(b.upgrades ?? []).filter((u) => u !== "tier1"), `tier${r.tier}`];
  b.progress = 0.86; // acabamento + mobiliário: a sala fica fechada até a reinauguração (alunos vão para outro lugar)
  b.completeAt = 0;
  const p = prog(sim.world);
  p.counters.reforms += 1;
  album(sim.world, `${r.name}: ${roomLabelFor(b, sim.world.buildings)}`, "A reforma já aparece na fachada.");
  rebuildWorldModel(sim);
  return { ok: true, message: `${r.name} iniciada em ${roomLabelFor(b, sim.world.buildings)}. O ambiente reabre quando a obra terminar.` };
}
export function buyLandscape(sim: Sim) {
  const p = prog(sim.world);
  const next = LANDSCAPE.find((l) => l.level === p.landscape + 1);
  if (!next) return { ok: false, message: "Paisagismo no nível máximo." };
  if (sim.world.budget < next.cost) return { ok: false, message: `Saldo insuficiente: faltam R$ ${Math.ceil(next.cost - sim.world.budget)}.` };
  addLedger(sim, -next.cost, next.name, "Paisagismo do campus", "melhoria");
  p.landscape = next.level;
  album(sim.world, next.name, "O campus ganhou mais verde.");
  return { ok: true, message: `${next.name} concluído.` };
}
export function dailyUpkeep(world: GameWorld) {
  const p = prog(world);
  let total = 0;
  for (const b of world.buildings) {
    const t = buildingTier(b);
    for (const r of REFORMS) if (r.tier <= t) total += r.upkeep;
  }
  for (const l of LANDSCAPE) if (l.level <= p.landscape) total += l.upkeep;
  return Math.round(total * difficulty(world).upkeep);
}

// ------------------------------------------------------------------ especializações
export const SPECS: Record<SpecId, { name: string; color: string; unlocks: string[] }> = {
  esportes: { name: "Esportes", color: "#3c9a5f", unlocks: ["Projeto Equipe da escola", "Competição esportiva", "Placar eletrônico da quadra", "Bandeira verde na entrada"] },
  tecnologia: { name: "Tecnologia", color: "#3f7fbf", unlocks: ["Projeto Clube de robótica", "Competição científica", "Lousa digital", "Bandeira azul na entrada"] },
  artes: { name: "Artes", color: "#e08a3c", unlocks: ["Projeto Mostra cultural", "Competição cultural", "Palco móvel no pátio", "Bandeira laranja na entrada"] },
  academico: { name: "Ensino acadêmico", color: "#6d4aa8", unlocks: ["Projeto Reforço acadêmico", "Competição científica (olimpíada)", "Biblioteca de sala", "Bandeira roxa na entrada"] },
};
export const SPEC_LEVELS = [0, 100, 250, 450];
export function specLevel(world: GameWorld, s: SpecId) {
  const xp = prog(world).specs[s];
  let l = 0;
  for (let i = 1; i < SPEC_LEVELS.length; i++) if (xp >= SPEC_LEVELS[i]) l = i;
  return l;
}
export function addSpecXp(sim: Sim, s: SpecId, xp: number, why: string) {
  const before = specLevel(sim.world, s);
  prog(sim.world).specs[s] += xp;
  const after = specLevel(sim.world, s);
  if (after > before) {
    notify(sim, "good", `${SPECS[s].name} nível ${after}`, `${why}. Desbloqueado: ${SPECS[s].unlocks.slice(0, after + 1).join(", ")}.`, `spec-${s}-${after}`, 1);
    album(sim.world, `Especialização em ${SPECS[s].name} — nível ${after}`, why);
  }
}

// ------------------------------------------------------------------ projetos de vários dias
export interface ProjectDef { id: string; name: string; spec: SpecId; kinds: BuildingKind[]; token: string; minSpec: number; steps: { name: string; cost: number; days: number; benefit: string }[] }
export const PROJECTS: ProjectDef[] = [
  { id: "biblioteca", name: "Inaugurar a biblioteca", spec: "academico", kinds: ["library"], token: "lib", minSpec: 0, steps: [
    { name: "Preparar o espaço", cost: 600, days: 1, benefit: "Área isolada e limpa para a montagem." },
    { name: "Instalar estantes e mesas", cost: 1400, days: 1, benefit: "+estantes visíveis; leitura rende mais." },
    { name: "Comprar o acervo", cost: 1800, days: 2, benefit: "Carrinhos de livros novos; +aprendizagem na biblioteca." },
    { name: "Organizar a equipe", cost: 900, days: 1, benefit: "Balcão de atendimento com bibliotecária." },
    { name: "Realizar a inauguração", cost: 700, days: 1, benefit: "Fita, faixa e placa comemorativa; +reputação." },
  ] },
  { id: "robotica", name: "Clube de robótica", spec: "tecnologia", kinds: ["computer", "makerspace", "lab"], token: "tec", minSpec: 0, steps: [
    { name: "Montar bancadas", cost: 900, days: 1, benefit: "Bancada com kits." },
    { name: "Comprar kits de robótica", cost: 2200, days: 2, benefit: "Robôs e caixas de peças; +aprendizagem." },
    { name: "Formar a equipe", cost: 800, days: 1, benefit: "Faixa do clube e +XP de Tecnologia." },
    { name: "Mostra de robôs", cost: 600, days: 1, benefit: "Expositor de troféus; +reputação." },
  ] },
  { id: "equipe", name: "Equipe esportiva da escola", spec: "esportes", kinds: ["court"], token: "esp", minSpec: 0, steps: [
    { name: "Comprar material esportivo", cost: 900, days: 1, benefit: "Cones e bolas na quadra." },
    { name: "Seletiva de atletas", cost: 500, days: 1, benefit: "+diversão para quem joga." },
    { name: "Uniformes e bandeira", cost: 1300, days: 2, benefit: "Bandeira da equipe na quadra." },
    { name: "Jogo de apresentação", cost: 600, days: 1, benefit: "Troféu exposto; +reputação." },
  ] },
  { id: "mostra", name: "Mostra cultural", spec: "artes", kinds: ["arts", "design", "auditorium", "patio"], token: "art", minSpec: 0, steps: [
    { name: "Convocar artistas", cost: 400, days: 1, benefit: "Painéis em branco montados." },
    { name: "Produzir obras", cost: 1300, days: 2, benefit: "Painéis coloridos; +diversão." },
    { name: "Montar a exposição", cost: 900, days: 1, benefit: "Faixa da mostra." },
    { name: "Noite de abertura", cost: 600, days: 1, benefit: "Balões e público; +reputação." },
  ] },
  { id: "reforco", name: "Reforço acadêmico", spec: "academico", kinds: ["classroom", "study"], token: "aca", minSpec: 1, steps: [
    { name: "Diagnóstico das turmas", cost: 500, days: 1, benefit: "Quadro de metas na sala." },
    { name: "Material de apoio", cost: 1100, days: 1, benefit: "Pilhas de apostilas; +aprendizagem." },
    { name: "Plantão de dúvidas", cost: 900, days: 2, benefit: "+aprendizagem e +XP acadêmico." },
    { name: "Simulado e premiação", cost: 600, days: 1, benefit: "Placa de honra; +reputação." },
  ] },
  { id: "gremio-quadra", name: "Grêmio: quadra renovada", spec: "esportes", kinds: ["court"], token: "grq", minSpec: 0, steps: [
    { name: "Comprar material", cost: 700, days: 1, benefit: "Cones e redes novas." },
    { name: "Pintura das linhas", cost: 900, days: 1, benefit: "Bandeira do Grêmio na quadra." },
    { name: "Placar e torcida", cost: 1200, days: 1, benefit: "Placar eletrônico; +diversão." },
  ] },
  { id: "gremio-jornal", name: "Grêmio: jornal escolar", spec: "artes", kinds: ["patio", "reception", "media", "library"], token: "grj", minSpec: 0, steps: [
    { name: "Montar a redação", cost: 500, days: 1, benefit: "Mesa da redação." },
    { name: "Primeira edição", cost: 600, days: 1, benefit: "Banca de jornal no pátio; +socialização." },
  ] },
  { id: "gremio-feira", name: "Grêmio: feira cultural", spec: "artes", kinds: ["patio", "arts", "auditorium"], token: "grf", minSpec: 0, steps: [
    { name: "Inscrições das turmas", cost: 300, days: 1, benefit: "Painéis de inscrição." },
    { name: "Montagem das barracas", cost: 1100, days: 1, benefit: "Barracas no pátio." },
    { name: "Dia da feira", cost: 500, days: 1, benefit: "Evento no pátio e +reputação." },
  ] },
  { id: "gremio-coleta", name: "Grêmio: coleta seletiva", spec: "academico", kinds: ["patio", "canteen"], token: "grc", minSpec: 0, steps: [
    { name: "Campanha nas salas", cost: 200, days: 1, benefit: "Cartazes da campanha." },
    { name: "Lixeiras de 4 cores", cost: 700, days: 1, benefit: "Lixeiras no pátio; menos lixo no chão." },
  ] },
  { id: "gremio-convivencia", name: "Grêmio: área de convivência", spec: "artes", kinds: ["patio", "garden"], token: "grv", minSpec: 0, steps: [
    { name: "Projeto com os alunos", cost: 300, days: 1, benefit: "Maquete exposta." },
    { name: "Bancos e cobertura", cost: 1600, days: 2, benefit: "Bancos cobertos: assentos e abrigo na chuva." },
  ] },
];
export const STANDARD_PROJECTS = () => PROJECTS.filter((d) => !d.id.startsWith("gremio-"));
export function projectTargets(world: GameWorld, def: ProjectDef) {
  return world.buildings.filter((b) => b.progress >= 1 && def.kinds.includes(b.kind) && !prog(world).projects.some((p) => p.buildingId === b.id && p.defId === def.id));
}
export function startProject(sim: Sim, defId: string, buildingId: string) {
  const def = PROJECTS.find((d) => d.id === defId);
  const b = sim.world.buildings.find((x) => x.id === buildingId);
  if (!def || !b) return { ok: false, message: "Projeto ou prédio inválido." };
  if (!def.kinds.includes(b.kind) || b.progress < 1) return { ok: false, message: `Requer ${def.kinds.map((k) => BUILDABLE_BY_KIND[k]?.name).join(" ou ")} pronto.` };
  if (specLevel(sim.world, def.spec) < def.minSpec) return { ok: false, message: `Requer ${SPECS[def.spec].name} nível ${def.minSpec}.` };
  const p = prog(sim.world);
  if (p.projects.some((x) => x.buildingId === b.id && x.defId === def.id)) return { ok: false, message: "Este projeto já existe neste prédio." };
  const step = def.steps[0];
  if (sim.world.budget < step.cost) return { ok: false, message: `Saldo insuficiente para a etapa 1 (R$ ${step.cost}).` };
  addLedger(sim, -step.cost, `${def.name}: ${step.name}`, roomLabelFor(b, sim.world.buildings), "melhoria");
  p.projects.push({ id: `pj-${def.id}-${b.id}`, defId: def.id, buildingId: b.id, step: 0, readyDay: sim.world.day + step.days, status: "andamento", startedDay: sim.world.day, spent: step.cost });
  return { ok: true, message: `${def.name} iniciado. Etapa 1 fica pronta no dia ${sim.world.day + step.days}.` };
}
export function advanceProject(sim: Sim, id: string) {
  const p = prog(sim.world);
  const pj = p.projects.find((x) => x.id === id);
  const def = pj ? PROJECTS.find((d) => d.id === pj.defId) : null;
  if (!pj || !def || pj.status !== "aguardando") return { ok: false, message: "A etapa atual ainda está em andamento." };
  const step = def.steps[pj.step];
  if (sim.world.budget < step.cost) return { ok: false, message: `Saldo insuficiente (R$ ${step.cost}).` };
  addLedger(sim, -step.cost, `${def.name}: ${step.name}`, "Etapa do projeto", "melhoria");
  pj.spent += step.cost;
  pj.status = "andamento";
  pj.readyDay = sim.world.day + step.days;
  return { ok: true, message: `${step.name} em andamento; pronta no dia ${pj.readyDay}.` };
}
function completeSteps(sim: Sim) {
  const p = prog(sim.world);
  for (const pj of p.projects) {
    if (pj.status !== "andamento" || sim.world.day < pj.readyDay) continue;
    const def = PROJECTS.find((d) => d.id === pj.defId);
    const b = sim.world.buildings.find((x) => x.id === pj.buildingId);
    if (!def) continue;
    if (!b) { pj.status = "concluido"; continue; } // prédio demolido: projeto encerrado sem novo pagamento
    const step = def.steps[pj.step];
    b.upgrades = [...(b.upgrades ?? []), `${def.token}${pj.step + 1}`];
    addSpecXp(sim, def.spec, 40, `${def.name}: ${step.name}`);
    notify(sim, "good", `${def.name}`, `Etapa concluída: ${step.name}. ${step.benefit}`, `pj-${pj.id}-${pj.step}`, 1);
    pj.step += 1;
    if (pj.step >= def.steps.length) {
      pj.status = "concluido";
      p.counters.projects += 1;
      sim.world.reputation = clamp(sim.world.reputation + 4);
      album(sim.world, `${def.name} — concluído`, `${roomLabelFor(b, sim.world.buildings)} recebeu ${def.steps.length} etapas e investimento de R$ ${pj.spent}.`);
    } else if (pj.prepaid) {
      pj.status = "andamento";
      pj.readyDay = sim.world.day + def.steps[pj.step].days;
    } else pj.status = "aguardando";
    if (pj.status === "concluido" && pj.gremio) gremioDone(sim, def);
    rebuildWorldModel(sim);
  }
}
/** benefício progressivo: cada etapa concluída melhora quem usa o prédio */
function projectBonus(b: BuildingInstance) {
  return (b.upgrades ?? []).filter((u) => /^(lib|tec|esp|art|aca)\d$/.test(u)).length;
}

// ------------------------------------------------------------------ investimento do dia
export const INVESTMENTS = [
  { id: "merenda", name: "Melhorar a merenda", cost: 450, effect: "Hoje cada refeição sacia mais e a nota de Alimentação sobe." },
  { id: "professores", name: "Capacitar professores", cost: 1300, effect: "+4 de habilidade permanente para todos os professores. +XP Ensino acadêmico." },
  { id: "salas", name: "Ampliar salas", cost: 1600, effect: "+3 carteiras na sala mais cheia (aparecem no mapa)." },
  { id: "manutencao", name: "Investir em manutenção", cost: 900, effect: "Conservação +15 e sujeira −25 em todos os prédios." },
  { id: "eventos", name: "Preparar eventos", cost: 900, effect: "+30 de preparo na próxima competição agendada. +XP Artes e Esportes." },
];
export function invest(sim: Sim, id: string) {
  const p = prog(sim.world);
  if (p.investDay === sim.world.day) return { ok: false, message: "O investimento de hoje já foi escolhido. Necessidades concorrentes: escolha uma por dia." };
  const inv = INVESTMENTS.find((x) => x.id === id);
  if (!inv) return { ok: false, message: "Opção inválida." };
  if (sim.world.budget < inv.cost) return { ok: false, message: `Saldo insuficiente (R$ ${inv.cost}).` };
  if (id === "salas") {
    const rooms = sim.world.buildings.filter((b) => b.kind === "classroom" && b.progress >= 1 && !b.upgrades?.includes("carteirasExtra"));
    if (!rooms.length) return { ok: false, message: "Todas as salas já foram ampliadas." };
    const target = rooms.sort((a, b2) => sim.seats.filter((s) => s.buildingId === b2.id && sim.claims.has(s.key)).length - sim.seats.filter((s) => s.buildingId === a.id && sim.claims.has(s.key)).length)[0];
    target.upgrades = [...(target.upgrades ?? []), "carteirasExtra"];
    rebuildWorldModel(sim);
  }
  if (id === "eventos") {
    const c = p.competitions.find((x) => x.status === "agendada");
    if (!c) return { ok: false, message: "Agende uma competição antes de preparar eventos." };
    c.prep = Math.min(100, c.prep + 30);
    addSpecXp(sim, "artes", 15, "Preparação de eventos");
    addSpecXp(sim, "esportes", 15, "Preparação de eventos");
  }
  if (id === "professores") {
    for (const m of sim.world.staff) if (m.role === "teacher") m.skill = Math.min(100, m.skill + 4);
    addSpecXp(sim, "academico", 40, "Formação de professores");
  }
  if (id === "manutencao") for (const b of sim.world.buildings) { b.condition = clamp(b.condition + 15); b.dirt = clamp(b.dirt - 25); }
  addLedger(sim, -inv.cost, inv.name, "Investimento do dia", "melhoria");
  p.investDay = sim.world.day;
  p.investId = id;
  return { ok: true, message: `${inv.name}: aplicado.` };
}

// ------------------------------------------------------------------ escolas rivais e competições
export const RIVALS = [
  { id: "horizonte", name: "Colégio Horizonte", strengths: { esportiva: 0.45, cientifica: 0.85, cultural: 0.5 }, note: "forte em ciências" },
  { id: "valeverde", name: "E.E. Vale Verde", strengths: { esportiva: 0.85, cientifica: 0.4, cultural: 0.45 }, note: "forte em esportes" },
  { id: "aurora", name: "Escola Aurora", strengths: { esportiva: 0.4, cientifica: 0.5, cultural: 0.85 }, note: "forte em cultura" },
];
const COMP_INFO: Record<CompType, { name: string; specs: SpecId[]; venues: BuildingKind[]; eventKind: string }> = {
  esportiva: { name: "Torneio esportivo", specs: ["esportes"], venues: ["court"], eventKind: "interclasses" },
  cientifica: { name: "Feira de ciências intercolegial", specs: ["tecnologia", "academico"], venues: ["lab", "computer", "makerspace", "library"], eventKind: "science-fair" },
  cultural: { name: "Festival cultural", specs: ["artes"], venues: ["arts", "auditorium", "patio", "design"], eventKind: "june-party" },
};
export function compInfo(t: CompType) { return COMP_INFO[t]; }
export function scheduleCompetition(sim: Sim, type: CompType, rivalId: string) {
  const p = prog(sim.world);
  const info = COMP_INFO[type];
  if (p.competitions.some((c) => c.status === "agendada")) return { ok: false, message: "Já existe uma competição agendada." };
  if (!sim.world.buildings.some((b) => b.progress >= 1 && info.venues.includes(b.kind))) return { ok: false, message: `Requer ${info.venues.map((k) => BUILDABLE_BY_KIND[k]?.name).join(" ou ")}.` };
  const day = sim.world.day + 2;
  p.competitions.push({ id: `cp-${type}-${day}`, type, rivalId, day, prep: 0, status: "agendada" });
  return { ok: true, message: `${info.name} contra ${RIVALS.find((r) => r.id === rivalId)?.name} no dia ${day}, às 13h.` };
}
export function prepareCompetition(sim: Sim, id: string) {
  const c = prog(sim.world).competitions.find((x) => x.id === id);
  if (!c || c.status !== "agendada") return { ok: false, message: "Competição indisponível." };
  if (c.prep >= 100) return { ok: false, message: "Preparação já está completa." };
  if (sim.world.budget < 500) return { ok: false, message: "Saldo insuficiente (R$ 500)." };
  addLedger(sim, -500, "Preparação de competição", COMP_INFO[c.type].name, "evento");
  c.prep = Math.min(100, c.prep + 20);
  return { ok: true, message: `Preparação em ${c.prep}%.` };
}
function competitionTick(sim: Sim) {
  const w = sim.world;
  const p = prog(w);
  const now = w.day * 1440 + w.minutes;
  for (const c of p.competitions) {
    if (c.status !== "agendada" || c.day !== w.day) continue;
    const info = COMP_INFO[c.type];
    if (w.minutes >= 780 && !w.events.some((e) => e.id === c.id)) {
      w.events.push({ id: c.id, kind: info.eventKind, name: `${info.name} × ${RIVALS.find((r) => r.id === c.rivalId)?.name}`, startsAt: now, endsAt: now + 120, cost: 0, status: "preparing", attendance: 0, result: null });
    }
    if (w.minutes >= 900) resolveCompetition(sim, c);
  }
}
function resolveCompetition(sim: Sim, c: Competition) {
  if (c.status !== "agendada") return; // resultado registrado uma única vez
  const w = sim.world;
  const info = COMP_INFO[c.type];
  const rival = RIVALS.find((r) => r.id === c.rivalId)!;
  const lvl = Math.max(...info.specs.map((s) => specLevel(w, s)));
  const st = w.agents.filter((a) => a.role === "student" && a.status !== "expulso");
  const cond = st.length ? st.reduce((s, a) => s + (a.mood + a.needs.energy + a.needs.learning) / 3, 0) / st.length : 40;
  const venue = w.buildings.some((b) => b.progress >= 1 && info.venues.includes(b.kind) && (buildingTier(b) > 0 || projectBonus(b) > 0)) ? 8 : 0;
  const ours = Math.round(25 + lvl * 12 + c.prep * 0.3 + cond * 0.25 + venue);
  const noise = (hashString(c.id) - 0.5) * 14;
  const theirs = Math.round(38 + rival.strengths[c.type] * 38 + noise);
  c.ourScore = ours;
  c.rivalScore = theirs;
  c.won = ours >= theirs;
  c.status = "concluida";
  c.explanation = [
    `Especialização (${info.specs.map((s) => SPECS[s].name).join("/")}) nível ${lvl}: +${lvl * 12}`,
    `Preparação ${c.prep}%: +${Math.round(c.prep * 0.3)}`,
    `Condição dos alunos (ânimo, energia, aprendizagem) ${Math.round(cond)}: +${Math.round(cond * 0.25)}`,
    venue ? "Espaço reformado ou com projeto: +8" : "Espaço sem reforma ou projeto: +0",
    `${rival.name} é ${rival.note}: ${theirs} pontos`,
  ];
  const p = prog(w);
  if (c.prep >= 60) p.counters.compPrepared += 1;
  for (const s of info.specs) addSpecXp(sim, s, c.won ? 80 : 40, info.name);
  if (c.won) {
    addLedger(sim, 1500, "Prêmio de competição", `${info.name}: vitória sobre ${rival.name}`, "evento");
    w.reputation = clamp(w.reputation + 3);
    album(w, `Vitória: ${info.name}`, `${w.schoolName} ${ours} × ${theirs} ${rival.name}.`);
  } else {
    w.reputation = clamp(w.reputation + 0.5);
    album(w, `Participação: ${info.name}`, `${rival.name} venceu por ${theirs} × ${ours}.`);
  }
  notify(sim, c.won ? "good" : "info", c.won ? "Vitória na competição!" : "Competição encerrada", `${ours} × ${theirs}. ${c.explanation.slice(0, 2).join(" · ")}`, `comp-${c.id}`, 1);
}

// ------------------------------------------------------------------ histórias dos alunos
const STRENGTHS = ["Matemática", "Leitura", "Esportes", "Desenho", "Liderança", "Ciências", "Música", "Escrita"];
const DIFFICULTIES = ["Timidez", "Matemática", "Concentração", "Faltas", "Organização", "Leitura em voz alta"];
export function profileOf(world: GameWorld, id: string) {
  const p = prog(world);
  if (!p.profiles[id]) p.profiles[id] = { strength: STRENGTHS[Math.floor(hashString(id + "s") * STRENGTHS.length)], difficulty: DIFFICULTIES[Math.floor(hashString(id + "d") * DIFFICULTIES.length)] };
  return p.profiles[id];
}
const ARC_INFO = {
  adaptacao: { name: "Adaptação de aluno novo", stages: ["Chegou à escola", "Conhecendo a turma", "Fazendo amigos", "Adaptado(a)"] },
  notas: { name: "Recuperação de notas", stages: ["Notas abaixo da média", "Plano de estudos", "Melhorando", "Notas recuperadas"] },
  representante: { name: "Candidatura a representante", stages: ["Candidatura", "Campanha", "Eleição", "Resultado"] },
};
export function arcInfo(t: StoryArc["type"]) { return ARC_INFO[t]; }
function startArcs(sim: Sim) {
  const w = sim.world;
  const p = prog(w);
  const d = dir(w);
  const active = p.arcs.filter((a) => a.status === "ativa");
  const busy = new Set(active.map((a) => a.studentId));
  const st = w.agents.filter((a) => a.role === "student" && (a.status ?? "ativo") === "ativo" && !busy.has(a.id));
  const add = (studentId: string, type: StoryArc["type"]) => {
    if (p.arcs.filter((a) => a.status === "ativa").length >= 3) return;
    p.arcs.push({ id: `arc-${type}-${studentId}-${w.day}`, studentId, type, stage: 0, startDay: w.day, status: "ativa", lastActionDay: 0, support: 0 });
    const a = w.agents.find((x) => x.id === studentId);
    if (a) recordFor(sim, a, "conversa", `Nova história: ${ARC_INFO[type].name}.`);
  };
  for (const a of st) if (d.records[a.id]?.enrolledDay === w.day && w.day > 1) add(a.id, "adaptacao");
  const low = st.filter((a) => a.needs.learning < 40).sort((x, y) => x.needs.learning - y.needs.learning)[0];
  if (low && !p.arcs.some((x) => x.studentId === low.id && x.type === "notas" && w.day - x.startDay < 6)) add(low.id, "notas");
  const sem = Math.floor((w.day - 1) / SEMESTER_DAYS);
  if (!p.arcs.some((x) => x.type === "representante" && Math.floor((x.startDay - 1) / SEMESTER_DAYS) === sem) && w.day % SEMESTER_DAYS === 2) {
    const cand = st.filter((a) => a.interest === "social" || profileOf(w, a.id).strength === "Liderança")[0] ?? st[0];
    if (cand) add(cand.id, "representante");
  }
}
/** Ações do diretor influenciam as histórias (chamado pelo gabinete). */
export function storyOnAction(sim: Sim, studentId: string, action: string) {
  const w = sim.world;
  const arc = prog(w).arcs.find((a) => a.studentId === studentId && a.status === "ativa");
  if (!arc || arc.lastActionDay === w.day) return;
  const helps = (arc.type === "adaptacao" && (action === "conversar" || action === "elogiar")) ||
    (arc.type === "notas" && (action === "orientar" || action === "elogiar" || action === "conversar")) ||
    (arc.type === "representante" && (action === "elogiar" || action === "conversar"));
  const hurts = action === "advertir" || action === "suspender";
  if (helps) arc.support += 1;
  if (hurts) arc.support -= 2;
  arc.lastActionDay = w.day;
}
export function storyNeedsDirector(world: GameWorld, studentId: string) {
  const arc = prog(world).arcs.find((a) => a.studentId === studentId && a.status === "ativa");
  return !!arc && arc.lastActionDay !== world.day && arc.type !== "representante";
}
function advanceArcs(sim: Sim, highlights: string[]) {
  const w = sim.world;
  const d = dir(w);
  for (const arc of prog(w).arcs) {
    if (arc.status !== "ativa") continue;
    const a = w.agents.find((x) => x.id === arc.studentId);
    const r = d.records[arc.studentId];
    if (!a || !r || a.status === "expulso") { arc.status = "encerrada"; arc.outcome = r?.status === "formado" ? "Formou-se antes de concluir a história." : "Matrícula encerrada."; continue; }
    const present = r.presentToday;
    let moved = false;
    if (arc.type === "adaptacao") moved = present && (a.mood >= 50 || arc.support > 0);
    if (arc.type === "notas") moved = present && (a.needs.learning >= 55 || arc.support > 0);
    if (arc.type === "representante") moved = true;
    if (moved) {
      arc.stage += 1;
      if (arc.support > 0) arc.support -= 1;
    }
    if (arc.type === "representante" && arc.stage >= 3) {
      const votes = 45 + a.mood * 0.35 + arc.support * 10 - (r.warnings ?? 0) * 15;
      const won = votes >= 60;
      arc.status = "concluida";
      arc.outcome = won ? "Eleito(a) representante de turma." : "Não foi eleito(a) desta vez.";
      recordFor(sim, a, won ? "elogio" : "conversa", arc.outcome);
      highlights.push(`${a.name}: ${arc.outcome}`);
      if (won) album(w, `Representante eleito(a): ${a.name}`, "A turma escolheu sua voz no Grêmio.");
    } else if (arc.stage >= 3) {
      arc.status = "concluida";
      arc.outcome = arc.type === "adaptacao" ? "Adaptou-se bem à escola." : "Recuperou as notas.";
      a.mood = clamp(a.mood + 8);
      recordFor(sim, a, "elogio", `${ARC_INFO[arc.type].name}: ${arc.outcome}`);
      highlights.push(`${a.name}: ${arc.outcome}`);
    } else if (moved) {
      recordFor(sim, a, "conversa", `${ARC_INFO[arc.type].name}: ${ARC_INFO[arc.type].stages[arc.stage]}.`);
    }
  }
}

// ------------------------------------------------------------------ cosméticos e objetivos
export const COSMETICS: Record<string, { slot: CosmeticSlot; name: string; value: string }> = {
  "pintura-lilas": { slot: "pintura", name: "Pintura Lilás PEG", value: "#ddd0f0" },
  "pintura-agua": { slot: "pintura", name: "Pintura Verde-água", value: "#cfe8e2" },
  "banco-roxo": { slot: "banco", name: "Bancos roxos", value: "#6d4aa8" },
  "jardim-ipe": { slot: "jardim", name: "Ipês floridos", value: "#e889c2" },
  "placa-esmaltada": { slot: "placa", name: "Placas esmaltadas", value: "#26395f" },
  "acessorio-cracha": { slot: "acessorio", name: "Crachá roxo do diretor", value: "#6d4aa8" },
  "acessorio-prancheta": { slot: "acessorio", name: "Prancheta dourada", value: "#e3b23c" },
};
export const OBJECTIVES: { id: string; title: string; how: string; target: number; reward: { money: number; rep: number; cosmetic: string }; requires?: (w: GameWorld) => string | null; progress: (w: GameWorld) => number }[] = [
  { id: "obj-pessoal", title: "Diretor presente", how: "Resolva 3 problemas pessoalmente em 1ª pessoa (reparos e mediações).", target: 3, reward: { money: 800, rep: 2, cosmetic: "acessorio-cracha" }, progress: (w) => prog(w).counters.personal },
  { id: "obj-turma", title: "Turma em evolução", how: "Aumente a aprendizagem média em 10 pontos desde que o objetivo apareceu (medido no fim do dia).", target: 10, reward: { money: 1200, rep: 3, cosmetic: "pintura-lilas" }, progress: (w) => Math.max(0, Math.round((prog(w).history.at(-1)?.learning ?? 0) - (prog(w).objectiveBase["obj-turma"] ?? 999))) },
  { id: "obj-intervalo", title: "Intervalo exemplar", how: "Feche um dia com fila máx. ≤ 5, refeições servidas e até 3 lixos no chão.", target: 1, reward: { money: 700, rep: 2, cosmetic: "banco-roxo" }, requires: (w) => (w.buildings.some((b) => b.kind === "canteen" && b.progress >= 1) ? null : "Requer cantina."), progress: (w) => prog(w).counters.goodBreak },
  { id: "obj-reforma", title: "Reforma concluída", how: "Conclua uma reforma de fachada em qualquer prédio.", target: 1, reward: { money: 600, rep: 2, cosmetic: "placa-esmaltada" }, progress: (w) => prog(w).counters.reforms },
  { id: "obj-evento", title: "Pronto para o evento", how: "Realize uma competição com preparação de pelo menos 60%.", target: 1, reward: { money: 1000, rep: 3, cosmetic: "jardim-ipe" }, progress: (w) => prog(w).counters.compPrepared },
  { id: "obj-projeto", title: "Projeto inaugurado", how: "Conclua todas as etapas de um projeto.", target: 1, reward: { money: 1500, rep: 3, cosmetic: "acessorio-prancheta" }, progress: (w) => prog(w).counters.projects },
  { id: "obj-estrelas", title: "Escola 4 estrelas", how: "Termine um dia com reputação de 4,0★ ou mais.", target: 1, reward: { money: 2000, rep: 4, cosmetic: "pintura-agua" }, progress: (w) => prog(w).counters.fourStars },
];
export function claimObjective(sim: Sim, id: string) {
  const p = prog(sim.world);
  const o = OBJECTIVES.find((x) => x.id === id);
  if (!o || p.claimed.includes(id)) return { ok: false, message: "Recompensa já resgatada." };
  if (o.progress(sim.world) < o.target) return { ok: false, message: "Objetivo ainda não concluído." };
  p.claimed.push(id); // registro antes do pagamento: recompensa única mesmo com recarga
  addLedger(sim, o.reward.money, "Objetivo de gestão", o.title, "missao");
  sim.world.reputation = clamp(sim.world.reputation + o.reward.rep);
  if (!p.cosmetics.includes(o.reward.cosmetic)) p.cosmetics.push(o.reward.cosmetic);
  album(sim.world, `Conquista: ${o.title}`, `Recompensa: ${COSMETICS[o.reward.cosmetic].name}.`);
  return { ok: true, message: `${o.title}: +R$ ${o.reward.money}, +${o.reward.rep} reputação e ${COSMETICS[o.reward.cosmetic].name}.` };
}
export function equipCosmetic(world: GameWorld, id: string | null, slot: CosmeticSlot) {
  const p = prog(world);
  if (id && !p.cosmetics.includes(id)) return;
  if (id) p.equipped[slot] = id;
  else delete p.equipped[slot];
}
export function cosmetic(world: GameWorld, slot: CosmeticSlot): string | null {
  const id = prog(world).equipped[slot];
  return id ? COSMETICS[id]?.value ?? null : null;
}
export const cosmeticPaint = (world: GameWorld) => cosmetic(world, "pintura");

// ------------------------------------------------------------------ ciclo diário
/** chamado no início de cada dia (uma vez por dia, inclusive após recarregar) */
export function progressDayStart(sim: Sim) {
  const w = sim.world;
  const p = prog(w);
  if (p.lastStartDay === w.day) return;
  p.lastStartDay = w.day;
  p.todayEvents = [];
  // formandos saem; novas matrículas confirmadas na véspera entram
  if (p.pendingGraduates.length) {
    const d = dir(w);
    for (const id of p.pendingGraduates) {
      const a = w.agents.find((x) => x.id === id);
      const r = d.records[id];
      if (r) { r.status = "formado"; r.exitReason = `Formou-se no dia ${w.day - 1}`; d.archive.unshift({ ...r }); }
      if (a) w.agents = w.agents.filter((x) => x !== a);
      w.enrolled = Math.max(0, w.enrolled - 1);
    }
    p.pendingGraduates = [];
  }
  if (p.pendingEnroll > 0) {
    w.enrolled += p.pendingEnroll;
    dir(w).log.newEnrollments = p.pendingEnroll;
    notify(sim, "good", "Novos alunos chegaram", `${p.pendingEnroll} estudante(s) começam hoje às 7h.`, `enroll-${w.day}`, 1);
    p.pendingEnroll = 0;
  }
  completeSteps(sim);
  gremioDayStart(sim);
  if (p.objectiveBase["obj-turma"] === undefined) p.objectiveBase["obj-turma"] = Math.round(w.stats.learning);
}
export function progressAfterSync(sim: Sim) {
  startArcs(sim);
}
export function progressTick(sim: Sim, dtMinutes: number) {
  const w = sim.world;
  competitionTick(sim);
  const p = prog(w);
  const floorStars = Math.floor(starBreakdown(w).stars);
  if (floorStars > p.lastStarFloor) {
    if (p.lastStarFloor > 0) moment(w, `A escola chegou a ${floorStars} estrelas!`, "Mais famílias vão procurar vagas na chegada das 7h.");
    p.lastStarFloor = floorStars;
  }
  if (w.day === 1 && w.minutes > 470 && w.minutes < 480 && w.daily.studentsInClassPeak >= 3) moment(w, "Primeiro dia de aula", "A primeira turma ocupou as carteiras.", w.buildings.find((b) => b.kind === "classroom")?.x, w.buildings.find((b) => b.kind === "classroom")?.z);
  const merenda = p.investId === "merenda" && p.investDay === w.day;
  for (const a of w.agents) {
    if (a.role !== "student" || !a.active) continue;
    if (merenda && a.state === "eat") a.needs.hunger = clamp(a.needs.hunger - dtMinutes * 0.5);
    const b = a.buildingId ? w.buildings.find((x) => x.id === a.buildingId) : null;
    if (b) {
      const t = buildingTier(b);
      const pb = projectBonus(b);
      if (t) a.needs.comfort = clamp(a.needs.comfort + dtMinutes * 0.02 * t);
      if (t >= 2 || pb) a.needs.learning = clamp(a.needs.learning + dtMinutes * 0.008 * (pb + (t >= 2 ? 1 : 0)));
    }
    if (p.landscape && !a.seatKey) a.needs.comfort = clamp(a.needs.comfort + dtMinutes * 0.01 * p.landscape);
  }
  void phaseFor;
}

export interface ProgressDaySummary {
  compare: { income: number; expenses: number; learning: number; hygiene: number; stars: number; attendance: number; meals: number } | null;
  learning: number;
  hygiene: number;
  resolved: string[];
  pending: string[];
  works: string[];
  projects: string[];
  objectives: string[];
  highlights: string[];
  tomorrow: string[];
  semester: string[] | null;
  graduation: string[] | null;
  upkeep: number;
}

/** cobrado antes do fechamento do caixa do dia */
export function chargeUpkeep(sim: Sim) {
  const upkeep = dailyUpkeep(sim.world);
  if (upkeep > 0) addLedger(sim, -upkeep, "Manutenção das melhorias", "Reformas e paisagismo", "utilidades");
}

/** chamado uma única vez no fechamento do dia (antes da virada) */
export function progressDayEnd(sim: Sim, totals: { income: number; expenses: number }): ProgressDaySummary {
  const w = sim.world;
  const p = prog(w);
  const d = dir(w);
  const upkeep = dailyUpkeep(w);
  const highlights: string[] = [];
  advanceArcs(sim, highlights);
  const stars = starBreakdown(w).stars;
  if (w.daily.queuePeak <= 5 && w.daily.servedMeals > 0 && d.litter.length <= 3) p.counters.goodBreak += 1;
  if (stars >= 4) p.counters.fourStars += 1;
  const present = Object.values(d.records).filter((r) => r.presentToday && r.status !== "expulso").length;
  const prev = p.history.at(-1) ?? null;
  const today = { day: w.day, income: Math.round(totals.income), expenses: Math.round(totals.expenses), learning: Math.round(w.stats.learning), hygiene: Math.round(w.stats.cleanliness), stars, attendance: present, meals: w.daily.servedMeals };
  p.history.push(today);
  if (p.history.length > 40) p.history.shift();
  // destaques
  const st = w.agents.filter((a) => a.role === "student" && (a.status ?? "ativo") === "ativo");
  const top = [...st].sort((a, b) => b.needs.learning - a.needs.learning)[0];
  if (top) highlights.push(`${top.name} teve o melhor aproveitamento do dia (${Math.round(top.needs.learning)}).`);
  const praised = st.filter((a) => d.records[a.id]?.history.some((h) => h.day === w.day && h.type === "elogio"));
  if (praised.length) highlights.push(`Elogiados hoje: ${praised.map((a) => a.name.split(" ")[0]).join(", ")}.`);
  // semestre e formatura
  let semester: string[] | null = null;
  let graduation: string[] | null = null;
  if (w.day % SEMESTER_DAYS === 0) {
    const semN = w.day / SEMESTER_DAYS;
    const byGroup = new Map<string, { n: number; learn: number; att: number; exp: number }>();
    for (const a of st) {
      const r = d.records[a.id];
      const g = r?.group ?? "Turma";
      const cur = byGroup.get(g) ?? { n: 0, learn: 0, att: 0, exp: 0 };
      cur.n += 1; cur.learn += a.needs.learning; cur.att += r?.daysPresent ?? 0; cur.exp += Math.max(1, r?.daysExpected ?? 1);
      byGroup.set(g, cur);
    }
    semester = [...byGroup].map(([g, v]) => `${g}: ${v.n} alunos · aprendizagem média ${Math.round(v.learn / v.n)} · frequência ${Math.round((v.att / v.exp) * 100)}%`);
    p.semesterReports.push({ semester: semN, day: w.day, lines: semester });
    album(w, `Fim do ${semN}º semestre`, semester.join(" | "));
    if (w.day % YEAR_DAYS === 0) {
      const veterans = st.filter((a) => (d.records[a.id]?.enrolledDay ?? w.day) <= w.day - 12).sort((a, b) => (d.records[b.id]?.daysPresent ?? 0) - (d.records[a.id]?.daysPresent ?? 0));
      const grads = veterans.slice(0, Math.max(veterans.length ? 1 : 0, Math.ceil(st.length * 0.3)));
      p.pendingGraduates = grads.map((a) => a.id);
      const best = grads[0];
      graduation = [`${grads.length} formando(s): ${grads.map((a) => a.name).join(", ")}.`];
      if (best) graduation.push(`Destaque de frequência: ${best.name}.`);
      const reps = p.arcs.filter((a) => a.type === "representante" && a.outcome?.startsWith("Eleito")).map((a) => w.agents.find((x) => x.id === a.studentId)?.name).filter(Boolean);
      if (reps.length) graduation.push(`Representantes do ano: ${reps.join(", ")}.`);
      if (grads.length) album(w, `Formatura do ano ${w.day / YEAR_DAYS}`, graduation.join(" "));
      for (const a of grads) recordFor(sim, a, "elogio", "Formatura: concluiu a etapa na escola.");
    }
  }
  // matrículas confirmadas para amanhã (estrelas × carteiras reais)
  const seats = sim.seats.filter((s) => s.kind === "classroom").length;
  const demand = stars >= 4 ? 3 : stars >= 3.2 ? 2 : stars >= 2.6 ? 1 : 0;
  const graduating = p.pendingGraduates.length;
  const canteenSeats = sim.seats.filter((s) => s.kind === "canteen").length;
  const bathrooms = w.buildings.filter((b) => b.kind === "bathroom" && b.progress >= 1).length;
  const teachers = w.staff.filter((m) => m.role === "teacher").length;
  const limits: [number, string][] = [
    [seats, "carteiras"], [canteenSeats ? Math.floor(canteenSeats * 2.5) : 0, "lugares na cantina"],
    [bathrooms * 25, "banheiros"], [Math.max(1, teachers) * 25, "professores"],
  ];
  const cap = Math.min(...limits.map((l) => l[0]));
  const limiter = limits.find((l) => l[0] === cap)?.[1] ?? null;
  const room = Math.max(0, cap - (w.enrolled - graduating));
  p.pendingEnroll = Math.min(room, demand + graduating);
  p.enrollLimit = room === 0 && demand > 0 ? `Matrículas travadas pela capacidade de ${limiter} (${cap} alunos).` : null;
  // listas
  const open = d.occurrences.filter((o) => o.status === "aberta").map((o) => o.title);
  const noSeat = w.agents.filter((a) => a.role === "student" && a.waitReason === "sem-assento").length;
  const pending = [...open];
  if (noSeat) pending.push(`${noSeat} aluno(s) sem carteira`);
  const blockedWorks = w.buildings.filter((b) => b.progress < 1);
  const resolved = d.occurrences.filter((o) => o.status === "resolvida" && Math.floor(o.startedAt / 1440) === w.day).map((o) => o.title);
  const works = blockedWorks.map((b) => `${BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind}: ${Math.round(b.progress * 100)}%`);
  const projects = p.projects.filter((x) => x.status !== "concluido").map((x) => {
    const def = PROJECTS.find((dd) => dd.id === x.defId)!;
    return `${def.name}: etapa ${x.step + 1}/${def.steps.length} (${def.steps[x.step]?.name ?? "—"}) ${x.status === "aguardando" ? "· aguardando verba" : `· pronta no dia ${x.readyDay}`}`;
  });
  const objectives = OBJECTIVES.filter((o) => !p.claimed.includes(o.id) && o.progress(w) >= o.target).map((o) => `${o.title} — resgate no gabinete`);
  // prévia confirmada de amanhã
  const tomorrow: string[] = [];
  const t = w.day + 1;
  if (p.pendingEnroll) tomorrow.push(`Chegada de ${p.pendingEnroll} novo(s) aluno(s).`);
  if (p.enrollLimit) pending.push(p.enrollLimit);
  gremioDayEnd(sim, tomorrow, highlights);
  voiceDayEnd(sim, highlights);
  if (graduating) tomorrow.push(`Despedida de ${graduating} formando(s).`);
  for (const b of blockedWorks) if (b.completeAt > 0 && b.completeAt <= t * 1440 + 1140) tomorrow.push(`Inauguração prevista: ${BUILDABLE_BY_KIND[b.kind]?.name}.`);
  for (const x of p.projects) if (x.status === "andamento" && x.readyDay === t) {
    const def = PROJECTS.find((dd) => dd.id === x.defId)!;
    tomorrow.push(`${def.name}: conclusão da etapa “${def.steps[x.step].name}”.`);
  }
  for (const c of p.competitions) if (c.status === "agendada" && c.day === t) tomorrow.push(`${COMP_INFO[c.type].name} contra ${RIVALS.find((r) => r.id === c.rivalId)?.name}, às 13h.`);
  for (const a of w.agents) if (a.status === "suspenso" && a.returnDay === t) tomorrow.push(`Retorno de ${a.name} da suspensão.`);
  if (t % SEMESTER_DAYS === 0) tomorrow.push(t % YEAR_DAYS === 0 ? "Último dia do ano: relatório do semestre e formatura." : "Último dia do semestre: relatório por turma.");
  return {
    compare: prev ? { income: prev.income, expenses: prev.expenses, learning: prev.learning, hygiene: prev.hygiene, stars: prev.stars, attendance: prev.attendance, meals: prev.meals } : null,
    learning: today.learning,
    hygiene: today.hygiene,
    resolved, pending, works, projects, objectives, highlights, tomorrow, semester, graduation, upkeep,
  };
}

export function semesterOf(day: number) {
  return { semester: Math.floor((day - 1) / SEMESTER_DAYS) + 1, dayInSemester: ((day - 1) % SEMESTER_DAYS) + 1, year: Math.floor((day - 1) / YEAR_DAYS) + 1 };
}
export function equipmentUnlocked(world: GameWorld, upgradeId: string): string | null {
  const need: Record<string, [SpecId, number]> = { placar: ["esportes", 1], lousaDigital: ["tecnologia", 1], palcoMovel: ["artes", 1], bibliotecaSala: ["academico", 1] };
  const n = need[upgradeId];
  if (!n) return null;
  return specLevel(world, n[0]) >= n[1] ? null : `Requer ${SPECS[n[0]].name} nível ${n[1]}.`;
}
export function directorAccessory(world: GameWorld) { return prog(world).equipped.acessorio ?? null; }
export function entranceBanners(world: GameWorld): string[] {
  return (Object.keys(SPECS) as SpecId[]).filter((s) => specLevel(world, s) >= 1).map((s) => SPECS[s].color);
}
export { entryPoint };


// ================================================================== terreno por parcelas
export function ownedParcelIds(world: GameWorld) { return prog(world).parcels; }
export function ownedParcelRects(world: GameWorld) {
  const ids = prog(world).parcels;

  return PARCELS
    .filter((parcel) => ids.includes(parcel.id))
    .map(({ minX, maxX, minZ, maxZ }) => ({
      minX,
      maxX,
      minZ,
      maxZ,
    }));
}
export function parcelAdjacent(world: GameWorld, def: ParcelDef) {
  const owned = PARCELS.filter((x) => ownedParcelIds(world).includes(x.id));
  return owned.some((o) => {
    const sideX = (o.maxX === def.minX || o.minX === def.maxX) && Math.min(o.maxZ, def.maxZ) - Math.max(o.minZ, def.minZ) > 1;
    const sideZ = (o.maxZ === def.minZ || o.minZ === def.maxZ) && Math.min(o.maxX, def.maxX) - Math.max(o.minX, def.minX) > 1;
    return sideX || sideZ;
  });
}
export function parcelPrice(world: GameWorld, def: ParcelDef) { return Math.round(def.price * difficulty(world).costMult); }
export function parcelHint(def: ParcelDef) {
  const w = def.maxX - def.minX, d = def.maxZ - def.minZ;
  const salas = Math.floor((w * d * 0.45) / 140);
  const quadras = Math.floor((w * d * 0.4) / 448);
  return `${w}×${d} m (${w * d} m²) · cabe ~${salas} salas ou ${quadras} quadra(s)`;
}
export function buyParcel(sim: Sim, id: string) {
  const def = PARCELS.find((x) => x.id === id);
  const p = prog(sim.world);
  if (!def) return { ok: false, message: "Lote inexistente." };
  if (p.parcels.includes(id)) return { ok: false, message: "Este lote já é da escola." }; // nunca cobra duas vezes
  if (!parcelAdjacent(sim.world, def)) return { ok: false, message: "Compre primeiro um lote vizinho a este." };
  const price = parcelPrice(sim.world, def);
  if (sim.world.budget < price) return { ok: false, message: `Saldo insuficiente: faltam R$ ${Math.ceil(price - sim.world.budget)}.` };
  p.parcels.push(id);
  addLedger(sim, -price, "Compra de terreno", def.name, "obra");
  setOwnedParcels(ownedParcelRects(sim.world));
  rebuildWorldModel(sim);
  album(sim.world, `Novo lote comprado: ${def.name}`, `${parcelHint(def)}. O muro foi estendido.`);
  return { ok: true, message: `${def.name} agora faz parte da escola. O muro interno foi removido.` };
}

// ================================================================== dificuldade
export type Difficulty = "tranquilo" | "gestao" | "desafio";
export const DIFFICULTY: Record<Difficulty, { label: string; costMult: number; incident: number; maxOpen: number; deadline: number; recovery: number; upkeep: number; desc: string }> = {
  tranquilo: { label: "Tranquilo", costMult: 0.75, incident: 0.55, maxOpen: 1, deadline: 1.7, recovery: 150, upkeep: 0.7, desc: "Custos menores, mais tempo para responder, um incidente por vez e dicas frequentes." },
  gestao: { label: "Gestão", costMult: 1, incident: 1, maxOpen: 2, deadline: 1, recovery: 80, upkeep: 1, desc: "Orçamento equilibrado: é preciso planejar e priorizar. Incidentes ocasionais com consequências graduais." },
  desafio: { label: "Desafio", costMult: 1.25, incident: 1.35, maxOpen: 3, deadline: 0.8, recovery: 40, upkeep: 1.4, desc: "Recursos limitados, manutenção mais cara e problemas que exigem prevenção." },
};
export function difficulty(world: GameWorld) { return DIFFICULTY[(world as PW).progress?.difficulty ?? "gestao"]; }
export function setDifficulty(world: GameWorld, d: Difficulty) { prog(world).difficulty = d; }

// ================================================================== planejamento
export interface PlanItem { id: string; kind: BuildingKind; x: number; z: number; rot: number }
export interface TemplateDef { id: string; name: string; custom?: boolean; items: { kind: BuildingKind; dx: number; dz: number; rot: number }[] }
const sz = (k: BuildingKind) => BUILDABLE_BY_KIND[k];
function row(kinds: BuildingKind[]): TemplateDef["items"] {
  let x = 0;
  return kinds.map((k, i) => {
    const w = sz(k).w;
    const it = { kind: k, dx: i === 0 ? 0 : x + w / 2, dz: 0, rot: 0 };
    x = (i === 0 ? w / 2 : it.dx + w / 2);
    return it;
  });
}
export const BASE_TEMPLATES: TemplateDef[] = [
  { id: "duas-salas", name: "Bloco de duas salas", items: row(["classroom", "classroom"]) },
  { id: "alimentacao", name: "Área de alimentação", items: [{ kind: "canteen", dx: 0, dz: 0, rot: 0 }, { kind: "patio", dx: 0, dz: sz("canteen").d / 2 + sz("patio").d / 2 + 2.4, rot: 0 }] },
  { id: "convivencia", name: "Pátio com convivência", items: row(["patio", "garden"]) },
  { id: "banheiros", name: "Conjunto de banheiros", items: row(["bathroom", "bathroom"]) },
  { id: "entrada", name: "Entrada escolar", items: row(["reception", "corridor", "garden"]) },
  { id: "bloco-l", name: "Bloco pedagógico em L", items: [...row(["classroom", "classroom"]), { kind: "library", dx: -sz("classroom").w / 2 + sz("library").d / 2, dz: -sz("classroom").d / 2 - sz("library").w / 2, rot: 1 }] },
];
export function allTemplates(world: GameWorld) { return [...BASE_TEMPLATES, ...prog(world).templates]; }
let planSerial = 0;
export function addPlan(world: GameWorld, kind: BuildingKind, x: number, z: number, rot: number) {
  prog(world).plans.push({ id: `pl-${Date.now().toString(36)}-${planSerial++}`, kind, x, z, rot });
}
export function addTemplatePlans(world: GameWorld, t: TemplateDef, x: number, z: number) {
  for (const it of t.items) addPlan(world, it.kind, Math.round((x + it.dx) * 2) / 2, Math.round((z + it.dz) * 2) / 2, it.rot);
}
export function removePlan(world: GameWorld, id: string) { const p = prog(world); p.plans = p.plans.filter((x) => x.id !== id); }
export function saveTemplateFromPlans(world: GameWorld, name: string) {
  const p = prog(world);
  if (!p.plans.length) return { ok: false, message: "Desenhe ao menos uma construção planejada." };
  const a = p.plans[0];
  p.templates.push({ id: `tp-${Date.now().toString(36)}`, name, custom: true, items: p.plans.map((x) => ({ kind: x.kind, dx: x.x - a.x, dz: x.z - a.z, rot: x.rot })) });
  return { ok: true, message: `Modelo “${name}” salvo.` };
}
const probe = (pl: PlanItem) => ({ id: pl.id, kind: pl.kind, x: pl.x, z: pl.z, rot: pl.rot, progress: 1, startedAt: 0, completeAt: 0, condition: 100, dirt: 0, accessible: true } as BuildingInstance);
export function planStatus(sim: Sim) {
  const plans = prog(sim.world).plans;
  return plans.map((pl) => {
    const others = plans.filter((o) => o.id !== pl.id).map(probe);
    const v = validatePlacement(sim, pl.kind, pl.x, pl.z, pl.rot, undefined, { ignoreBudget: true, extra: others });
    const spec = BUILDABLE_BY_KIND[pl.kind];
    return { plan: pl, ok: v.ok, message: v.message, reason: v.reason, cost: Math.round(spec.cost * difficulty(sim.world).costMult), seats: spec.seats, upkeep: spec.open ? 15 : 60 };
  });
}
export function buildPlan(sim: Sim, id: string, place: (kind: BuildingKind, x: number, z: number, rot: number) => { ok: boolean; message: string; reason?: string }) {
  const pl = prog(sim.world).plans.find((x) => x.id === id);
  if (!pl) return { ok: false, message: "Plano não encontrado." };
  const r = place(pl.kind, pl.x, pl.z, pl.rot);
  if (r.ok) removePlan(sim.world, id);
  return { ok: r.ok, message: r.ok ? `${BUILDABLE_BY_KIND[pl.kind].name}: obra iniciada a partir do plano.` : `${r.message}${r.reason ? ` — ${r.reason}` : ""}` };
}

// ================================================================== Grêmio estudantil
export interface GremioState { status: "nenhum" | "campanha" | "eleito" | "aprovado" | "etapas" | "adiado" | "concluido"; candidates: { studentId: string; proposal: string; votes: number }[]; winner?: { studentId: string; proposal: string }; achievements: string[]; electionDay: number; projectId?: string }
export const GREMIO_PROPOSALS: { id: string; title: string; defId: string; interest: string[] }[] = [
  { id: "quadra", title: "Melhorar a quadra", defId: "gremio-quadra", interest: ["sport"] },
  { id: "jornal", title: "Criar um jornal escolar", defId: "gremio-jornal", interest: ["read", "social"] },
  { id: "feira", title: "Organizar uma feira cultural", defId: "gremio-feira", interest: ["art", "music"] },
  { id: "coleta", title: "Implantar coleta seletiva", defId: "gremio-coleta", interest: ["science"] },
  { id: "convivencia", title: "Reformar a área de convivência", defId: "gremio-convivencia", interest: ["social", "art"] },
];
function gremioDayStart(sim: Sim) {
  const w = sim.world;
  const g = prog(w).gremio;
  const due = w.day >= 2 && (g.status === "nenhum" || (g.status === "concluido" && w.day - g.electionDay >= SEMESTER_DAYS));
  if (!due) return;
  const st = w.agents.filter((a) => a.role === "student" && (a.status ?? "ativo") === "ativo");
  if (st.length < 6) return;
  const props = GREMIO_PROPOSALS.filter((pp) => {
    const def = PROJECTS.find((d) => d.id === pp.defId)!;
    return w.buildings.some((b) => b.progress >= 1 && def.kinds.includes(b.kind));
  });
  if (props.length < 2) return;
  const cands = [...st].sort((a, b) => hashString(a.id + w.day) - hashString(b.id + w.day)).slice(0, Math.min(3, props.length));
  g.candidates = cands.map((a, i) => ({ studentId: a.id, proposal: props[(i + w.day) % props.length].id, votes: 0 }));
  g.status = "campanha";
  g.electionDay = w.day;
  g.winner = undefined;
  notify(sim, "info", "Eleição do Grêmio", `${g.candidates.length} chapas em campanha hoje. O resultado sai no fim do dia.`, `gremio-${w.day}`, 1);
}
function gremioDayEnd(sim: Sim, tomorrow: string[], highlights: string[]) {
  const w = sim.world;
  const g = prog(w).gremio;
  if (g.status !== "campanha" || g.electionDay !== w.day) return;
  const st = w.agents.filter((a) => a.role === "student" && (a.status ?? "ativo") === "ativo");
  for (const c of g.candidates) {
    const pp = GREMIO_PROPOSALS.find((x) => x.id === c.proposal)!;
    const cand = w.agents.find((a) => a.id === c.studentId);
    c.votes = st.filter((s) => pp.interest.includes(s.interest)).length * 2 + Math.round((cand?.mood ?? 50) / 20) + st.filter((s) => cand?.friends.includes(s.id)).length;
  }
  const win = [...g.candidates].sort((a, b) => b.votes - a.votes)[0];
  g.winner = { studentId: win.studentId, proposal: win.proposal };
  g.status = "eleito";
  const a = w.agents.find((x) => x.id === win.studentId);
  const pp = GREMIO_PROPOSALS.find((x) => x.id === win.proposal)!;
  if (a) {
    recordFor(sim, a, "elogio", `Eleito(a) presidente do Grêmio com a proposta “${pp.title}”.`);
    for (const f of a.friends) { const fr = w.agents.find((x) => x.id === f); if (fr) fr.mood = clamp(fr.mood + 4); }
  }
  highlights.push(`Grêmio: ${a?.name ?? "chapa"} venceu com “${pp.title}” (${win.votes} votos).`);
  tomorrow.push(`Decidir o orçamento da proposta do Grêmio: ${pp.title}.`);
  album(w, `Grêmio eleito: ${a?.name ?? ""}`, pp.title);
}
export function gremioDecide(sim: Sim, choice: "completo" | "etapas" | "adiar") {
  const w = sim.world;
  const g = prog(w).gremio;
  if (!g.winner || (g.status !== "eleito" && g.status !== "adiado")) return { ok: false, message: "Não há proposta aguardando decisão." };
  const pp = GREMIO_PROPOSALS.find((x) => x.id === g.winner!.proposal)!;
  const def = PROJECTS.find((d) => d.id === pp.defId)!;
  if (choice === "adiar") {
    g.status = "adiado";
    for (const s of w.agents) if (s.role === "student" && pp.interest.includes(s.interest)) s.mood = clamp(s.mood - 4);
    return { ok: true, message: "Proposta adiada. Os apoiadores ficaram um pouco desanimados." };
  }
  const target = projectTargets(w, def)[0];
  if (!target) return { ok: false, message: `Requer ${def.kinds.map((k) => BUILDABLE_BY_KIND[k]?.name).join(" ou ")} disponível.` };
  const total = def.steps.reduce((s2, st) => s2 + st.cost, 0);
  if (choice === "completo" && w.budget < total) return { ok: false, message: `Saldo insuficiente para o orçamento completo (R$ ${total}). Negocie por etapas.` };
  const r = startProject(sim, def.id, target.id);
  if (!r.ok) return r;
  const pj = prog(w).projects.find((x) => x.defId === def.id && x.buildingId === target.id)!;
  pj.gremio = true;
  if (choice === "completo") {
    const rest = total - def.steps[0].cost;
    if (rest > 0) addLedger(sim, -rest, "Grêmio: orçamento completo", def.name, "melhoria");
    pj.spent = total;
    pj.prepaid = true;
  }
  g.status = choice === "completo" ? "aprovado" : "etapas";
  g.projectId = pj.id;
  for (const s of w.agents) if (s.role === "student" && pp.interest.includes(s.interest)) s.mood = clamp(s.mood + 5);
  return { ok: true, message: `${def.name}: ${choice === "completo" ? "orçamento aprovado, execução automática" : "execução por etapas — aprove cada etapa em Projetos"}.` };
}
function gremioDone(sim: Sim, def: ProjectDef) {
  const w = sim.world;
  const g = prog(w).gremio;
  g.status = "concluido";
  g.achievements.unshift(def.name.replace("Grêmio: ", ""));
  if (g.achievements.length > 6) g.achievements.length = 6;
  if (def.id === "gremio-coleta" && !w.improvements.includes("bins")) w.improvements.push("bins");
  if (def.id === "gremio-convivencia") { const b = w.buildings.find((x) => (x.kind === "patio" || x.kind === "garden") && x.progress >= 1); if (b && !b.upgrades?.includes("bancosCobertos")) b.upgrades = [...(b.upgrades ?? []), "bancosCobertos"]; }
  if (def.id === "gremio-quadra") { const b = w.buildings.find((x) => x.kind === "court" && x.progress >= 1); if (b && !b.upgrades?.includes("placar")) b.upgrades = [...(b.upgrades ?? []), "placar"]; }
  if (def.id === "gremio-feira") { try { startEvent(sim, "june-party"); } catch { /* evento indisponível */ } }
  album(w, `Conquista do Grêmio: ${def.name.replace("Grêmio: ", "")}`, "Exposta no mural do Grêmio.");
}

// ================================================================== Voz da escola
export interface VoiceRequest { id: string; key: string; who: string; from: "Alunos" | "Professores" | "Funcionários" | "Responsáveis"; problem: string; solutions: string[]; cost: number; count: number; status: "aberto" | "resolvido"; openedDay: number; resolvedDay?: number; result?: string; x?: number; z?: number }
function voiceDayEnd(sim: Sim, highlights: string[]) {
  const w = sim.world;
  const p = prog(w);
  const d = dir(w);
  const noSeat = w.agents.filter((a) => a.role === "student" && a.waitReason === "sem-assento").length;
  const lowCond = w.buildings.filter((b) => b.progress >= 1 && b.condition < 60).sort((a, b) => a.condition - b.condition)[0];
  const hasEquip = w.buildings.some((b) => b.upgrades?.includes("lousaDigital") || b.upgrades?.includes("bibliotecaSala"));
  const shade = p.landscape >= 2 || w.buildings.some((b) => b.upgrades?.includes("bancosCobertos"));
  const studentName = () => w.agents.filter((a) => a.role === "student")[w.day % Math.max(1, w.agents.filter((a) => a.role === "student").length)]?.name ?? "Turma A";
  const teacher = w.staff.find((m) => m.role === "teacher")?.name ?? "Professores";
  const needs: (Omit<VoiceRequest, "id" | "count" | "status" | "openedDay"> & { active: boolean; solved: () => boolean })[] = [
    { key: "assentos", who: studentName(), from: "Alunos", active: noSeat > 0, problem: `${noSeat} colega(s) ficaram sem carteira hoje.`, solutions: ["Investimento do dia: ampliar salas", "Construir outra sala (Planejamento)"], cost: 1600, solved: () => noSeat === 0 },
    { key: "equipamento", who: teacher, from: "Professores", active: w.day >= 3 && !hasEquip, problem: "As salas não têm nenhum equipamento de apoio às aulas.", solutions: ["Biblioteca de sala (Melhorias)", "Lousa digital (requer Tecnologia 1)"], cost: 1500, solved: () => hasEquip },
    { key: "manutencao", who: w.staff.find((m) => m.role === "maintenance")?.name ?? "Equipe de apoio", from: "Funcionários", active: !!lowCond, problem: lowCond ? `${roomLabelFor(lowCond, w.buildings)} está com conservação em ${Math.round(lowCond.condition)}%.` : "", solutions: ["Delegar “Chamar manutenção”", "Investimento do dia: manutenção"], cost: 900, solved: () => !w.buildings.some((b) => b.progress >= 1 && b.condition < 60), x: lowCond?.x, z: lowCond?.z },
    { key: "alimentacao", who: "Família de " + studentName(), from: "Responsáveis", active: w.daily.queuePeak > 6 && w.daily.servedMeals > 0, problem: `A fila da merenda chegou a ${w.daily.queuePeak} alunos.`, solutions: ["Segundo balcão de merenda", "Investimento do dia: melhorar a merenda", "Delegar “Acompanhar fila”"], cost: 3200, solved: () => w.daily.queuePeak <= 5 },
    { key: "organizacao", who: "Família de " + studentName(), from: "Responsáveis", active: d.litter.length > 5, problem: `${d.litter.length} embalagens ficaram no chão depois do intervalo.`, solutions: ["Contratar zelador", "Coleta seletiva (Grêmio ou Melhorias)"], cost: 900, solved: () => d.litter.length <= 2 },
    { key: "sombra", who: studentName(), from: "Alunos", active: !shade && w.weather === "sun" && w.day >= 2, problem: "Não há sombra no pátio nos dias de sol.", solutions: ["Paisagismo nível 2 (arborização)", "Bancos cobertos no pátio"], cost: 2100, solved: () => shade },
  ];
  for (const n of needs) {
    const open = p.voice.find((v) => v.key === n.key && v.status === "aberto");
    if (open) {
      if (n.solved()) {
        open.status = "resolvido";
        open.resolvedDay = w.day;
        open.result = `Resolvido no dia ${w.day}.`;
        thanks(sim, open);
        highlights.push(`Voz da escola: ${open.from} agradecem — ${open.problem.toLowerCase().replace(/\.$/, "")} foi resolvido.`);
      } else if (n.active) { open.count += 1; open.problem = n.problem || open.problem; }
      continue;
    }
    if (n.active && p.voice.filter((v) => v.status === "aberto").length < 4) {
      p.voice.unshift({ id: `vz-${n.key}-${w.day}`, key: n.key, who: n.who, from: n.from, problem: n.problem, solutions: n.solutions, cost: Math.round(n.cost * difficulty(w).costMult), count: 1, status: "aberto", openedDay: w.day, x: n.x, z: n.z });
    }
  }
  p.voice = p.voice.slice(0, 16);
}
function thanks(sim: Sim, v: VoiceRequest) {
  const w = sim.world;
  if (v.from === "Alunos") for (const a of w.agents) if (a.role === "student") a.mood = clamp(a.mood + 5);
  if (v.from === "Professores") for (const m of w.staff) if (m.role === "teacher") m.skill = Math.min(100, m.skill + 2);
  if (v.from === "Funcionários") for (const m of w.staff) m.rest = clamp(m.rest + 10);
  w.reputation = clamp(w.reputation + 1);
  notify(sim, "good", `Obrigado! — ${v.from}`, `${v.who}: “Percebemos a mudança. Obrigado por ouvir a escola!”`, `thanks-${v.id}`, 1);
}

// ================================================================== tutorial e novidades
export interface TutorialState { active: boolean; done: string[]; skipped: boolean; flags: Record<string, boolean>; baseline: { classrooms: number; teachers: number } }
export const TUTORIAL_STEPS: { id: string; title: string; mouse: string; touch: string; highlight?: string; check: (w: GameWorld, t: TutorialState) => boolean }[] = [
  { id: "boasvindas", title: "Bem-vindo(a), diretor(a)!", mouse: "Eu sou a Dona Célia, da secretaria. Vou te mostrar a escola em poucos passos. Toque em Continuar.", touch: "Eu sou a Dona Célia, da secretaria. Vou te mostrar a escola em poucos passos. Toque em Continuar.", check: (_w, t) => !!t.flags.boasvindas },
  { id: "camera", title: "Olhe ao redor", mouse: "Arraste com o botão esquerdo para girar, use a roda para aproximar e o botão direito (ou Shift + arrastar) para mover.", touch: "Arraste com um dedo para girar, use dois dedos para mover e faça pinça para aproximar.", check: (_w, t) => !!t.flags.camera },
  { id: "interagir", title: "Conheça alguém", mouse: "Clique em um aluno ou em um prédio para ver detalhes.", touch: "Toque rapidamente em um aluno ou prédio para ver detalhes.", check: (_w, t) => !!t.flags.select },
  { id: "sala", title: "Construa uma sala", mouse: "Abra “Menu da escola” → Construir → Sala de aula. Clique no terreno para fixar a prévia, R gira e Enter confirma.", touch: "Abra “Menu da escola” → Construir → Sala de aula. Toque no terreno para fixar a prévia e depois em Construir.", highlight: "menu", check: (w, t) => w.buildings.filter((b) => b.kind === "classroom").length > t.baseline.classrooms },
  { id: "professor", title: "Contrate um professor", mouse: "No Menu da escola, abra Equipe e contrate um(a) professor(a).", touch: "No Menu da escola, abra Equipe e contrate um(a) professor(a).", highlight: "menu", check: (w, t) => w.staff.filter((m) => m.role === "teacher").length > t.baseline.teachers },
  { id: "turma", title: "Receba a turma", mouse: "Às 7h a turma chega pelo portão. Acelere o tempo (teclas 1–3) e veja os alunos sentarem.", touch: "Às 7h a turma chega pelo portão. Use os botões de velocidade e veja os alunos sentarem.", check: (w) => w.daily.studentsInClassPeak >= 5 },
  { id: "problema", title: "Observe um problema", mouse: "Clique em “?” e abra Problemas agora. Use “Por quê?” e “Mostrar no mapa”.", touch: "Toque em “?” e abra Problemas agora. Use “Por quê?” e “Mostrar no mapa”.", highlight: "help", check: (_w, t) => !!t.flags.help },
  { id: "missao", title: "Resolva uma missão", mouse: "Abra o Gabinete → Missões ou resolva uma ocorrência em Decisões.", touch: "Toque em Gabinete → Missões ou resolva uma ocorrência em Decisões.", highlight: "gabinete", check: (w) => dir(w).missions.some((m) => m.claimed) || dir(w).log.occResolved > 0 || prog(w).claimed.length > 0 },
  { id: "relatorio", title: "O fim do dia", mouse: "Às 19h abre o Boletim do dia: ele explica o que melhorou, o que piorou e o que vem amanhã. Leia e toque em Começar próximo dia.", touch: "Às 19h abre o Boletim do dia: ele explica o que melhorou, o que piorou e o que vem amanhã. Leia e toque em Começar próximo dia.", check: (_w, t) => !!t.flags.report },
];
export function tutorialCurrent(world: GameWorld) {
  const t = prog(world).tutorial;
  for (const st of TUTORIAL_STEPS) {
    if (!t.done.includes(st.id) && st.check(world, t)) t.done.push(st.id);
  }
  return TUTORIAL_STEPS.find((st) => !t.done.includes(st.id)) ?? null;
}
export function tutorialFlag(world: GameWorld, flag: string) { prog(world).tutorial.flags[flag] = true; }
export function startTutorial(world: GameWorld, restart = false) {
  const t = prog(world).tutorial;
  if (restart) { t.done = []; t.flags = {}; t.baseline = { classrooms: world.buildings.filter((b) => b.kind === "classroom").length, teachers: world.staff.filter((m) => m.role === "teacher").length }; }
  t.active = true;
  t.skipped = false;
}
export const WHATS_NEW_VERSION = 3;
export const WHATS_NEW = [
  "Terreno 4× maior, comprado por lotes no Gabinete → Terreno.",
  "Incidentes em etapas: identificar, decidir, executar e verificar — com delegação para a equipe.",
  "Central de ajuda (?) com “Por que isso está acontecendo?” e “Mostrar no mapa”.",
  "Raio-X da escola: fluxo, acessibilidade, limpeza, barulho, conforto e serviços.",
  "Modo planejamento com modelos de blocos, Grêmio com eleições e Voz da escola.",
  "Personalização da identidade, corredores cobertos, momentos marcantes e novo Boletim do dia.",
];

// ================================================================== personalização
export type FacadeModel = "classica" | "moderna" | "tijolo" | "colonial";
export interface Customization { facade: FacadeModel; uniform: { style: "camiseta" | "polo" | "agasalho"; shirt: string; pants: string }; crest: number }
export interface Moment { id: string; day: number; title: string; text: string; x?: number; z?: number; seen: boolean }
export const FACADES: Record<FacadeModel, { name: string; desc: string }> = {
  classica: { name: "Clássica PEG", desc: "Barrado de tijolo e faixa roxa." },
  moderna: { name: "Moderna", desc: "Pintura lisa e molduras roxas nas janelas." },
  tijolo: { name: "Tijolo aparente", desc: "Paredes externas inteiras em tijolo." },
  colonial: { name: "Colonial", desc: "Branco com barrado ocre." },
};
export const CREST_NAMES = ["Escudo e estrela", "Livro aberto", "Chama do saber", "Folha e semente", "Átomo", "Engrenagem"];
export const PAINT_COST = 300, FLOOR_COST = 500, FACADE_COST = 800, UNIFORM_COST = 40;
export function paintTargets(world: GameWorld, buildingId: string, scope: "sala" | "tipo") {
  const b = world.buildings.find((x) => x.id === buildingId);
  if (!b) return [];
  return scope === "sala" ? [b] : world.buildings.filter((x) => x.kind === b.kind && x.progress >= 1);
}
export function applyRoomStyle(sim: Sim, buildingId: string, scope: "sala" | "tipo", style: { paint?: string; floor?: string }) {
  const targets = paintTargets(sim.world, buildingId, scope);
  const unit = (style.paint ? PAINT_COST : 0) + (style.floor ? FLOOR_COST : 0);
  const total = Math.round(unit * targets.length * difficulty(sim.world).costMult);
  if (!targets.length || !unit) return { ok: false, message: "Escolha uma cor ou piso." };
  if (sim.world.budget < total) return { ok: false, message: `Saldo insuficiente (R$ ${total}).` };
  addLedger(sim, -total, "Personalização", `${targets.length} ambiente(s)`, "melhoria");
  for (const b of targets) { if (style.paint) b.paint = style.paint; if (style.floor) b.floorStyle = style.floor; }
  rebuildWorldModel(sim);
  return { ok: true, message: `Aplicado em ${targets.length} ambiente(s) por R$ ${total}.` };
}
export function applyFacade(sim: Sim, model: FacadeModel) {
  const walled = sim.world.buildings.filter((b) => isWalled(b) && b.kind !== "path" && b.kind !== "tactile").length;
  const total = Math.round(FACADE_COST * walled * difficulty(sim.world).costMult);
  const p = prog(sim.world);
  if (p.custom.facade === model) return { ok: false, message: "Este modelo já está aplicado." };
  if (sim.world.budget < total) return { ok: false, message: `Saldo insuficiente (R$ ${total}).` };
  addLedger(sim, -total, "Fachadas", FACADES[model].name, "melhoria");
  p.custom.facade = model;
  rebuildWorldModel(sim);
  return { ok: true, message: `Fachada ${FACADES[model].name} aplicada em ${walled} prédio(s).` };
}
export function applyUniform(sim: Sim, u: Customization["uniform"]) {
  const students = sim.world.agents.filter((a) => a.role === "student");
  const total = Math.round(UNIFORM_COST * students.length * difficulty(sim.world).costMult);
  if (sim.world.budget < total) return { ok: false, message: `Saldo insuficiente (R$ ${total}).` };
  addLedger(sim, -total, "Uniformes", `${students.length} kits`, "melhoria");
  prog(sim.world).custom.uniform = u;
  for (const a of students) { a.shirt = u.shirt; a.pants = u.pants; }
  return { ok: true, message: `Novos uniformes entregues (${students.length}).` };
}
