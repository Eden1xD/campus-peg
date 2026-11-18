export type QualityTier = "low" | "medium" | "high";
export type GameMode = "career" | "creative" | "challenge" | "calm";
export type Weather = "sun" | "cloud" | "rain";
export type Phase = "arrival" | "class" | "break" | "lunch" | "activity" | "exit" | "empty";

export type AgentRole =
  | "student"
  | "teacher"
  | "custodian"
  | "maintenance"
  | "canteen"
  | "coordinator"
  | "visitor";

export type Activity =
  | "walk"
  | "idle"
  | "sit"
  | "write"
  | "read"
  | "eat"
  | "teach"
  | "clean"
  | "fix"
  | "carry"
  | "play"
  | "queue";

export interface Vec2 {
  x: number;
  z: number;
}

export type BuildingKind =
  | "classroom"
  | "library"
  | "lab"
  | "computer"
  | "arts"
  | "auditorium"
  | "canteen"
  | "patio"
  | "garden"
  | "court"
  | "reception"
  | "staffroom"
  | "bathroom"
  | "infirmary"
  | "makerspace"
  | "study"
  | "media"
  | "design"
  | "corridor"
  | "path"
  | "tactile";

export interface BuildingInstance {
  id: string;
  kind: BuildingKind;
  /** centre in metres */
  x: number;
  z: number;
  /** quarter turns (0..3) */
  rot: number;
  /** 0..1 construction progress */
  progress: number;
  /** absolute simulation minutes when works started */
  startedAt: number;
  /** absolute simulation minutes when works complete (0 while unknown) */
  completeAt: number;
  condition: number;
  dirt: number;
  accessible: boolean;
  /** melhorias instaladas neste prédio (aparecem no modelo e mudam a simulação) */
  upgrades?: string[];
  paint?: string;
  floorStyle?: string;
}

export interface Furniture {
  id: string;
  type: string;
  x: number;
  z: number;
  rot: number;
  seat?: boolean;
  activity?: Activity;
}

export interface Seat {
  key: string;
  buildingId: string;
  kind: BuildingKind;
  x: number;
  z: number;
  rot: number;
  activity: Activity;
  label: string;
}

export interface AgentNeeds {
  learning: number;
  hunger: number;
  energy: number;
  hygiene: number;
  fun: number;
  comfort: number;
  social: number;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  skin: number;
  hairStyle: number;
  hairColor: string;
  shirt: string;
  pants: string;
  height: number;
  wheelchair: boolean;
  backpack: boolean;
  x: number;
  z: number;
  heading: number;
  speed: number;
  path: Vec2[];
  pathIndex: number;
  state: Activity;
  activity: string;
  destination: string;
  buildingId: string | null;
  seatKey: string | null;
  intent:
    | "class"
    | "eat"
    | "queue"
    | "read"
    | "play"
    | "idle"
    | "clean"
    | "fix"
    | "teach"
    | "canteen"
    | "leave"
    | "arrive";
  queueSlot: number;
  waitTimer: number;
  stuckTimer: number;
  needs: AgentNeeds;
  mood: number;
  friends: string[];
  interest: "sport" | "read" | "music" | "art" | "science" | "social";
  club: string | null;
  active: boolean;
  leaving: boolean;
  visible: boolean;
  wanderTimer: number;
  carrying: boolean;
  story: string;
  /** diagnóstico: por que o personagem está parado (carro, parede, sem-rota, sem-assento, fila) */
  waitReason?: string;
  /** situação de matrícula controlada pelo gabinete */
  status?: "ativo" | "suspenso" | "expulso";
  returnDay?: number;
  orientPending?: boolean;
  skipping?: boolean;
  conflictId?: string | null;
  arriveAt?: number;
  taskId?: string | null;
  absentDay?: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: AgentRole;
  skill: number;
  salary: number;
  rest: number;
  workload: number;
  training: number;
  assignedZone: string | null;
}

export interface MissionState {
  id: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
}

export interface EventInstance {
  id: string;
  kind: string;
  name: string;
  startsAt: number;
  endsAt: number;
  cost: number;
  status: "preparing" | "running" | "done";
  attendance: number;
  result: string | null;
}

export interface LedgerEntry {
  id: string;
  at: number;
  amount: number;
  label: string;
  detail: string;
  category: "verba" | "obra" | "salario" | "utilidades" | "cantina" | "evento" | "estoque" | "missao" | "melhoria";
}

export interface GameNotification {
  id: string;
  at: number;
  tone: "info" | "good" | "warn" | "bad";
  title: string;
  body: string;
}

