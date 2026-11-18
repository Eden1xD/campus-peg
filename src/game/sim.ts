import { advanceTraffic, createTraffic, waitAtCurb } from "./traffic";
import {
  BUILD_DURATION_MINUTES_PER_HOUR,
  BUILDABLE_BY_KIND,
  EVENTS,
  INITIAL_GROUPS,
  MISSION_DEFS,
  MODES,
  SAVE_VERSION,
  SCHOOL_NAME_DEFAULT,
  STORIES,
  STUDENT_NAMES,
  STAFF_ROLES,
  ENTRY_SPAWN,
  GATE,
  makeInitialSchedule,
  phaseFor,
  formatMoney,
} from "./config";
import { doorZone, entryPoint, footprintOf, hashString, isWalled, rectOverlap, rotateLocal, seatsForBuilding, specFor, type Rect } from "./layout";
import { chargeUpkeep, moment, ownedParcelRects, tutorialFlag, progressAfterSync, progressDayEnd, type ProgressDaySummary } from "./progression";
import { canteenCounters, dir, directorDayEnd, directorDayStart, directorHoldsStudent, directorTick, nextStudentIndex, onAgentArrive, studentAway, type DirectorDaySummary } from "./director";
import { departureGrid, neighborhoodHome, buildNavGrid, findPath, nearestWalkable, ownedContains, setOwnedParcels, walkableAt, type NavGrid } from "./nav";
import type {
  Agent,
  AgentRole,
  BuildingInstance,
  BuildingKind,
  GameMode,
  GameWorld,
  LedgerEntry,
  MissionState,
  ScheduleSlot,
  Seat,
  Snapshot,
  StaffMember,
  Vec2,
  Weather,
} from "./types";

export const MINUTES_PER_SECOND = 2;
/** Passos coerentes com 2 min de jogo/s: sem isso a turma levava ~75 min do desembarque à carteira. */
export const WALK_SCALE = 2.6;
const HOUR = 60;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function absMinutes(world: GameWorld): number {
  return world.day * 1440 + world.minutes;
}

function mkBuilding(kind: BuildingKind, x: number, z: number, rot: number, accessible: boolean, progress = 1): BuildingInstance {
  return {
    id: `${kind}-${Math.round(x)}-${Math.round(z)}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    x,
    z,
    rot,
    progress,
    startedAt: progress >= 1 ? 0 : absMinutesFallback(),
    completeAt: progress >= 1 ? 0 : 0,
    condition: 92,
    dirt: 8,
    accessible,
  };
}

function absMinutesFallback(): number {
  return 0;
}

interface DayReport {
  day: number;
  income: number;
  expenses: number;
  partial: boolean;
  budget: number;
  enrolled: number;
  meals: number;
  queuePeak: number;
  reputation: number;
  director?: DirectorDaySummary;
  progress?: ProgressDaySummary;
  byCat?: Record<string, number>;
}

type ReportWorld = GameWorld & {
  dayFinance?: { day: number; income: number; expenses: number; partial: boolean };
  pendingDayReport?: DayReport;
};

function finances(world: ReportWorld) {
  if (world.dayFinance?.day === world.day) return world.dayFinance;
  // For older saves, recover this day's retained transactions.
  const entries = world.ledger.filter((entry) => Math.floor(entry.at / 1440) === world.day);
  const totals = { day: world.day, income: 0, expenses: 0, partial: entries.length >= 80 };
  for (const entry of entries) {
    if (entry.amount >= 0) totals.income += entry.amount;
    else totals.expenses -= entry.amount;
  }
  world.dayFinance = totals;
  return totals;
}

const reportListeners = new Set<() => void>();
function publishReport() {
  for (const listener of reportListeners) listener();
}
export function subscribeDayReport(listener: () => void) {
  reportListeners.add(listener);
  return () => { reportListeners.delete(listener); };
}
export function getDayReport() {
  return activeSim?.world.pendingDayReport ?? null;
}
export function continueAfterDay() {
  if (!activeSim?.world.pendingDayReport) return;
  tutorialFlag(activeSim.world, "report");
  delete activeSim.world.pendingDayReport;
  publishReport();
}

export interface Sim {
  traffic: ReturnType<typeof createTraffic>;
  world: ReportWorld;
  grid: NavGrid;
  seats: Seat[];
  claims: Map<string, string>;
  queue: string[];
  notifGap: Map<string, number>;
  lastStatsAt: number;
  playerMode: "orbit" | "first";
}

let activeSim: Sim | null = null;

export function getSim(): Sim | null {
  return activeSim;
}

export function createAgent(
  world: GameWorld,
  role: AgentRole,
  name: string,
  index: number,
  wheelchair = false,
): Agent {
  const seed = hashString(`${name}-${index}`) * 100000;
  const rand = mulberry32(Math.floor(seed));
  const palette = ["#5c3b28", "#8a5a3b", "#c68e64", "#e0b18a", "#3f2a1d", "#a06d4b"];
  const shirts = ["#6d4aa8", "#7c5cc4", "#5b7dbe", "#8a6bbf", "#4f7c76"];
  const interests: Agent["interest"][] = ["read", "sport", "science", "art", "music", "social"];
  const stories = STORIES;
  return {
    id: `${role}-${index}-${Math.round(seed).toString(36)}`,
    name,
    role,
    skin: index % palette.length,
    hairStyle: index % 4,
    hairColor: ["#241a14", "#3d2a1c", "#17110d", "#6b4a2a", "#a3763f", "#2c2c2c"][index % 6],
    shirt: shirts[index % shirts.length],
    pants: ["#2f3542", "#3b4252", "#4b5563", "#324a5f"][index % 4],
    height: role === "student" ? 1.42 + (index % 6) * 0.055 : 1.68 + (index % 3) * 0.04,
    wheelchair,
    backpack: role === "student" && index % 3 !== 2,
    x: ENTRY_SPAWN.x + (rand() - 0.5) * 3,
    z: ENTRY_SPAWN.z + (rand() - 0.5) * 1.5,
    heading: Math.PI,
    speed: role === "student" ? (wheelchair ? 0.95 : 1.45) : 1.3,
    path: [],
    pathIndex: 0,
    state: "walk",
    activity: "Chegando à escola",
    destination: "Entrada",
    buildingId: null,
    seatKey: null,
    intent: "arrive",
    queueSlot: -1,
    waitTimer: 0,
    stuckTimer: 0,
    needs: {
      learning: role === "student" ? 45 + rand() * 20 : 60,
      hunger: 20 + rand() * 30,
      energy: 65 + rand() * 20,
      hygiene: 70 + rand() * 20,
      fun: 45 + rand() * 25,
      comfort: 60 + rand() * 20,
      social: 45 + rand() * 25,
    },
    mood: 62,
    friends: [],
    interest: interests[index % interests.length],
    club: null,
    active: false,
    leaving: false,
    visible: false,
    wanderTimer: 0,
    carrying: false,
    story: wheelchair ? stories[8] : stories[index % stories.length],
  };
}

export function createWorld(mode: GameMode): GameWorld {
  const preset = MODES[mode];
  const buildings: BuildingInstance[] = [
    mkBuilding("classroom", -12, -5.5, 0, true),
    mkBuilding("canteen", 11, -5.5, 0, true),
    mkBuilding("reception", 23, -18, 0, true),
    mkBuilding("bathroom", -24, -18, 0, true),
    mkBuilding("patio", 0, 7, 0, true),
  ];
  const classroom = buildings[0];
  const groups = INITIAL_GROUPS.map((g) => ({ ...g }));
  const world: GameWorld = {
    version: SAVE_VERSION,
    mode,
    schoolName: SCHOOL_NAME_DEFAULT,
    schoolColors: { primary: "#6d4aa8", accent: "#f0b95a" },
    day: 1,
    minutes: 400,
    weather: "sun",
    budget: preset.budget,
    reputation: preset.reputation,
    enrolled: 10,
    buildings,
    improvements: [],
    agents: [],
    staff: [
      { id: "staff-teacher-1", name: "Prof.ª Marta", role: "teacher", skill: 74, salary: 320, rest: 80, workload: 30, training: 1, assignedZone: null },
      { id: "staff-canteen-1", name: "Rosa (cantina)", role: "canteen", skill: 62, salary: 210, rest: 85, workload: 25, training: 0, assignedZone: null },
    ],
    groups,
    schedule: makeInitialSchedule(classroom.id),
    missions: MISSION_DEFS.map<MissionState>((m) => ({ id: m.id, progress: 0, target: m.target, completed: false, claimed: false })),
    events: [],
    stock: {
      food: 40,
      supplies: 55,
      cleaning: 28,
      materials: 22,
      autoReorder: true,
      min: { food: 18, supplies: 20, cleaning: 10, materials: 8 },
    },
    ledger: [],
    notifications: [],
    stats: {
      learning: 38,
      comfort: 55,
      cleanliness: 88,
      satisfaction: 62,
      fun: 50,
      social: 48,
      occupancy: 0,
      accessibility: 40,
      queue: 0,
      energy: 100,
      water: 100,
      seatsTotal: 0,
      seatsUsed: 0,
      mealsToday: 0,
      classesToday: 0,
      attendance: 0,
    },
    daily: {
      fundingPaid: false,
      payrollPaid: false,
      utilitiesPaid: false,
      servedMeals: 0,
      queuePeak: 0,
      studentsInClassPeak: 0,
      readingPeak: 0,
      eventAttendance: 0,
    },
    player: { x: 0, z: -12, heading: Math.PI, visits: [] },
    ads: { lastClaimAt: 0, claims: 0 },
    cameraFavorites: [],
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
    tutorialStep: 0,
    savedAt: 0,
    lastTickAt: Date.now(),
    rngSeed: 20260214,
  };
  const staffAgents = world.staff.map((member, index) => createAgent(world, member.role, member.name, index + 100));
  const students = Array.from({ length: world.enrolled }, (_, index) =>
    createAgent(world, "student", STUDENT_NAMES[index % STUDENT_NAMES.length], index, index === 0),
  );
  world.agents = [...students, ...staffAgents];
  linkFriends(world);
  return world;
}

function linkFriends(world: GameWorld) {
  const students = world.agents.filter((a) => a.role === "student");
  students.forEach((student, index) => {
    student.friends = [
      students[(index + 1) % students.length]?.id,
      students[(index + 3) % students.length]?.id,
    ].filter(Boolean) as string[];
  });
}

export function syncAgents(world: GameWorld) {
  const students = world.agents.filter((a) => a.role === "student");
  for (let i = students.length; i < world.enrolled; i += 1) {
    const serial = (world as { director?: unknown }).director ? nextStudentIndex(world) : i;
    const agent = createAgent(world, "student", STUDENT_NAMES[serial % STUDENT_NAMES.length], serial, false);
    world.agents.push(agent);
  }
  // crew agents follow the staff roster
  for (const member of world.staff) {
    const existing = world.agents.find((a) => a.id === `crew-${member.id}`);
    if (!existing) {
      const agent = createAgent(world, member.role, member.name, world.agents.length + 200);
      agent.id = `crew-${member.id}`;
      agent.active = true;
      agent.visible = true;
      agent.x = GATE.x + 2;
      agent.z = GATE.z + 3;
      world.agents.push(agent);
    } else {
      existing.name = member.name;
      existing.role = member.role;
    }
  }
  const staffIds = new Set(world.staff.map((m) => `crew-${m.id}`));
  world.agents = world.agents.filter((a) => a.role === "student" || !a.id.startsWith("crew-") || staffIds.has(a.id));
  linkFriends(world);
}

export function initSim(world: GameWorld): Sim {
  const legacyKinds: Record<string, BuildingKind> = {
    studyHall: "study",
    mediaRoom: "media",
    designLab: "design",
  };

  // Valida todas as construções antes de alterar o mundo.
  const migratedBuildings = world.buildings.map((building) => {
    const originalKind = String(building.kind);
    const kind = legacyKinds[originalKind] ?? building.kind;

    if (!Object.prototype.hasOwnProperty.call(BUILDABLE_BY_KIND, kind)) {
      throw new Error(
        `Construção não reconhecida: "${originalKind}" ` +
        `(ID: ${building.id}). O save não foi apagado.`
      );
    }

    return { ...building, kind };
  });

  world.buildings = migratedBuildings;

  setOwnedParcels(ownedParcelRects(world));
  const sim: Sim = {
    traffic: createTraffic(),
    world,
    grid: buildNavGrid(world.buildings),
    seats: world.buildings.flatMap((b) => seatsForBuilding(b)),
    claims: new Map(),
    queue: [],
    notifGap: new Map(),
    lastStatsAt: -999,
    playerMode: "orbit",
  };
  activeSim = sim;
  (globalThis as { __pegSim?: Sim }).__pegSim = sim;
  dir(world);
  publishReport();
  syncAgents(world);
  for (const agent of world.agents) {
    agent.path = [];
    agent.pathIndex = 0;
    agent.seatKey = null;
    agent.state = "idle";
    agent.waitTimer = 1.5;
    agent.stuckTimer = 0;
  }
  recomputeStats(sim);
  return sim;
}

export function rebuildWorldModel(sim: Sim) {
  sim.grid = buildNavGrid(sim.world.buildings);
  sim.seats = sim.world.buildings.flatMap((b) => seatsForBuilding(b));
  const validKeys = new Set(sim.seats.map((s) => s.key));
  sim.claims.forEach((agentId, key) => {
    if (!validKeys.has(key)) sim.claims.delete(key);
    const agent = sim.world.agents.find((a) => a.id === agentId);
    if (!agent || !validKeys.has(agent.seatKey ?? "")) {
      if (agent) {
        agent.seatKey = null;
        agent.intent = "idle";
        agent.waitTimer = 0;
      }
    }
  });
  sim.queue = sim.queue.filter((id) => sim.world.agents.some((a) => a.id === id && a.active));
  for (const agent of sim.world.agents) {
    // rotas afetadas pela obra: recalcula apenas quem tem um ponto agora bloqueado
    if (agent.active && agent.path.length && agent.intent !== "leave" && agent.path.slice(agent.pathIndex).some((p) => !walkableAt(sim.grid, p.x, p.z, agent.wheelchair) && p.z > sim.grid.minZ)) {
      const goal = agent.path[agent.path.length - 1];
      agent.path = [];
      if (!planOf(sim, agent, goal)) {
        releaseSeat(sim, agent);
        agent.intent = "idle";
        agent.waitTimer = 0;
      }
    }
    if (agent.buildingId && !sim.world.buildings.some((b) => b.id === agent.buildingId)) {
      agent.buildingId = null;
      agent.seatKey = null;
      agent.path = [];
      agent.intent = "idle";
      agent.waitTimer = 0;
    }
  }
  recomputeStats(sim);
}

export function notify(sim: Sim, tone: "info" | "good" | "warn" | "bad", title: string, body: string, key: string, gap = 120) {
  const now = absMinutes(sim.world);
  const last = sim.notifGap.get(key) ?? -9999;
  if (now - last < gap) return;
  sim.notifGap.set(key, now);
  sim.world.notifications.unshift({
    id: `n-${now}-${key}`,
    at: now,
    tone,
    title,
    body,
  });
  if (sim.world.notifications.length > 40) sim.world.notifications.length = 40;
}

export function addLedger(sim: Sim, amount: number, label: string, detail: string, category: LedgerEntry["category"]) {
  const totals = finances(sim.world) as ReturnType<typeof finances> & { byCat?: Record<string, number> };
  if (amount >= 0) totals.income += amount;
  else totals.expenses -= amount;
  totals.byCat = totals.byCat ?? {};
  totals.byCat[category] = (totals.byCat[category] ?? 0) + amount;
  sim.world.budget += amount;
  sim.world.ledger.unshift({
    id: `l-${absMinutes(sim.world)}-${Math.round(Math.random() * 9999)}`,
    at: absMinutes(sim.world),
    amount,
    label,
    detail,
    category,
  });
  if (sim.world.ledger.length > 80) sim.world.ledger.length = 80;
}

export function activeWalledBuildings(world: GameWorld): BuildingInstance[] {
  return world.buildings.filter((b) => isWalled(b) && b.kind !== "path" && b.kind !== "tactile");
}

export function totalSeats(world: GameWorld): number {
  return world.buildings.reduce((sum, b) => sum + (b.progress >= 1 ? seatsForBuilding(b).length : 0), 0);
}

function movementGrid(sim: Sim, agent: Agent) {
  const outsideEntrance = agent.z < sim.grid.minZ;
  return agent.role === "student" && (agent.intent === "leave" || outsideEntrance)
    ? departureGrid(sim.grid) : sim.grid;
}

export function planOf(sim: Sim, agent: Agent, point: Vec2): boolean {
  const accessibleOnly = agent.wheelchair;
  const result = findPath(movementGrid(sim, agent), { x: agent.x, z: agent.z }, point, { accessibleOnly });
  if (!result.reachable || result.points.length === 0) {
    if (accessibleOnly) {
      notify(
        sim,
        "warn",
        "Rota acessível ausente",
        `${agent.name} não consegue chegar a ${agent.destination}. Compre uma rota acessível no prédio (Melhorias).`,
        `access-${agent.destination}`,
        180,
      );
    }
    agent.path = [];
    agent.state = "idle";
    agent.waitTimer = 6;
    agent.waitReason = "sem-rota";
    return false;
  }
  agent.path = result.points;
  agent.pathIndex = 0;
  agent.state = "walk";
  agent.stuckTimer = 0;
  return true;
}

export function releaseSeat(sim: Sim, agent: Agent) {
  agent.carrying = false;
  if (agent.seatKey) {
    if (sim.claims.get(agent.seatKey) === agent.id) sim.claims.delete(agent.seatKey);
    agent.seatKey = null;
  }
}

function freeSeat(sim: Sim, kinds: BuildingKind[], agent: Agent): Seat | null {
  const candidates = sim.seats.filter((seat) => {
    if (!kinds.includes(seat.kind)) return false;
    if (sim.claims.has(seat.key)) return false;
    const building = sim.world.buildings.find((b) => b.id === seat.buildingId);
    if (!building || building.progress < 1) return false;
    if (agent.wheelchair && !building.accessible) return false;
    if (seat.kind === "computer" && (dir(sim.world).powerOut || dir(sim.world).nonEssentialOff)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const index = Math.floor(mulberry32(Math.floor(hashString(agent.id) * 99999) + absMinutes(sim.world))() * candidates.length);
  return candidates[index];
}

export function classroomSeat(sim: Sim, agent: Agent): Seat | null {
  return freeSeat(sim, ["classroom", "library", "lab", "computer", "arts", "makerspace", "study", "design"], agent);
}

function seatById(sim: Sim, key: string | null): Seat | null {
  if (!key) return null;
  return sim.seats.find((s) => s.key === key) ?? null;
}

function buildingName(sim: Sim, id: string | null): string {
  const b = sim.world.buildings.find((x) => x.id === id);
  return b ? BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind : "área comum";
}

function queuePoint(sim: Sim, index: number): Vec2 {
  const canteen = sim.world.buildings.find((b) => b.kind === "canteen" && b.progress >= 1);
  if (!canteen) return { x: 0, z: 0 };
  const entry = entryPoint(canteen);
  const lateral = rotateLocal(1, 0, canteen.rot);
  const outward = rotateLocal(0, 1, canteen.rot);
  const row = Math.floor(index / 5);
  const col = index % 5;
  return {
    x: entry.x + lateral.x * (col - 2) * 0.95 + outward.x * (row * 1.0) + outward.x * 0.6,
    z: entry.z + lateral.z * (col - 2) * 0.95 + outward.z * (row * 1.0) + outward.z * 0.6,
  };
}

function canteenSeatAvailable(sim: Sim): boolean {
  return sim.seats.some((seat) => {
    if (seat.kind !== "canteen" || sim.claims.has(seat.key)) return false;
    const b = sim.world.buildings.find((x) => x.id === seat.buildingId);
    return !!b && b.progress >= 1;
  });
}

export function takeSeat(sim: Sim, agent: Agent, seat: Seat, intent: Agent["intent"]) {
  releaseSeat(sim, agent);
  sim.claims.set(seat.key, agent.id);
  agent.seatKey = seat.key;
  agent.buildingId = seat.buildingId;
  agent.intent = intent;
  const b = sim.world.buildings.find((x) => x.id === seat.buildingId);
  agent.destination = `${BUILDABLE_BY_KIND[seat.kind]?.name ?? seat.kind}`;
  const entry = b ? entryPoint(b) : { x: seat.x, z: seat.z };
  agent.activity = "Indo para o lugar reservado";
  // enter through the door, then walk to the seat
  agent.path = [];
  const first = findPath(movementGrid(sim, agent), { x: agent.x, z: agent.z }, entry, { accessibleOnly: agent.wheelchair });
  const second = findPath(sim.grid, entry, { x: seat.x, z: seat.z }, { accessibleOnly: agent.wheelchair });
  if (!first.reachable || !second.reachable || !walkableAt(sim.grid, seat.x, seat.z, agent.wheelchair)) {
    releaseSeat(sim, agent);
    agent.buildingId = null;
    agent.intent = "idle";
    agent.state = "idle";
    agent.activity = "Aguardando um caminho livre";
    agent.waitReason = "sem-rota";
    agent.waitTimer = 6;
    return;
  }
  agent.path = [...first.points, ...second.points, { x: seat.x, z: seat.z }];
  agent.pathIndex = 0;
  agent.state = "walk";
  agent.stuckTimer = 0;
}

function chooseStudentTarget(sim: Sim, agent: Agent) {
  const world = sim.world;
  const phase = phaseFor(world.minutes);
  if (directorHoldsStudent(sim, agent)) return;
  if (phase === "exit" || phase === "empty") {
    goLeave(sim, agent);
    return;
  }
  if ((phase === "class" || phase === "arrival") && agent.intent === "class" &&
      agent.seatKey && sim.claims.get(agent.seatKey) === agent.id && agent.path.length === 0) {
    agent.waitTimer = 1;
    return;
  }
  releaseSeat(sim, agent);
  const hunger = agent.needs.hunger;
  // todos passam pelo balcão: a mesa só é reservada quando o atendimento libera a pessoa da fila
  if ((phase === "lunch" || (phase === "break" && hunger > 62)) && canteenSeatAvailable(sim) && !sim.world.buildings.some((b) => b.kind === "canteen" && b.progress >= 1)) {
    const seat = freeSeat(sim, ["canteen"], agent);
    if (seat) {
      takeSeat(sim, agent, seat, "eat");
      return;
    }
  }
  if ((phase === "lunch" || (phase === "break" && hunger > 55)) && sim.queue.length < 20) {
    if (!sim.queue.includes(agent.id)) sim.queue.push(agent.id);
    agent.queueSlot = sim.queue.indexOf(agent.id);
    agent.intent = "queue";
    agent.buildingId = world.buildings.find((b) => b.kind === "canteen")?.id ?? null;
    agent.destination = "Fila da cantina";
    agent.activity = "Na fila da cantina";
    agent.state = "queue";
    planOf(sim, agent, queuePoint(sim, agent.queueSlot));
    world.daily.queuePeak = Math.max(world.daily.queuePeak, sim.queue.length);
    const b = world.buildings.find((x) => x.kind === "canteen");
    if (b) b.dirt = clamp(b.dirt + 1.2);
    return;
  }
  if (phase === "class" || phase === "arrival") {
    const seat = classroomSeat(sim, agent);
    if (seat) {
      takeSeat(sim, agent, seat, "class");
      return;
    }
    agent.waitReason = "sem-assento";
    const without = world.agents.filter((a) => a.role === "student" && a.active && a.waitReason === "sem-assento").length;
    notify(sim, "warn", "Sem assento para todos", `${without} aluno(s) da ${world.groups[0]?.name ?? "turma"} sem carteira. Toque em Alunos para localizar; construa ou amplie salas.`, "no-seat", 150);
    goChill(sim, agent);
    return;
  }
  // interval and activities follow student interests
  const preference: Record<Agent["interest"], BuildingKind[]> = {
    sport: ["court", "patio", "garden"],
    read: ["library", "study", "patio", "garden"],
    music: ["media", "arts", "auditorium", "patio"],
    art: ["arts", "design", "patio", "garden"],
    science: ["lab", "makerspace", "computer", "library"],
    social: ["patio", "canteen", "garden"],
  };
  const kinds = preference[agent.interest];
  const available = sim.seats.filter(
    (seat) =>
      kinds.includes(seat.kind) &&
      !sim.claims.has(seat.key) &&
      world.buildings.some((b) => b.id === seat.buildingId && b.progress >= 1) &&
      (!agent.wheelchair || world.buildings.find((b) => b.id === seat.buildingId)?.accessible),
  );
  if (available.length > 0) {
    const seat = available[Math.floor(hashString(agent.id + phase + Math.floor(world.minutes / 30)) * available.length)];
    takeSeat(sim, agent, seat, "play");
    return;
  }
  if (hunger > 70 && canteenSeatAvailable(sim)) {
    const seat = freeSeat(sim, ["canteen"], agent);
    if (seat) {
      takeSeat(sim, agent, seat, "eat");
      return;
    }
  }
  goChill(sim, agent);
}

export function goChill(sim: Sim, agent: Agent) {
  const b = sim.world.buildings.find((x) => x.kind === "patio" && x.progress >= 1);
  const target = b ? entryPoint(b) : { x: 0, z: 4 };
  agent.intent = "idle";
  agent.buildingId = b?.id ?? null;
  agent.destination = "Pátio";
  agent.activity = "No pátio";
  agent.waitTimer = 0;
  planOf(sim, agent, { x: target.x + (hashString(agent.id) - 0.5) * 5, z: target.z + 1 });
}

export function goLeave(sim: Sim, agent: Agent) {
  releaseSeat(sim, agent);
  agent.leaving = true;
  agent.intent = "leave";
  agent.buildingId = null;
  agent.queueSlot = -1;
  sim.queue = sim.queue.filter((id) => id !== agent.id);
  agent.destination = "Casa";
  const home = neighborhoodHome(Math.min(9, Math.floor(hashString(agent.id) * 10)));
  const route = findPath(departureGrid(sim.grid), agent, home, { accessibleOnly: agent.wheelchair });
  agent.pathIndex = 0;
  agent.stuckTimer = 0;
  agent.path = route.points;
  const end = route.points[route.points.length - 1];
  if (!route.reachable || !end || Math.hypot(end.x - home.x, end.z - home.z) > 0.05) {
    agent.path = [];
    agent.activity = "Aguardando passagem para casa";
    agent.state = "idle";
    agent.waitTimer = 3;
    return;
  }
  agent.activity = "Voltando para casa";
  agent.waitTimer = 0;
  agent.state = "walk";
}

function staffTarget(sim: Sim, agent: Agent) {
  const world = sim.world;
  const phase = phaseFor(world.minutes);
  const member = world.staff.find((m) => `crew-${m.id}` === agent.id);
  if (phase === "empty" && world.minutes > 1020) {
    releaseSeat(sim, agent);
    agent.intent = "leave";
    agent.destination = "Fora do turno";
    agent.activity = "Fim do expediente";
    agent.path = [{ x: GATE.x, z: GATE.z - 1 }, { x: ENTRY_SPAWN.x, z: ENTRY_SPAWN.z - 2 }];
    agent.pathIndex = 0;
    agent.state = "walk";
    return;
  }
  if (agent.role === "teacher") {
    if (phase === "class" || phase === "arrival") {
      const room = world.buildings.find((b) => b.kind === "classroom" && b.progress >= 1);
      if (room) {
        releaseSeat(sim, agent);
        const fp = footprintOf(room);
        const local = rotateLocal(0, -specFor(room.kind).d / 2 + 2.6, room.rot);
        agent.intent = "teach";
        agent.buildingId = room.id;
        agent.destination = "Sala de aula";
        agent.activity = "Preparando a aula";
        planOf(sim, agent, { x: room.x + local.x, z: room.z + local.z });
        return;
      }
    }
    const lounge = world.buildings.find((b) => b.kind === "staffroom" && b.progress >= 1) ?? world.buildings.find((b) => b.kind === "patio");
    if (lounge) {
      const seat = freeSeat(sim, ["staffroom", "patio"], agent);
      if (seat) {
        takeSeat(sim, agent, seat, "idle");
        return;
      }
    }
  }
  if (agent.role === "canteen") {
    const canteen = world.buildings.find((b) => b.kind === "canteen" && b.progress >= 1);
    if (canteen) {
      releaseSeat(sim, agent);
      const fp = footprintOf(canteen);
      const local = rotateLocal(0, -fp.d / 2 + 2.6, canteen.rot);
      agent.intent = "canteen";
      agent.buildingId = canteen.id;
      agent.destination = "Cantina";
      agent.activity = phase === "lunch" ? "Servindo merenda" : "Organizando a cantina";
      planOf(sim, agent, { x: canteen.x + local.x, z: canteen.z + local.z });
      return;
    }
  }
  if (agent.role === "custodian") {
    const dirty = [...world.buildings].sort((a, b) => b.dirt - a.dirt)[0];
    if (dirty && dirty.dirt > 12) {
      releaseSeat(sim, agent);
      agent.intent = "clean";
      agent.buildingId = dirty.id;
      agent.destination = BUILDABLE_BY_KIND[dirty.kind]?.name ?? "Prédio";
      agent.activity = `Limpando ${buildingName(sim, dirty.id)}`;
      planOf(sim, agent, entryPoint(dirty));
      return;
    }
  }
  if (agent.role === "maintenance") {
    const worst = [...world.buildings].filter((b) => b.progress >= 1).sort((a, b) => a.condition - b.condition)[0];
    if (worst && worst.condition < 85) {
      releaseSeat(sim, agent);
      agent.intent = "fix";
      agent.buildingId = worst.id;
      agent.destination = BUILDABLE_BY_KIND[worst.kind]?.name ?? "Prédio";
      agent.activity = `Consertando ${buildingName(sim, worst.id)}`;
      planOf(sim, agent, entryPoint(worst));
      return;
    }
  }
  if (agent.role === "coordinator") {
    const reception = world.buildings.find((b) => b.kind === "reception" && b.progress >= 1);
    const point = phase === "arrival" || phase === "exit" || reception === undefined
      ? { x: GATE.x + 3, z: GATE.z + 3 }
      : entryPoint(reception);
    releaseSeat(sim, agent);
    agent.intent = "idle";
    agent.destination = reception ? "Recepção / portão" : "Portão";
    agent.activity = phase === "arrival" ? "Orientando a entrada" : "Atendendo a comunidade";
    planOf(sim, agent, point);
    return;
  }
  void member;
  goChill(sim, agent);
}

export function assignTarget(sim: Sim, agent: Agent) {
  if (agent.taskId) { agent.waitTimer = 2; return; } // funcionário delegado: o gabinete controla
  agent.waitTimer = 0;
  if (agent.role === "student") chooseStudentTarget(sim, agent);
  else staffTarget(sim, agent);
}

function arrive(sim: Sim, agent: Agent) {
  const phase = phaseFor(sim.world.minutes);
  agent.stuckTimer = 0;
  agent.waitReason = "";
  onAgentArrive(sim, agent);
  if (!sim.world.agents.includes(agent)) return;
  if (agent.intent === "leave") {
    if (agent.role === "student") {
      agent.visible = false;
      agent.active = false;
      agent.leaving = false;
      agent.intent = "idle";
      agent.activity = "Em casa";
      return;
    }
    agent.active = phase !== "exit" && phase !== "empty" ? agent.active : false;
    if (phase === "exit" || phase === "empty") {
      agent.active = false;
      agent.visible = false;
    }
    agent.leaving = false;
    if (!agent.active) return;
  }
  const seat = seatById(sim, agent.seatKey);
  if (seat) {
    agent.x = seat.x;
    agent.z = seat.z;
    agent.heading = seat.rot;
    agent.state = seat.activity;
    const kind = seat.kind;
    if (kind === "classroom") {
      agent.activity = "Em aula";
      agent.waitTimer = 40 + hashString(agent.id) * 30;
      agent.needs.learning = clamp(agent.needs.learning + 6);
    } else if (kind === "canteen") {
      if (!agent.carrying) serveMeal(sim, agent);
      agent.state = "eat";
      agent.activity = "Almoçando";
      agent.waitTimer = 10 + hashString(agent.id) * 6;
      agent.needs.fun = clamp(agent.needs.fun + 4);
    } else if (kind === "library") {
      agent.state = "read";
      agent.activity = "Lendo na biblioteca";
      agent.waitTimer = 35 + hashString(agent.id) * 25;
      agent.needs.learning = clamp(agent.needs.learning + 4);
      sim.world.daily.readingPeak = Math.max(sim.world.daily.readingPeak, sim.seats.filter((s) => s.kind === "library" && sim.claims.has(s.key)).length);
    } else if (kind === "court") {
      agent.state = seat.activity === "play" ? "play" : "sit";
      agent.activity = seat.activity === "play" ? "Jogando na quadra" : "Assistindo ao jogo";
      agent.waitTimer = 30 + hashString(agent.id) * 30;
      agent.needs.fun = clamp(agent.needs.fun + 10);
      agent.needs.social = clamp(agent.needs.social + 6);
    } else {
      agent.state = seat.activity;
      agent.activity =
        seat.activity === "read"
          ? "Lendo"
          : seat.activity === "write"
            ? "Estudando"
            : seat.activity === "eat"
              ? "Comendo"
              : "Conversando";
      agent.waitTimer = 25 + hashString(agent.id) * 30;
      agent.needs.fun = clamp(agent.needs.fun + 3);
      agent.needs.social = clamp(agent.needs.social + 3);
    }
    if (seat.kind === "classroom") {
      sim.world.daily.studentsInClassPeak = Math.max(
        sim.world.daily.studentsInClassPeak,
        sim.seats.filter((s) => s.kind === "classroom" && sim.claims.has(s.key)).length,
      );
    }
    return;
  }
  if (agent.intent === "queue") {
    agent.state = "queue";
    agent.activity = "Aguardando na fila";
    agent.waitTimer = 0;
    return;
  }
  if (agent.intent === "clean") {
    agent.state = "clean";
    agent.activity = "Limpando o ambiente";
    agent.waitTimer = 12 + hashString(agent.id) * 10;
    return;
  }
  if (agent.intent === "fix") {
    agent.state = "fix";
    agent.activity = "Consertando equipamentos";
    agent.waitTimer = 12 + hashString(agent.id) * 10;
    return;
  }
  if (agent.intent === "teach") {
    const room = sim.world.buildings.find((b) => b.id === agent.buildingId);
    if (room) {
      const face = rotateLocal(0, 1, room.rot);
      agent.heading = Math.atan2(face.x, face.z);
    }
    agent.state = "teach";
    agent.activity = "Ensinando a turma";
    agent.waitTimer = 35;
    return;
  }
  if (agent.intent === "canteen") {
    agent.state = "idle";
    agent.activity = "Servindo no balcão";
    agent.waitTimer = 25;
    return;
  }
  agent.state = "idle";
  agent.activity = agent.destination ? `Em ${agent.destination}` : "Observando a escola";
  agent.waitTimer = 20 + hashString(agent.id) * 20;
}

function serveMeal(sim: Sim, agent: Agent) {
  const world = sim.world;
  const usesCompost = world.improvements.includes("compost");
  const waste = usesCompost ? 0.15 : 0.05;
  if (world.stock.food <= 0) {
    notify(sim, "bad", "Merenda em falta", "O estoque de alimentos acabou. Compre mantimentos no painel Estoque.", "no-food", 100);
    agent.needs.hunger = clamp(agent.needs.hunger - 8);
    return;
  }
  world.stock.food = Math.max(0, world.stock.food - (1 + waste));
  world.daily.servedMeals += 1;
  world.stats.mealsToday += 1;
  addLedger(sim, 7, "Cantina", "Refeição servida", "cantina");
  agent.carrying = true;
  agent.needs.hunger = clamp(agent.needs.hunger - 45);
  agent.needs.energy = clamp(agent.needs.energy + 12);
  agent.needs.social = clamp(agent.needs.social + 4);
}

function updateQueue(sim: Sim, dtMinutes: number) {
  const world = sim.world;
  const phase = phaseFor(world.minutes);
  const released: Agent[] = [];
  sim.queue = sim.queue.filter((id) => {
    const a = world.agents.find((x) => x.id === id);
    if (!a || !a.active || a.seatKey) return false;
    const tooLong = a.waitTimer < (dir(world).queueByClassUntil > absMinutes(world) ? -80 : -40);
    if (tooLong || (phase !== "lunch" && phase !== "break")) {
      released.push(a);
      return false;
    }
    return true;
  });
  for (const agent of released) {
    if (!agent.seatKey) {
      agent.intent = "idle";
      agent.queueSlot = -1;
      agent.waitTimer = 0;
      assignTarget(sim, agent);
    }
  }
  for (const id of sim.queue) {
    const agent = world.agents.find((a) => a.id === id);
    if (agent) agent.waitTimer = Math.min(0, agent.waitTimer) - dtMinutes;
  }
  // Atendimento real: cada balcão serve uma pessoa a cada 1,3 min; sem merenda o ritmo cai ou para.
  const counters = canteenCounters(world);
  const foodFactor = world.stock.food <= 0 ? 0 : world.stock.food < 15 ? 0.35 : 1;
  const holder = sim as Sim & { serviceTokens?: number };
  const helped = dir(world).queueHelpUntil > absMinutes(world) ? 1.4 : 1;
  holder.serviceTokens = Math.min(counters, (holder.serviceTokens ?? 0) + (dtMinutes * counters * foodFactor * helped) / 1.3);
  let guard = 0;
  while (sim.queue.length > 0 && canteenSeatAvailable(sim) && guard < 6 && (holder.serviceTokens ?? 0) >= 1) {
    guard += 1;
    holder.serviceTokens = (holder.serviceTokens ?? 0) - 1;
    const agentId = sim.queue.shift();
    if (!agentId) break;
    const agent = world.agents.find((a) => a.id === agentId);
    if (!agent || !agent.active) continue;
    const seat = freeSeat(sim, ["canteen"], agent);
    if (!seat) {
      if (agent.wheelchair && canteenSeatAvailable(sim)) {
        // sem lugar acessível: não trava a fila dos demais
        holder.serviceTokens = (holder.serviceTokens ?? 0) + 1;
        agent.queueSlot = -1;
        agent.intent = "idle";
        agent.waitReason = "sem-rota";
        notify(sim, "warn", "Cantina sem acesso", `${agent.name} não encontrou lugar acessível. Instale a rota acessível na cantina (Melhorias).`, "canteen-access", 120);
        goChill(sim, agent);
        continue;
      }
      sim.queue.unshift(agentId);
      break;
    }
    agent.queueSlot = -1;
    takeSeat(sim, agent, seat, "eat");
  }
  sim.queue.forEach((id, index) => {
    const agent = world.agents.find((a) => a.id === id);
    if (!agent) return;
    agent.queueSlot = index;
    const target = queuePoint(sim, index);
    const dx = target.x - agent.x;
    const dz = target.z - agent.z;
    if (Math.hypot(dx, dz) > 1.1 && agent.path.length === 0) {
      planOf(sim, agent, target);
    }
    agent.state = "queue";
    agent.activity = `Fila da cantina (${index + 1}º)`;
  });
  world.stats.queue = sim.queue.length;
  world.daily.queuePeak = Math.max(world.daily.queuePeak, sim.queue.length);
}

function stepMovement(sim: Sim, agent: Agent, dtSeconds: number) {
  if (!agent.active || !agent.visible) return;
  const homeward = agent.role === "student" && agent.intent === "leave";
  const grid = movementGrid(sim, agent);
  if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
    const target = agent.path[agent.pathIndex];
    const dx = target.x - agent.x;
    const dz = target.z - agent.z;
    const distance = Math.hypot(dx, dz);
    const step = agent.speed * WALK_SCALE * dtSeconds;
    const nextZ = distance <= Math.max(0.22, step) ? target.z : agent.z + dz * step / distance;
    if (waitAtCurb(sim.traffic, agent.x, agent.z, nextZ)) {
      agent.state = "idle";
      agent.stuckTimer = 0;
      agent.waitReason = "carro";
      return;
    }
    agent.waitReason = "";
    if (agent.state === "idle") agent.state = "walk";
    if (distance <= Math.max(0.22, step)) {
      agent.x = target.x;
      agent.z = target.z;
      agent.pathIndex += 1;
      if (agent.pathIndex >= agent.path.length) {
        agent.path = [];
        arrive(sim, agent);
      }
    } else {
      const nx = agent.x + (dx / distance) * step;
      const nz = agent.z + (dz / distance) * step;
      if (walkableAt(grid, nx, nz, agent.wheelchair) || !walkableAt(grid, agent.x, agent.z, agent.wheelchair)) {
        agent.x = nx;
        agent.z = nz;
        agent.stuckTimer = 0;
      } else {
        agent.stuckTimer += dtSeconds;
        agent.waitReason = "parede";
        // try to slide around the obstacle
        const sideX = nx + (dz / distance) * step;
        const sideZ = nz - (dx / distance) * step;
        if (walkableAt(grid, sideX, sideZ, agent.wheelchair)) {
          agent.x = sideX;
          agent.z = sideZ;
        }
      }
      const desired = Math.atan2(dx, dz);
      let delta = desired - agent.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      agent.heading += delta * Math.min(1, dtSeconds * 10);
    }
    if (agent.stuckTimer > 3.5) {
      if (homeward) {
        goLeave(sim, agent);
        return;
      }
      releaseSeat(sim, agent);
      agent.path = [];
      agent.pathIndex = 0;
      agent.stuckTimer = 0;
      agent.buildingId = null;
      agent.intent = "idle";
      agent.state = "idle";
      agent.leaving = false;
      agent.activity = "Aguardando passagem";
      agent.waitTimer = 3 + hashString(agent.id) * 3;
      return;
    }
  }
  // A seated character stays at the furniture anchor while walkers pass.
  if (!agent.active || (agent.seatKey && agent.path.length === 0)) return;
  // light separation so characters do not merge
  let pushX = 0;
  let pushZ = 0;
  const nextPoint = agent.path[agent.pathIndex];
  const nearDoor = !!nextPoint && Math.hypot(nextPoint.x - agent.x, nextPoint.z - agent.z) < 1.4 &&
    (Math.abs(agent.z - GATE.z) < 2.5 || !walkableAt(grid, agent.x + 0.7, agent.z) || !walkableAt(grid, agent.x - 0.7, agent.z));
  for (const other of sim.world.agents) {
    if (other.id === agent.id || !other.visible) continue;
    if (other.seatKey && other.path.length === 0) continue; // colegas sentados não empurram quem passa
    if (nearDoor) continue; // em portas e no portão a passagem é em sequência, sem empurrões contra o batente
    const ox = agent.x - other.x;
    const oz = agent.z - other.z;
    const d2 = ox * ox + oz * oz;
    if (d2 > 0.0001 && d2 < 0.55 * 0.55) {
      const d = Math.sqrt(d2);
      pushX += (ox / d) * (0.55 - d) * 0.4;
      pushZ += (oz / d) * (0.55 - d) * 0.4;
    }
  }
  if (pushX !== 0 || pushZ !== 0) {
    const nx = agent.x + pushX * dtSeconds * 6;
    const nz = agent.z + pushZ * dtSeconds * 6;
    if (!waitAtCurb(sim.traffic, agent.x, agent.z, nz) && walkableAt(grid, nx, nz, agent.wheelchair)) {
      agent.x = nx;
      agent.z = nz;
    }
  }
}

function updateNeeds(sim: Sim, agent: Agent, dtMinutes: number) {
  const world = sim.world;
  const rain = world.weather === "rain";
  const inside = world.buildings.some((b) => {
    if (b.progress < 1 || !isWalled(b)) return false;
    const fp = footprintOf(b);
    return agent.x > fp.minX && agent.x < fp.maxX && agent.z > fp.minZ && agent.z < fp.maxZ;
  });
  const sheltered = inside || world.improvements.includes("trees");
  agent.needs.hunger = clamp(agent.needs.hunger + dtMinutes * 0.28);
  agent.needs.energy = clamp(agent.needs.energy - dtMinutes * (agent.state === "play" ? 0.14 : 0.06));
  agent.needs.hygiene = clamp(agent.needs.hygiene - dtMinutes * 0.04);
  agent.needs.social = clamp(agent.needs.social - dtMinutes * 0.05);
  agent.needs.fun = clamp(agent.needs.fun - dtMinutes * 0.07);
  agent.needs.comfort = clamp(agent.needs.comfort - dtMinutes * (rain && !sheltered ? 0.22 : 0.03));
  agent.needs.learning = clamp(agent.needs.learning - dtMinutes * (phaseFor(world.minutes) === "class" && agent.state === "write" ? 0 : 0.03));
  if (agent.state === "eat") {
    agent.needs.hunger = clamp(agent.needs.hunger - dtMinutes * 0.5);
    agent.needs.energy = clamp(agent.needs.energy + dtMinutes * 0.05);
  }
  if (agent.state === "read") agent.needs.learning = clamp(agent.needs.learning + dtMinutes * 0.09);
  if (agent.state === "write") agent.needs.learning = clamp(agent.needs.learning + dtMinutes * 0.05);
  if (agent.state === "play") {
    agent.needs.fun = clamp(agent.needs.fun + dtMinutes * 0.15);
    agent.needs.social = clamp(agent.needs.social + dtMinutes * 0.1);
  }
  if (agent.state === "clean" || agent.state === "fix") agent.needs.energy = clamp(agent.needs.energy - dtMinutes * 0.05);
  if (agent.role === "student" && phaseFor(world.minutes) === "class" && agent.state !== "write") {
    agent.needs.learning = clamp(agent.needs.learning - dtMinutes * 0.12);
  }
  if (agent.wheelchair && !inside && rain) agent.needs.comfort = clamp(agent.needs.comfort - dtMinutes * 0.2);
  const n = agent.needs;
  agent.mood = clamp(
    0.24 * n.fun + 0.2 * n.comfort + 0.14 * n.social + 0.16 * n.energy + 0.12 * (100 - n.hunger) + 0.14 * n.learning,
  );
}

function constructionTick(sim: Sim, dtMinutes: number) {
  const world = sim.world;
  let completed = false;
  for (const building of world.buildings) {
    if (building.progress >= 1) continue;
    const spec = BUILDABLE_BY_KIND[building.kind];
    const crew = world.agents.filter(
      (a) => a.visible && a.buildingId === building.id && (a.intent === "fix" || a.intent === "idle" || a.role === "maintenance"),
    ).length;
    const totalMinutes = Math.max(6, spec.hours * BUILD_DURATION_MINUTES_PER_HOUR);
    const ratePerMinute = (1 / totalMinutes) * (0.75 + crew * 0.35);
    building.progress = Math.min(1, building.progress + ratePerMinute * dtMinutes);
    if (building.completeAt === 0) building.completeAt = absMinutes(world) + Math.ceil((1 - building.progress) / ratePerMinute);
    if (building.progress >= 1) {
      completed = true;
      building.progress = 1;
      building.completeAt = 0;
      notify(sim, "good", `${spec.name} inaugurada`, `A obra terminou. A escola já pode usar o novo ambiente.`, `open-${building.id}`, 30);
      moment(world, `Inauguração: ${spec.name}`, "O novo ambiente já está aberto para a escola.", building.x, building.z);
      world.reputation = clamp(world.reputation + 1.5);
    }
  }
  if (completed) rebuildWorldModel(sim);
}

function cleaningTick(sim: Sim, dtMinutes: number) {
  const world = sim.world;
  for (const agent of world.agents) {
    if (!agent.active) continue;
    if (agent.state === "clean" && agent.buildingId) {
      const b = world.buildings.find((x) => x.id === agent.buildingId);
      if (b) {
        b.dirt = clamp(b.dirt - dtMinutes * 2.4);
        if (world.stock.cleaning > 0) world.stock.cleaning = Math.max(0, world.stock.cleaning - dtMinutes * 0.012);
      }
    }
    if (agent.state === "fix" && agent.buildingId) {
      const b = world.buildings.find((x) => x.id === agent.buildingId);
      if (b && world.stock.materials > 0) {
        b.condition = clamp(b.condition + dtMinutes * 0.9);
        world.stock.materials = Math.max(0, world.stock.materials - dtMinutes * 0.008);
      }
    }
  }
  const phase = phaseFor(world.minutes);
  const occupancy = new Map<string, number>();
  for (const agent of world.agents) {
    if (!agent.active || !agent.buildingId) continue;
    occupancy.set(agent.buildingId, (occupancy.get(agent.buildingId) ?? 0) + 1);
  }
  for (const b of world.buildings) {
    if (b.progress < 1) continue;
    const users = occupancy.get(b.id) ?? 0;
    if (b.kind !== "path" && b.kind !== "tactile") {
      b.dirt = clamp(b.dirt + dtMinutes * (0.008 * users + 0.004) * (world.weather === "rain" ? 1.3 : 1));
      b.condition = clamp(b.condition - dtMinutes * 0.0016 * (1 + users * 0.25));
      if (b.condition < 42) {
        notify(
          sim,
          "warn",
          "Equipamento quebrado",
          `${BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind} está com conservação baixa. Contrate manutenção.`,
          `broken-${b.id}`,
          240,
        );
      }
    }
  }
  void phase;
}

function recomputeStats(sim: Sim) {
  const world = sim.world;
  const walled = activeWalledBuildings(world).filter((b) => b.progress >= 1);
  const seats = sim.seats;
  const classSeats = seats.filter((s) => ["classroom", "lab", "computer", "arts", "makerspace"].includes(s.kind));
  const usedSeats = seats.filter((s) => sim.claims.has(s.key)).length;
  const classUsed = classSeats.filter((s) => sim.claims.has(s.key)).length;
  const teachers = world.agents.filter((a) => a.role === "teacher" && a.visible).length;
  const facilityLearning = walled.reduce((sum, b) => sum + (BUILDABLE_BY_KIND[b.kind]?.bonus.learning ?? 0), 0);
  const avgDirt = walled.length ? walled.reduce((s, b) => s + b.dirt, 0) / walled.length : 0;
  const avgCondition = walled.length ? walled.reduce((s, b) => s + b.condition, 0) / walled.length : 100;
  const accessibleCount = walled.filter((b) => b.accessible).length;
  const students = world.agents.filter((a) => a.role === "student" && a.visible);
  const avgMood = students.length ? students.reduce((s, a) => s + a.mood, 0) / students.length : world.stats.satisfaction;
  const avgFun = students.length ? students.reduce((s, a) => s + a.needs.fun, 0) / students.length : world.stats.fun;
  const avgComfort = students.length ? students.reduce((s, a) => s + a.needs.comfort, 0) / students.length : world.stats.comfort;
  const avgSocial = students.length ? students.reduce((s, a) => s + a.needs.social, 0) / students.length : world.stats.social;
  const crowdPenalty = Math.max(0, classUsed - classSeats.length * 0.85) * 2;
  const staffPenalty = Math.max(0, 2 - teachers) * 8;
  const brokenPenalty = walled.filter((b) => b.condition < 42).length * 4;

  world.stats.seatsTotal = seats.length;
  world.stats.seatsUsed = usedSeats;
  world.stats.occupancy = classSeats.length ? Math.round((classUsed / classSeats.length) * 100) : 0;
  world.stats.learning = Math.round(
    clamp(22 + (classSeats.length ? (classUsed / classSeats.length) * 34 : 0) + Math.min(18, facilityLearning * 0.5) + teachers * 5 - staffPenalty - brokenPenalty - crowdPenalty),
  );
  world.stats.cleanliness = Math.round(clamp(100 - avgDirt * 1.15 - (world.stock.cleaning <= 0 ? 20 : 0)));
  world.stats.comfort = Math.round(
    clamp(avgComfort + (world.improvements.includes("trees") ? 6 : 0) + (world.buildings.some((b) => b.kind === "garden" && b.progress >= 1) ? 4 : 0) - (world.weather === "rain" ? 4 : 0)),
  );
  world.stats.satisfaction = Math.round(clamp(avgMood));
  world.stats.fun = Math.round(clamp(avgFun));
  world.stats.social = Math.round(clamp(avgSocial));
  world.stats.accessibility = walled.length ? Math.round((accessibleCount / walled.length) * 100) : 100;
  world.stats.energy = Math.round(clamp(avgCondition));
  world.stats.water = Math.round(clamp(100 - (world.weather === "rain" ? 0 : 8) - (world.improvements.includes("rain") ? 0 : 0)));
  world.stats.mealsToday = world.daily.servedMeals;
  world.stats.attendance = world.enrolled ? Math.round((students.length / world.enrolled) * 100) : 0;
  sim.lastStatsAt = absMinutes(world);
}

function evaluateMissions(sim: Sim) {
  const world = sim.world;
  const walled = activeWalledBuildings(world);
  const accessibleCount = walled.filter((b) => b.accessible).length;
  const values: Record<string, { value: number; ready: boolean }> = {
    "first-class": {
      value: Math.max(world.daily.studentsInClassPeak, world.missions.find((m) => m.id === "first-class")?.progress ?? 0),
      ready: world.daily.studentsInClassPeak >= 10,
    },
    "canteen-flow": {
      value: Math.max(world.daily.servedMeals, world.missions.find((m) => m.id === "canteen-flow")?.progress ?? 0),
      ready: world.daily.servedMeals >= 10 && world.daily.queuePeak <= 3,
    },
    "library-open": {
      value: Math.max(world.daily.readingPeak, world.missions.find((m) => m.id === "library-open")?.progress ?? 0),
      ready: world.daily.readingPeak >= 4,
    },
    "access-all": {
      value: accessibleCount,
      ready: walled.length > 0 && walled.every((b) => b.accessible) && accessibleCount >= 4,
    },
    "budget-health": {
      value: Math.max(0, world.budget),
      ready: world.budget >= 12000 && world.daily.payrollPaid,
    },
    "event-master": {
      value: Math.max(world.daily.eventAttendance, world.missions.find((m) => m.id === "event-master")?.progress ?? 0),
      ready: world.daily.eventAttendance >= 18,
    },
    enrolment: {
      value: Math.min(world.enrolled, totalSeats(world)),
      ready: world.enrolled >= 20 && totalSeats(world) >= world.enrolled,
    },
    "green-school": {
      value: world.improvements.filter((i) => ["solar", "led", "bins"].includes(i)).length,
      ready: ["solar", "led", "bins"].every((i) => world.improvements.includes(i)),
    },
    "director-round": { value: world.player.visits.length, ready: world.player.visits.length >= 3 },
    "reference-school": {
      value: Math.round(world.reputation),
      ready: world.reputation >= 75 && world.stats.learning >= 60 && world.stats.comfort >= 60 && world.stats.cleanliness >= 60,
    },
  };
  for (const mission of world.missions) {
    const def = MISSION_DEFS.find((d) => d.id === mission.id);
    if (!def || mission.claimed) continue;
    const evaluated = values[mission.id];
    if (!evaluated) continue;
    mission.target = def.target;
    mission.progress = Math.max(mission.progress, Math.round(evaluated.value));
    if (evaluated.ready && !mission.completed) {
      mission.completed = true;
      notify(sim, "good", `Missão concluída: ${def.title}`, `Recompensa disponível: ${formatMoney(def.reward)} e +${def.reputation} reputação. Abra Missões para resgatar.`, `mission-${def.id}`, 10);
    }
  }
}

function eventsTick(sim: Sim, dtMinutes: number) {
  const world = sim.world;
  const now = absMinutes(world);
  for (const event of world.events) {
    if (event.status === "preparing" && now >= event.startsAt) {
      event.status = "running";
      if (now >= event.endsAt) event.endsAt = now + 120;
      notify(sim, "info", `${event.name} começou`, "As barracas e a decoração estão no pátio. Os alunos estão se dirigindo ao evento.", `event-start-${event.id}`, 5);
    }
    if (event.status === "running") {
      if (event.endsAt > 0 && now >= event.endsAt) {
        event.status = "done";
        if (event.id.startsWith("cp-")) { event.result = "Competição encerrada — veja o resultado no gabinete"; continue; }
        const participants = world.agents.filter((a) => a.visible && a.role === "student" && (a.intent === "play" || a.intent === "eat" || a.intent === "idle")).length;
        event.attendance = Math.max(participants, world.daily.eventAttendance);
        world.daily.eventAttendance = Math.max(world.daily.eventAttendance, event.attendance);
        const good = event.attendance >= 12 && world.stats.cleanliness >= 45;
        event.result = good ? "Evento elogiado pela comunidade" : "Evento morno: faltou público ou estrutura";
        world.reputation = clamp(world.reputation + (good ? 6 : 1));
        addLedger(sim, good ? 900 : 240, "Evento", event.result, "evento");
        notify(
          sim,
          good ? "good" : "warn",
          `${event.name} terminou`,
          `${event.result}. Participantes: ${event.attendance}.`,
          `event-end-${event.id}`,
          5,
        );
        rebuildWorldModel(sim);
      }
    }
  }
  void dtMinutes;
}

function weatherForDay(seed: number): Weather {
  const rand = mulberry32(seed * 7919)();
  if (rand < 0.58) return "sun";
  if (rand < 0.84) return "cloud";
  return "rain";
}

function dailyTick(sim: Sim) {
  const world = sim.world;
  const preset = MODES[world.mode];
  if (world.minutes >= 420 && !world.daily.fundingPaid) {
    world.daily.fundingPaid = true;
    addLedger(sim, preset.grant, "Verba pública", `Repasse do dia ${world.day}`, "verba");
    world.reputation = clamp(world.reputation + 0.2);
  }
  if (world.minutes >= 430 && !world.daily.payrollPaid) {
    world.daily.payrollPaid = true;
    const payroll = world.staff.reduce((sum, m) => sum + m.salary, 0);
    if (world.budget >= payroll) {
      addLedger(sim, -payroll, "Folha de pagamento", `${world.staff.length} profissionais`, "salario");
    } else {
      notify(sim, "bad", "Salários atrasados", "O caixa não cobriu a folha. A reputação e a satisfação caem até você equilibrar as contas.", "payroll-late", 30);
      world.reputation = clamp(world.reputation - 4);
      world.staff.forEach((m) => {
        m.rest = clamp(m.rest - 10);
      });
    }
  }
  if (world.minutes >= 1075 && !world.daily.utilitiesPaid) {
    world.daily.utilitiesPaid = true;
    const walled = activeWalledBuildings(world).filter((b) => b.progress >= 1).length;
    const energyCost = Math.round(walled * 38 * (world.improvements.includes("solar") ? 0.72 : 1) * (world.improvements.includes("led") ? 0.88 : 1));
    const waterCost = Math.round(walled * 22 * (world.improvements.includes("rain") ? 0.78 : 1));
    addLedger(sim, -(energyCost + waterCost), "Utilidades", `${walled} prédios · energia ${formatMoney(energyCost)} · água ${formatMoney(waterCost)}`, "utilidades");
  }
  if (world.stock.autoReorder && world.minutes >= 480 && Math.floor(world.minutes) % 90 === 0) {
    const shortages: (keyof typeof world.stock.min)[] = [];
    let cost = 0;
    (Object.keys(world.stock.min) as (keyof typeof world.stock.min)[]).forEach((key) => {
      if (world.stock[key] < world.stock.min[key]) {
        const qty = world.stock.min[key] * 3;
        const price = key === "food" ? 4 : key === "materials" ? 6 : key === "cleaning" ? 3 : 2;
        cost += qty * price;
        shortages.push(key);
      }
    });
    if (cost > 0 && world.budget >= cost) {
      for (const key of shortages) world.stock[key] += world.stock.min[key] * 3;
      addLedger(sim, -cost, "Reposição automática", `Reposto: ${shortages.join(", ")}`, "estoque");
    } else if (cost > 0) {
      notify(sim, "warn", "Reposição não realizada", "Sem saldo para repor estoque. Desative a reposição automática ou aguarde a verba.", "restock", 120);
    }
  }
  if (world.minutes >= 1140) {
    chargeUpkeep(sim);
    const totals = finances(world);
    world.pendingDayReport = {
      ...totals, budget: world.budget, enrolled: world.enrolled,
      meals: world.daily.servedMeals, queuePeak: world.daily.queuePeak,
      reputation: Math.round(world.reputation),
      progress: progressDayEnd(sim, totals),
      director: directorDayEnd(sim, totals),
    };
    // virada do dia: todos em casa, lugares e fila liberados
    for (const a of world.agents) {
      if (a.role !== "student") continue;
      a.active = false; a.visible = false; a.leaving = false; a.intent = "idle";
      a.path = []; a.pathIndex = 0; a.seatKey = null; a.queueSlot = -1; a.waitReason = "";
    }
    world.agents = world.agents.filter((a) => a.status !== "expulso");
    sim.claims.clear();
    sim.queue = [];
    world.day += 1;
    world.minutes = 390;
    world.weather = weatherForDay(world.day + world.rngSeed);
    world.daily = {
      fundingPaid: false,
      payrollPaid: false,
      utilitiesPaid: false,
      servedMeals: 0,
      queuePeak: 0,
      studentsInClassPeak: 0,
      readingPeak: 0,
      eventAttendance: 0,
    };
    world.player.visits = [];
    directorDayStart(sim);
    syncAgents(world);
    progressAfterSync(sim);
    publishReport();
    notify(sim, "info", `Dia ${world.day} começou`, `Clima: ${world.weather === "sun" ? "sol" : world.weather === "cloud" ? "nublado" : "chuva"}. Turmas chegam às 7h.`, `day-${world.day}`, 5);
  }
}

function playerVisitTick(sim: Sim) {
  const world = sim.world;
  const phase = phaseFor(world.minutes);
  const near = (x: number, z: number, radius = 5) => Math.hypot(world.player.x - x, world.player.z - z) < radius;
  const addVisit = (key: string) => {
    if (!world.player.visits.includes(key)) {
      world.player.visits.push(key);
      notify(sim, "good", "Ponto inspecionado", `Você inspecionou ${key}. Ronda do diretor: ${world.player.visits.length}/3.`, `visit-${key}`, 5);
    }
  };
  const canteen = world.buildings.find((b) => b.kind === "canteen");
  if (canteen && near(canteen.x, canteen.z, 8)) addVisit("Cantina");
  const library = world.buildings.find((b) => b.kind === "library" && b.progress >= 1);
  if (library && near(library.x, library.z, 7)) addVisit("Biblioteca");
  const site = world.buildings.find((b) => b.progress < 1);
  if (site && near(site.x, site.z, 7)) addVisit("Obra");
  void phase;
}

function tutorialTick(sim: Sim) {
  const world = sim.world;
  const steps = [
    world.buildings.some((b) => b.kind === "classroom" && b.progress >= 1),
    totalSeats(world) >= 10,
    world.daily.studentsInClassPeak >= 6,
    world.agents.some((a) => a.role === "custodian" || a.role === "maintenance"),
    activeWalledBuildings(world).some((b) => b.accessible),
    world.stats.cleanliness >= 70,
    world.events.length > 0,
    world.missions.some((m) => m.completed),
  ];
  let step = 0;
  for (let i = 0; i < steps.length; i += 1) if (steps[i]) step = i + 1;
  world.tutorialStep = Math.max(world.tutorialStep, step);
}

export function tickSim(dtSecondsRaw: number) {
  const sim = activeSim;
  if (!sim || sim.world.pendingDayReport) return;
  const dtSeconds = Math.min(0.25, Math.max(0, dtSecondsRaw));
  const dtMinutes = dtSeconds * MINUTES_PER_SECOND;
  const world = sim.world;
  world.minutes += dtMinutes;
  const phase = phaseFor(world.minutes);

  advanceTraffic(sim.traffic, world.agents, dtSeconds);
  for (const agent of world.agents) {
    if (agent.role === "student") {
      const arriveAt = 420 + Math.floor(hashString(agent.id + world.day) * 24);
      if (!agent.active && phase !== "empty" && phase !== "exit" && world.minutes >= arriveAt && !studentAway(world, agent)) {
        agent.active = true;
        agent.visible = true;
        agent.leaving = false;
        agent.intent = "arrive";
        // posições caminháveis distintas na calçada: o grupo não nasce sobre o mesmo ponto
        const slot = Math.floor(hashString(agent.id) * 24);
        const dep = departureGrid(sim.grid);
        let sx = ENTRY_SPAWN.x - 3 + (slot % 8) * 0.85;
        let sz = ENTRY_SPAWN.z - 0.6 + Math.floor(slot / 8) * 0.7;
        if (!walkableAt(dep, sx, sz, agent.wheelchair)) {
          const cell = nearestWalkable(dep, sx, sz, agent.wheelchair) ?? nearestWalkable(dep, ENTRY_SPAWN.x, ENTRY_SPAWN.z);
          if (cell) { sx = dep.minX + cell.i + 0.5 + (hashString(agent.id + "j") - 0.5) * 0.4; sz = dep.minZ + cell.j + 0.5 + (hashString(agent.id + "k") - 0.5) * 0.4; }
        }
        agent.x = sx;
        agent.z = sz;
        agent.heading = Math.PI;
        agent.needs.energy = clamp(agent.needs.energy + 20);
        agent.waitTimer = 0;
        agent.path = [];
        assignTarget(sim, agent);
      }
    } else if (agent.id.startsWith("crew-")) {
      if (!agent.active && phase !== "empty" && world.minutes < 1020 && agent.absentDay !== world.day) {
        agent.active = true;
        agent.visible = true;
        agent.x = GATE.x + (hashString(agent.id) - 0.5) * 2;
        agent.z = GATE.z + 3;
        assignTarget(sim, agent);
      }
      if (agent.active && world.minutes >= 1020 && agent.intent !== "leave" && agent.path.length === 0) {
        staffTarget(sim, agent);
      }
    }
    if (!agent.active) continue;
    if (agent.role === "student" && (phase === "exit" || phase === "empty" || agent.leaving)) {
      if (agent.intent !== "leave" || !agent.path.length) {
        if (agent.intent === "leave") agent.waitTimer -= dtMinutes;
        if (agent.intent !== "leave" || agent.waitTimer <= 0) goLeave(sim, agent);
      }
      stepMovement(sim, agent, dtSeconds);
      updateNeeds(sim, agent, dtMinutes);
      continue;
    }
    if (agent.waitTimer > 0) {
      agent.waitTimer -= dtMinutes;
      if (agent.waitTimer <= 0) {
        if (world.weather === "rain" && !agent.seatKey && agent.intent !== "clean" && agent.intent !== "fix") {
          goChill(sim, agent);
        }
        assignTarget(sim, agent);
      }
    } else if (agent.path.length === 0 && agent.intent !== "queue") {
      assignTarget(sim, agent);
    }
    stepMovement(sim, agent, dtSeconds);
    updateNeeds(sim, agent, dtMinutes);
  }

  updateQueue(sim, dtMinutes);
  constructionTick(sim, dtMinutes);
  cleaningTick(sim, dtMinutes);
  dailyTick(sim);
  playerVisitTick(sim);
  eventsTick(sim, dtMinutes);
  directorTick(sim, dtMinutes);
  // garantia de saída: quem ainda caminha para casa depois das 18h já chegou
  if (world.minutes > 1080) for (const a of world.agents) if (a.role === "student" && a.active && a.intent === "leave") { a.active = false; a.visible = false; a.leaving = false; a.intent = "idle"; a.path = []; if (a.status === "expulso") world.agents = world.agents.filter((x) => x !== a); }
  if (absMinutes(world) - sim.lastStatsAt > 8) {
    recomputeStats(sim);
    evaluateMissions(sim);
    tutorialTick(sim);
  }
  world.lastTickAt = Date.now();
  world.savedAt = world.savedAt || Date.now();
}

export function getSnapshot(): Snapshot {
  const sim = activeSim;
  if (!sim) throw new Error("simulação não inicializada");
  const world = sim.world;
  return {
    day: world.day,
    minutes: world.minutes,
    phase: phaseFor(world.minutes) as Snapshot["phase"],
    weather: world.weather,
    budget: Math.round(world.budget),
    reputation: Math.round(world.reputation),
    enrolled: world.enrolled,
    stats: { ...world.stats },
    daily: { ...world.daily },
    missions: world.missions.map((m) => ({ ...m })),
    events: world.events.map((e) => ({ ...e })),
    notifications: world.notifications.slice(0, 14).map((n) => ({ ...n })),
    stock: { ...world.stock, min: { ...world.stock.min } },
    ledger: world.ledger.slice(0, 24).map((l) => ({ ...l })),
    staff: world.staff.map((s) => ({ ...s })),
    buildings: world.buildings.map((b) => ({ ...b })),
    groups: world.groups.map((g) => ({ ...g })),
    schedule: world.schedule.map((s) => ({ ...s })),
    agents: world.agents
      .filter((a) => a.visible)
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        activity: a.activity,
        destination: a.destination,
        mood: Math.round(a.mood),
        needs: { ...a.needs },
        club: a.club,
        story: a.story,
        x: a.x,
        z: a.z,
      })),
    tutorialStep: world.tutorialStep,
    activeWorks: world.buildings.filter((b) => b.progress < 1).length,
    modes: world.mode,
  };
}

/* ------------------------------ player actions ----------------------------- */

export interface PlacementResult {
  ok: boolean;
  message: string;
  reason?: string;
  /** retângulos a destacar em vermelho na prévia (porta bloqueada, sobreposição) */
  zones?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  snap?: string;
}

/** Ajusta a posição para que as bordas caiam na grade de 1 m e encaixa nas bordas de prédios vizinhos (0,9 m). */
export function snapPlacement(sim: Sim, kind: BuildingKind, x: number, z: number, rot: number, ignoreId?: string): { x: number; z: number; snap: string | null } {
  const fp0 = footprintOf({ kind, x, z, rot });
  let minX = Math.round(fp0.minX);
  let minZ = Math.round(fp0.minZ);
  const w = fp0.w;
  const d = fp0.d;
  let snap: string | null = null;
  const R = 0.9;
  let bestX = R + 0.01;
  let bestZ = R + 0.01;
  let nx = minX;
  let nz = minZ;
  for (const b of sim.world.buildings) {
    if (b.id === ignoreId || b.kind === "path" || b.kind === "tactile") continue;
    const o = footprintOf(b);
    const ovZ = Math.min(minZ + d, o.maxZ) - Math.max(minZ, o.minZ);
    const ovX = Math.min(minX + w, o.maxX) - Math.max(minX, o.minX);
    if (ovZ > -0.5) {
      for (const cand of [o.maxX, o.minX - w]) {
        const dist = Math.abs(cand - fp0.minX);
        if (dist < bestX) { bestX = dist; nx = cand; snap = BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind; }
      }
      for (const cand of [o.minZ, o.maxZ - d]) {
        const dist = Math.abs(cand - fp0.minZ);
        if (dist < 0.6 && dist < bestZ && ovZ > 0.5) { bestZ = dist; nz = cand; }
      }
    }
    if (ovX > -0.5) {
      for (const cand of [o.maxZ, o.minZ - d]) {
        const dist = Math.abs(cand - fp0.minZ);
        if (dist < bestZ) { bestZ = dist; nz = cand; snap = BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind; }
      }
      for (const cand of [o.minX, o.maxX - w]) {
        const dist = Math.abs(cand - fp0.minX);
        if (dist < 0.6 && dist < bestX && ovX > 0.5) { bestX = dist; nx = cand; }
      }
    }
  }
  minX = nx;
  minZ = nz;
  return { x: minX + w / 2, z: minZ + d / 2, snap };
}

/** Mesma validação usada pela prévia e pela confirmação. */
export function validatePlacement(
  sim: Sim,
  kind: BuildingKind,
  x: number,
  z: number,
  rot: number,
  ignoreId?: string,
  opts: { ignoreBudget?: boolean; extra?: BuildingInstance[] } = {},
): PlacementResult {
  const spec = BUILDABLE_BY_KIND[kind];
  if (!spec) return { ok: false, message: "Instalação desconhecida" };
  const candidate: Pick<BuildingInstance, "kind" | "x" | "z" | "rot"> = { kind, x, z, rot };
  const fp = footprintOf(candidate);
  let outside = false;
  for (let px = fp.minX - 0.9; px <= fp.maxX + 0.9 && !outside; px += 0.5) {
    for (let pz = fp.minZ - 0.9; pz <= fp.maxZ + 0.9; pz += 0.5) {
      if (!ownedContains(Math.min(px, fp.maxX + 0.9), Math.min(pz, fp.maxZ + 0.9))) { outside = true; break; }
    }
  }
  if (outside) {
    return { ok: false, message: "Fora do terreno", reason: "Traga a marcação para dentro do muro. Girar pode ajudar a caber.", zones: [fp] };
  }
  const walkway = kind === "tactile" || kind === "path";
  const entrance: Rect = { minX: GATE.x - 2.6, maxX: GATE.x + 2.6, minZ: -22.5, maxZ: -13 };
  if (!walkway && rectOverlap(fp, entrance)) {
    return { ok: false, message: "Acesso do portão bloqueado", reason: "Deixe o corredor do portão livre. Desloque a obra para um dos lados.", zones: [entrance] };
  }
  const myDoor = isWalled(candidate) && !walkway ? doorZone(candidate) : null;
  for (const b of [...sim.world.buildings, ...(opts.extra ?? [])]) {
    if (b.id === ignoreId) continue;
    const ofp = footprintOf(b);
    const name = BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind;
    if (b.kind === "path" || b.kind === "tactile") {
      if (!walkway && myDoor === null && rectOverlap(fp, ofp)) continue;
      continue;
    }
    if (walkway) {
      if (rectOverlap(fp, ofp)) return { ok: false, message: "Caminho sobre um prédio", reason: "Caminhos ligam prédios; não podem atravessá-los.", zones: [ofp] };
      continue;
    }
    // colisão física: interiores não podem se sobrepor; paredes podem compartilhar a mesma linha
    if (rectOverlap(fp, ofp)) {
      return { ok: false, message: "Sobreposição com outra sala", reason: `Invade ${name}. Encoste as paredes: o encaixe automático alinha as bordas.`, zones: [ofp] };
    }
    if (myDoor && rectOverlap(myDoor, ofp)) {
      return { ok: false, message: "Porta bloqueada", reason: `A porta ficaria virada para ${name}. Gire a construção (R) ou desloque.`, zones: [myDoor] };
    }
    if (isWalled(b)) {
      const theirs = doorZone(b);
      if (rectOverlap(fp, theirs)) {
        return { ok: false, message: "Porta bloqueada", reason: `Fecharia a entrada de ${name}. Deixe 2 m livres em frente à porta.`, zones: [theirs] };
      }
    }
  }
  if (!ignoreId && !opts.ignoreBudget && sim.world.mode !== "creative" && sim.world.budget < spec.cost) {
    return { ok: false, message: "Verba insuficiente", reason: `Faltam ${formatMoney(spec.cost - sim.world.budget)} para construir ${spec.name}.` };
  }
  if (walkway) return { ok: true, message: "Pronto para construir" };
  const door = entryPoint(candidate);
  const testBuildings = ignoreId
    ? [...sim.world.buildings.map((b) => (b.id === ignoreId ? { ...b, x, z, rot } : b)), ...(opts.extra ?? [])]
    : [...sim.world.buildings, { ...candidate, id: "probe", progress: 1, startedAt: 0, completeAt: 0, condition: 100, dirt: 0, accessible: false } as BuildingInstance];
  const grid = buildNavGrid(testBuildings);
  const gateCell = nearestWalkable(grid, GATE.x, GATE.z + 1.5);
  const start = gateCell ? { x: gateCell.i + grid.minX + 0.5, z: gateCell.j + grid.minZ + 0.5 } : null;
  if (!start || !walkableAt(grid, door.x, door.z)) {
    return { ok: false, message: "Porta bloqueada", reason: "A porta precisa dar para uma área livre de pedestres.", zones: myDoor ? [myDoor] : [] };
  }
  if (!findPath(grid, start, door).reachable) {
    return { ok: false, message: "Sem rota até a porta", reason: "Gire a entrada ou abra passagem entre o portão e a porta.", zones: myDoor ? [myDoor] : [] };
  }
  // não pode isolar prédios existentes
  for (const b of sim.world.buildings) {
    if (b.id === ignoreId || b.kind === "path" || b.kind === "tactile") continue;
    const e = entryPoint(b);
    if (!findPath(grid, start, e, { maxExpanded: 9000 }).reachable) {
      return { ok: false, message: "Bloquearia um acesso", reason: `${BUILDABLE_BY_KIND[b.kind]?.name ?? b.kind} ficaria sem caminho a partir do portão.`, zones: [doorZone(b)] };
    }
  }
  return { ok: true, message: "Pronto para construir · rota verificada" };
}

export function placeBuilding(sim: Sim, kind: BuildingKind, x: number, z: number, rot: number): PlacementResult {
  const spec = BUILDABLE_BY_KIND[kind];
  const validation = validatePlacement(sim, kind, x, z, rot);
  if (!validation.ok) return validation;
  if (sim.world.mode !== "creative" && sim.world.budget < spec.cost) {
    return { ok: false, message: "Saldo insuficiente", reason: `Custo ${formatMoney(spec.cost)}. Saldo ${formatMoney(sim.world.budget)}.` };
  }
  const instant = sim.world.mode === "creative" || spec.hours === 0;
  const building: BuildingInstance = {
    id: `${kind}-${Date.now().toString(36)}-${Math.round(Math.random() * 999)}`,
    kind,
    x,
    z,
    rot: ((rot % 4) + 4) % 4,
    progress: instant ? 1 : 0.02,
    startedAt: absMinutes(sim.world),
    completeAt: instant ? 0 : absMinutes(sim.world) + spec.hours * BUILD_DURATION_MINUTES_PER_HOUR,
    condition: 96,
    dirt: 2,
    accessible: kind === "bathroom" || kind === "tactile",
  };
  sim.world.buildings.push(building);
  if (spec.cost > 0) addLedger(sim, -spec.cost, "Obra", `Início: ${spec.name}`, "obra");
  rebuildWorldModel(sim);
  notify(
    sim,
    "info",
    instant ? `${spec.name} pronta` : `Obra iniciada: ${spec.name}`,
    instant ? "A instalação já está disponível." : `Etapas: preparação → fundação → estrutura → paredes → cobertura → acabamento → móveis → abertura. ${spec.impact}`,
    `build-${building.id}`,
    5,
  );
  return { ok: true, message: instant ? "Instalação concluída" : "Obra iniciada" };
}

export function demolishBuilding(sim: Sim, id: string): PlacementResult {
  const building = sim.world.buildings.find((b) => b.id === id);
  if (!building) return { ok: false, message: "Construção não encontrada" };
  const spec = BUILDABLE_BY_KIND[building.kind];
  const refund = Math.round(spec.cost * 0.35 * building.progress);
  sim.world.buildings = sim.world.buildings.filter((b) => b.id !== id);
  if (refund > 0) addLedger(sim, refund, "Demolição", `Reaproveitamento de ${spec.name}`, "obra");
  sim.world.agents.forEach((agent) => {
    if (agent.buildingId === id) {
      releaseSeat(sim, agent);
      agent.buildingId = null;
      agent.seatKey = null;
      agent.path = [];
      agent.waitTimer = 0;
      agent.intent = "idle";
    }
  });
  sim.seats.filter((s) => s.buildingId === id).forEach((s) => sim.claims.delete(s.key));
  rebuildWorldModel(sim);
  notify(sim, "warn", `${spec.name} demolida`, `${formatMoney(refund)} reaproveitados. ${sim.world.agents.filter((a) => a.active).length} pessoas recalcularam suas rotas.`, `demolish-${id}`, 5);
  return { ok: true, message: "Construção demolida" };
}

export function moveBuilding(sim: Sim, id: string, x: number, z: number, rot: number): PlacementResult {
  const building = sim.world.buildings.find((b) => b.id === id);
  if (!building) return { ok: false, message: "Construção não encontrada" };
  const validation = validatePlacement(sim, building.kind, x, z, rot, id);
  if (!validation.ok) return validation;
  building.x = x;
  building.z = z;
  building.rot = ((rot % 4) + 4) % 4;
  sim.seats.filter((s) => s.buildingId === id).forEach((s) => sim.claims.delete(s.key));
  sim.world.agents.forEach((agent) => {
    if (agent.buildingId === id) {
      agent.seatKey = null;
      agent.path = [];
      agent.waitTimer = 0;
    }
  });
  rebuildWorldModel(sim);
  notify(sim, "info", "Prédio reposicionado", "Rotas e assentos foram recalculados.", `move-${id}`, 5);
  return { ok: true, message: "Prédio movido" };
}

export function buyImprovement(sim: Sim, improvementId: string, buildingId?: string): PlacementResult {
  const world = sim.world;
  if (improvementId === "accessible") {
    if (!buildingId) return { ok: false, message: "Selecione um prédio", reason: "Escolha o prédio que receberá a rota acessível." };
    const building = world.buildings.find((b) => b.id === buildingId);
    if (!building) return { ok: false, message: "Prédio inválido" };
    if (building.accessible) return { ok: false, message: "Prédio já acessível" };
    if (world.budget < 1200) return { ok: false, message: "Saldo insuficiente", reason: "A rota acessível custa R$ 1.200." };
    building.accessible = true;
    addLedger(sim, -1200, "Acessibilidade", `Rota acessível em ${BUILDABLE_BY_KIND[building.kind]?.name}`, "melhoria");
    rebuildWorldModel(sim);
    notify(sim, "good", "Rota acessível instalada", `${BUILDABLE_BY_KIND[building.kind]?.name} agora recebe todos os alunos, incluindo Ana.`, `access-${buildingId}`, 5);
    return { ok: true, message: "Rota acessível instalada" };
  }
  const catalogue = [
    { id: "solar", cost: 5600 },
    { id: "rain", cost: 2800 },
    { id: "led", cost: 2200 },
    { id: "bins", cost: 900 },
    { id: "compost", cost: 1100 },
    { id: "trees", cost: 1600 },
  ];
  const item = catalogue.find((c) => c.id === improvementId);
  if (!item) return { ok: false, message: "Melhoria desconhecida" };
  if (world.improvements.includes(improvementId)) return { ok: false, message: "Melhoria já instalada" };
  if (world.budget < item.cost) return { ok: false, message: "Saldo insuficiente", reason: `Custo ${formatMoney(item.cost)}.` };
  world.improvements.push(improvementId);
  addLedger(sim, -item.cost, "Melhoria", improvementId, "melhoria");
  rebuildWorldModel(sim);
  notify(sim, "good", "Melhoria aplicada", "O efeito já aparece no cenário e nos indicadores.", `improve-${improvementId}`, 5);
  return { ok: true, message: "Melhoria aplicada" };
}

export function hireStaff(sim: Sim, role: StaffMember["role"]): PlacementResult {
  const def = STAFF_ROLES.find((r) => r.role === role);
  if (!def) return { ok: false, message: "Função inválida" };
  if (sim.world.budget < def.cost) return { ok: false, message: "Saldo insuficiente", reason: `Contratação ${formatMoney(def.cost)} + salário diário ${formatMoney(def.salary)}.` };
  const index = sim.world.staff.filter((s) => s.role === role).length + 1;
  const names: Record<string, string[]> = {
    teacher: ["Prof. Ricardo", "Prof.ª Helena", "Prof. Caio", "Prof.ª Luiza"],
    custodian: ["Dona Cida", "Sr. José", "Marina (limpeza)"],
    maintenance: ["Seu Antônio", "Rafa (manutenção)"],
    canteen: ["Rosa (cantina)", "Tia Neide", "Beto (cantina)"],
    coordinator: ["Coord. Vera", "Coord. Paulo"],
  };
  const name = names[role][(index - 1) % names[role].length];
  const member: StaffMember = {
    id: `staff-${role}-${Date.now().toString(36)}`,
    name,
    role,
    skill: def.skill + Math.round(Math.random() * 8),
    salary: def.salary,
    rest: 90,
    workload: 20,
    training: 0,
    assignedZone: null,
  };
  sim.world.staff.push(member);
  addLedger(sim, -def.cost, "Contratação", `${def.label} · ${name}`, "salario");
  syncAgents(sim.world);
  rebuildWorldModel(sim);
  notify(sim, "good", `${name} contratado`, `${def.description} Salário diário ${formatMoney(def.salary)}.`, `hire-${member.id}`, 5);
  return { ok: true, message: "Profissional contratado" };
}

export function fireStaff(sim: Sim, id: string): PlacementResult {
  const member = sim.world.staff.find((s) => s.id === id);
  if (!member) return { ok: false, message: "Profissional não encontrado" };
  sim.world.staff = sim.world.staff.filter((s) => s.id !== id);
  sim.world.agents = sim.world.agents.filter((a) => a.id !== `crew-${id}`);
  notify(sim, "warn", "Desligamento", `${member.name} deixou a equipe.`, `fire-${id}`, 5);
  return { ok: true, message: "Profissional desligado" };
}

export function claimMission(sim: Sim, id: string): PlacementResult {
  const mission = sim.world.missions.find((m) => m.id === id);
  const def = MISSION_DEFS.find((m) => m.id === id);
  if (!mission || !def) return { ok: false, message: "Missão inválida" };
  if (mission.claimed) return { ok: false, message: "Recompensa já resgatada" };
  if (!mission.completed) return { ok: false, message: "Missão ainda não concluída", reason: "Cumpra o objetivo para resgatar." };
  mission.claimed = true;
  addLedger(sim, def.reward, "Missão", def.title, "missao");
  sim.world.reputation = clamp(sim.world.reputation + def.reputation);
  notify(sim, "good", "Recompensa resgatada", `${formatMoney(def.reward)} + ${def.reputation} de reputação.`, `claim-${id}`, 5);
  return { ok: true, message: `Recompensa: ${formatMoney(def.reward)}` };
}

export function startEvent(sim: Sim, id: string): PlacementResult {
  const def = EVENTS.find((e) => e.id === id);
  if (!def) return { ok: false, message: "Evento inválido" };
  const world = sim.world;
  if (world.reputation < def.requiredReputation) {
    return { ok: false, message: "Reputação insuficiente", reason: `Necessário reputação ${def.requiredReputation}.` };
  }
  const venue = def.venue.some((kind) => world.buildings.some((b) => b.kind === kind && b.progress >= 1));
  if (!venue) return { ok: false, message: "Local indisponível", reason: `Construa ${def.venue.map((v) => BUILDABLE_BY_KIND[v]?.name).join(" ou ")}.` };
  if (world.budget < def.cost) return { ok: false, message: "Saldo insuficiente", reason: `Evento custa ${formatMoney(def.cost)}.` };
  addLedger(sim, -def.cost, "Evento", `Preparação: ${def.name}`, "evento");
  const now = absMinutes(world);
  const primaryVenue = world.buildings.find((b) => def.venue.includes(b.kind) && b.progress >= 1);
  world.events.unshift({
    id: `event-${Date.now().toString(36)}`,
    kind: id,
    name: def.name,
    startsAt: now + def.prep,
    endsAt: now + def.prep + def.duration,
    cost: def.cost,
    status: "preparing",
    attendance: 0,
    result: primaryVenue ? `Preparação em ${BUILDABLE_BY_KIND[primaryVenue.kind]?.name}` : "Preparação",
  });
  notify(sim, "info", `${def.name} em preparação`, `As barracas e a decoração aparecem em ${def.prep} minutos simulados.`, `prep-${id}`, 5);
  return { ok: true, message: "Evento agendado" };
}

export function applyAdReward(sim: Sim, reward: string, selectedBuildingId?: string | null): PlacementResult {
  if (reward === "finish_work") {
    const target = sim.world.buildings.find((b) => b.progress < 1 && (!selectedBuildingId || b.id === selectedBuildingId)) ?? sim.world.buildings.find((b) => b.progress < 1);
    if (!target) return { ok: false, message: "Nenhuma obra ativa", reason: "A recompensa só pode ser usada com obras em andamento." };
    target.progress = 0.98;
    notify(sim, "good", "Obra adiantada", "A recompensa publicitária foi aplicada no canteiro de obras.", "ad-work", 5);
    rebuildWorldModel(sim);
    return { ok: true, message: "Obra adiantada" };
  }
  const active = sim.world.buildings.filter((b) => b.progress < 1);
  if (active.length === 0) return { ok: false, message: "Nenhuma obra ativa", reason: "A recompensa só pode ser usada com obras em andamento." };
  active.forEach((b) => {
    b.progress = Math.min(0.99, b.progress + (1 - b.progress) * 0.5);
  });
  notify(sim, "good", "Obras adiantadas", `${active.length} canteiro(s) receberam 50% de adiantamento.`, "ad-boost", 5);
  rebuildWorldModel(sim);
  return { ok: true, message: "Obras adiantadas" };
}

export function movePlayer(sim: Sim, dx: number, dz: number): void {
  const world = sim.world;
  const nx = world.player.x + dx;
  const nz = world.player.z + dz;
  if (!walkableAt(sim.grid, nx, nz, false)) return;
  if (!ownedContains(nx, nz)) return;
  world.player.x = nx;
  world.player.z = nz;
}

export function setWeather(sim: Sim, weather: Weather) {
  sim.world.weather = weather;
}

export function skipToPhase(sim: Sim, minutes: number) {
  sim.world.minutes = Math.max(sim.world.minutes, minutes);
}

export function exportWorld(sim: Sim): GameWorld {
  const world = structuredClone(sim.world);
  world.savedAt = Date.now();
  world.agents = world.agents.map((a) => ({ ...a, path: [], pathIndex: 0 }));
  return world;
}

export function validateSave(value: unknown): GameWorld | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GameWorld>;
  if (typeof candidate.day !== "number" || !Array.isArray(candidate.buildings) || !Array.isArray(candidate.agents)) return null;
  if (!candidate.buildings.every((b) => b && typeof b.kind === "string" && typeof b.x === "number" && typeof b.z === "number")) return null;
  if (!Array.isArray(candidate.missions)) return null;
  return candidate as GameWorld;
}

/** Buildings keep progressing while the tab is closed; routine/economy do not. */
export function applyOfflineProgress(world: GameWorld, elapsedMs: number): { minutes: number; completed: number } {
  const hours = Math.min(8, Math.max(0, elapsedMs / 3_600_000));
  const minutes = Math.floor(hours * 60 * 2);
  let completed = 0;
  for (const b of world.buildings) {
    if (b.progress >= 1) continue;
    const spec = BUILDABLE_BY_KIND[b.kind];
    const total = Math.max(6, spec.hours * BUILD_DURATION_MINUTES_PER_HOUR);
    b.progress = Math.min(1, b.progress + minutes / total);
    if (b.progress >= 1) completed += 1;
  }
  return { minutes, completed };
}

export function scheduleConflicts(sim: Sim): ScheduleSlot[] {
  const schedule = sim.world.schedule;
  schedule.forEach((slot) => {
    slot.conflict = null;
    const overlapping = schedule.filter((other) => other.id !== slot.id && other.start < slot.end && other.end > slot.start);
    const room = overlapping.find((o) => o.buildingId && o.buildingId === slot.buildingId && o.groupId !== slot.groupId);
    if (room) slot.conflict = "Sala usada por outra turma no mesmo horário";
  });
  return schedule;
}

export function optimizeSchedule(sim: Sim): PlacementResult {
  const rooms = sim.world.buildings.filter((b) => b.kind === "classroom" && b.progress >= 1);
  const teachers = sim.world.staff.filter((s) => s.role === "teacher");
  if (rooms.length === 0) return { ok: false, message: "Construa uma sala de aula primeiro" };
  const windows = [
    [465, 555],
    [585, 690],
    [750, 850],
  ];
  const slots: ScheduleSlot[] = [];
  let i = 0;
  sim.world.groups.forEach((group, groupIndex) => {
    windows.forEach((win, windowIndex) => {
      slots.push({
        id: `auto-${group.id}-${windowIndex}`,
        groupId: group.id,
        subject: ["Português", "Matemática", "Ciências", "História", "Arte"][(groupIndex + windowIndex) % 5],
        buildingId: rooms[(groupIndex + windowIndex) % rooms.length].id,
        teacherId: teachers[(groupIndex + windowIndex) % Math.max(1, teachers.length)]?.id ?? null,
        start: win[0],
        end: win[1],
        conflict: null,
      });
      i += 1;
    });
  });
  sim.world.schedule = slots;
  scheduleConflicts(sim);
  notify(sim, "good", "Grade reorganizada", `${slots.length} aulas distribuídas em ${rooms.length} sala(s).`, "schedule-auto", 5);
  void i;
  return { ok: true, message: "Grade reorganizada automaticamente" };
}

export function setStudents(sim: Sim, count: number): PlacementResult {
  const seats = totalSeats(sim.world);
  if (count > seats) {
    return { ok: false, message: "Assentos insuficientes", reason: `Você tem ${seats} assentos reais. Construa mais carteiras antes de matricular ${count} alunos.` };
  }
  sim.world.enrolled = clamp(count, 0, 30);
  const groups = sim.world.groups;
  if (groups[0]) groups[0].students = Math.min(sim.world.enrolled, 20);
  if (groups[1]) groups[1].students = Math.max(0, sim.world.enrolled - 20);
  syncAgents(sim.world);
  rebuildWorldModel(sim);
  return { ok: true, message: `${count} alunos matriculados` };
}

export function setMode(sim: Sim, mode: GameMode): PlacementResult {
  sim.world.mode = mode;
  notify(sim, "info", `Modo ${MODES[mode].label}`, MODES[mode].hint, `mode-${mode}`, 1);
  return { ok: true, message: "Modo alterado" };
}

export function setBuildingAccessible(sim: Sim, id: string): PlacementResult {
  return buyImprovement(sim, "accessible", id);
}

export function assignGroupRoom(sim: Sim, roomId: string, groupId: string): PlacementResult {
  const room = sim.world.buildings.find((b) => b.id === roomId);
  if (!room) return { ok: false, message: "Sala inválida" };
  sim.world.schedule = sim.world.schedule.map((slot) =>
    slot.groupId === groupId ? { ...slot, buildingId: room.id } : slot,
  );
  scheduleConflicts(sim);
  return { ok: true, message: "Sala atribuída" };
}

export function schoolReport(sim: Sim) {
  const world = sim.world;
  return {
    day: world.day,
    students: world.enrolled,
    seats: totalSeats(world),
    learning: world.stats.learning,
    reputation: Math.round(world.reputation),
    budget: Math.round(world.budget),
    accessible: Math.round(world.stats.accessibility),
    payroll: world.staff.reduce((sum, s) => sum + s.salary, 0),
    grant: MODES[world.mode].grant,
    activeWorks: world.buildings.filter((b) => b.progress < 1).length,
  };
}

export function friendGroups(world: GameWorld) {
  return world.agents
    .filter((a) => a.role === "student" && a.visible)
    .slice(0, 8)
    .map((agent) => ({
      agent,
      friends: agent.friends
        .map((id) => world.agents.find((a) => a.id === id))
        .filter((a): a is Agent => !!a)
        .map((a) => a.name),
    }));
}

export function buildingStage(progress: number): { index: number; label: string } {
  const stages = [
    "Preparação do terreno",
    "Fundação",
    "Estrutura",
    "Paredes",
    "Cobertura",
    "Acabamento",
    "Instalação dos móveis",
    "Abertura",
  ];
  const thresholds = [0.06, 0.18, 0.36, 0.55, 0.7, 0.85, 0.96, 1];
  let index = 0;
  for (let i = 0; i < thresholds.length; i += 1) if (progress >= thresholds[i]) index = Math.min(7, i + 1);
  return { index, label: stages[Math.min(index, 7)] };
}

export function phaseLabel(minutes: number): string {
  const phase = phaseFor(minutes);
  switch (phase) {
    case "arrival":
      return "Chegada";
    case "class":
      return "Aula";
    case "break":
      return "Intervalo";
    case "lunch":
      return "Almoço";
    case "activity":
      return "Clubes";
    case "exit":
      return "Saída";
    default:
      return "Escola vazia";
  }
}

export function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m} min`;
}

export function eventVenue(sim: Sim, eventType: string): BuildingInstance | null {
  const def = EVENTS.find((e) => e.id === eventType);
  if (!def) return null;
  return sim.world.buildings.find((b) => def.venue.includes(b.kind) && b.progress >= 1) ?? null;
}

export function currentEvent(sim: Sim) {
  return sim.world.events.find((e) => e.status === "running") ?? sim.world.events.find((e) => e.status === "preparing") ?? null;
}

export function studentsNeedingHelp(sim: Sim) {
  return sim.world.agents
    .filter((a) => a.role === "student" && a.visible)
    .sort((a, b) => a.mood - b.mood)
    .slice(0, 3)
    .map((a) => ({
      name: a.name,
      mood: Math.round(a.mood),
      reason:
        a.wheelchair && !sim.world.buildings.some((b) => b.kind === "classroom" && b.accessible)
          ? "Sem rota acessível para a sala"
          : a.needs.hunger > 70
            ? "Com fome: fila/merenda insuficiente"
            : a.needs.fun < 35
              ? "Sem opções de lazer no intervalo"
              : a.seatKey
                ? "Necessidades estáveis"
                : "Sem assento reservado",
    }));
}

export function activeAgents(sim: Sim) {
  return sim.world.agents.filter((a) => a.visible);
}

export type StaffRole = AgentRole;