export interface CameraFavorite {
  id: string;
  name: string;
  target: Vec2;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface ScheduleSlot {
  id: string;
  groupId: string;
  subject: string;
  buildingId: string | null;
  teacherId: string | null;
  start: number;
  end: number;
  conflict: string | null;
}

export interface ClassGroup {
  id: string;
  name: string;
  students: number;
}

export interface StockState {
  food: number;
  supplies: number;
  cleaning: number;
  materials: number;
  autoReorder: boolean;
  min: { food: number; supplies: number; cleaning: number; materials: number };
}

export interface Settings {
  theme: "dark" | "light";
  quality: QualityTier;
  uiScale: number;
  reduceMotion: boolean;
  showNames: boolean;
  music: number;
  ambience: number;
  effects: number;
  shadows: boolean;
  sensitivity?: number;
  invertY?: boolean;
}

export interface GameWorld {
  version: number;
  mode: GameMode;
  schoolName: string;
  schoolColors: { primary: string; accent: string };
  day: number;
  minutes: number;
  weather: Weather;
  budget: number;
  reputation: number;
  enrolled: number;
  buildings: BuildingInstance[];
  improvements: string[];
  agents: Agent[];
  staff: StaffMember[];
  groups: ClassGroup[];
  schedule: ScheduleSlot[];
  missions: MissionState[];
  events: EventInstance[];
  stock: StockState;
  ledger: LedgerEntry[];
  notifications: GameNotification[];
  stats: {
    learning: number;
    comfort: number;
    cleanliness: number;
    satisfaction: number;
    fun: number;
    social: number;
    occupancy: number;
    accessibility: number;
    queue: number;
    energy: number;
    water: number;
    seatsTotal: number;
    seatsUsed: number;
    mealsToday: number;
    classesToday: number;
    attendance: number;
  };
  daily: {
    fundingPaid: boolean;
    payrollPaid: boolean;
    utilitiesPaid: boolean;
    servedMeals: number;
    queuePeak: number;
    studentsInClassPeak: number;
    readingPeak: number;
    eventAttendance: number;
  };
  player: { x: number; z: number; heading: number; visits: string[] };
  ads: { lastClaimAt: number; claims: number };
  cameraFavorites: CameraFavorite[];
  settings: Settings;
  tutorialStep: number;
  savedAt: number;
  lastTickAt: number;
  rngSeed: number;
}

export interface Snapshot {
  day: number;
  minutes: number;
  phase: Phase;
  weather: Weather;
  budget: number;
  reputation: number;
  enrolled: number;
  stats: GameWorld["stats"];
  daily: GameWorld["daily"];
  missions: MissionState[];
  events: EventInstance[];
  notifications: GameNotification[];
  stock: StockState;
  ledger: LedgerEntry[];
  staff: StaffMember[];
  buildings: BuildingInstance[];
  groups: ClassGroup[];
  schedule: ScheduleSlot[];
  agents: AgentSummary[];
  tutorialStep: number;
  activeWorks: number;
  modes: GameMode;
}

export interface AgentSummary {
  id: string;
  name: string;
  role: AgentRole;
  activity: string;
  destination: string;
  mood: number;
  needs: AgentNeeds;
  club: string | null;
  story: string;
  x: number;
  z: number;
}

export type IconName =
  | "school"
  | "build"
  | "students"
  | "staff"
  | "schedule"
  | "finance"
  | "missions"
  | "settings"
  | "camera"
  | "photo"
  | "layers"
  | "access"
  | "spark"
  | "close"
  | "play"
  | "pause"
  | "clock"
  | "weather"
  | "coin"
  | "heart"
  | "map"
  | "eye"
  | "trash"
  | "rotate"
  | "move"
  | "check"
  | "warning"
  | "arrow"
  | "sun"
  | "rain"
  | "cloud"
  | "volume"
  | "save"
  | "download"
  | "upload"
  | "trophy"
  | "cleaning"
  | "energy"
  | "queue"
  | "grid"
  | "walk"
  | "firstperson";

export interface BuildableSpec {
  kind: BuildingKind;
  name: string;
  category: "ensino" | "convivencia" | "esportes" | "administracao" | "apoio" | "circulacao" | "acessibilidade";
  w: number;
  d: number;
  cost: number;
  hours: number;
  seats: number;
  description: string;
  wall: string;
  roof: string;
  floor: string;
  open: boolean;
  icon: IconName;
  minReputation: number;
  bonus: Partial<{
    learning: number;
    comfort: number;
    fun: number;
    social: number;
    hygiene: number;
    safety: number;
  }>;
  /** short label of the visible consequence */
  impact: string;
}
