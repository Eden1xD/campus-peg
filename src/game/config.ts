import type {
  BuildableSpec,
  BuildingKind,
  ClassGroup,
  GameMode,
  IconName,
  QualityTier,
  ScheduleSlot,
  Weather,
} from "./types";

export const SAVE_VERSION = 3;
export const GAME_ROUTE = "/teste-escola";
export const PEG_AD_VIDEO_URL = process.env.NEXT_PUBLIC_PEG_AD_VIDEO_URL ?? "";

/** navigable plot (metres). Street sits north of the fence (negative z). */
/** Parcela inicial (o campus original — saves antigos ficam exatamente aqui). */
export const CENTER_PARCEL = {
  minX: -45,
  maxX: 45,
  minZ: -23,
  maxZ: 67,
};

export const WORLD = { ...CENTER_PARCEL };
export const PLOT = WORLD;
export interface ParcelDef { id: string; name: string; minX: number; maxX: number; minZ: number; maxZ: number; price: number; hint: string }
export const PARCELS: ParcelDef[] = [
  {
    id: "centro",
    name: "Campus PEG",
    ...CENTER_PARCEL,
    price: 0,
    hint: "Terreno de 90 × 90 metros para construir sua escola.",
  },
];
export const BUILD_BOUNDS = {
  minX: -43,
  maxX: 43,
  minZ: -21,
  maxZ: 65,
};
export const GATE: { x: number; z: number } = { x: 0, z: -22.4 };
export const ENTRY_SPAWN: { x: number; z: number } = { x: -1.5, z: -26.5 };
export const SCHOOL_NAME_DEFAULT = "Escola Estadual PEG";

export const MODES: Record<GameMode, { label: string; hint: string; budget: number; reputation: number; grant: number }> = {
  career: { label: "Carreira", hint: "Verba limitada, missões e progressão real.", budget: 26000, reputation: 42, grant: 7200 },
  calm: { label: "Tranquilo", hint: "Custos reduzidos e mais tempo para aprender.", budget: 34000, reputation: 50, grant: 8200 },
  creative: { label: "Criativo", hint: "Obras instantâneas e verba generosa (sem pressão).", budget: 400000, reputation: 60, grant: 400000 },
  challenge: { label: "Desafio", hint: "Escola endividada: recupere as contas e a aprendizagem.", budget: 9000, reputation: 28, grant: 5600 },
};

export const QUALITY: Record<
  QualityTier,
  {
    label: string;
    texture: number;
    pixelRatio: number;
    shadows: number;
    rain: number;
    detail: number;
    characters: number;
    fog: number;
    note: string;
  }
> = {
  low: { label: "Baixa", texture: 128, pixelRatio: 1, shadows: 0, rain: 250, detail: 0, characters: 14, fog: 120, note: "Mobile / GPUs integradas" },
  medium: { label: "Média", texture: 256, pixelRatio: 1.5, shadows: 1024, rain: 600, detail: 1, characters: 26, fog: 170, note: "Equilíbrio recomendado" },
  high: { label: "Alta", texture: 512, pixelRatio: 2, shadows: 2048, rain: 1100, detail: 2, characters: 40, fog: 210, note: "Desktop com GPU dedicada" },
};

export const BUILD_DURATION_MINUTES_PER_HOUR = 20; // 1 "hora de obra" = 20 min simulados em 1x

export const BUILDABLES: BuildableSpec[] = [
  {
    kind: "classroom",
    name: "Sala de aula",
    category: "ensino",
    w: 14,
    d: 10,
    cost: 9500,
    hours: 7,
    seats: 24,
    description: "Carteiras individuais, quadro, ventilador e armário do professor.",
    wall: "#e7dfcf",
    roof: "#7d6a63",
    floor: "wood",
    open: false,
    icon: "students",
    minReputation: 0,
    bonus: { learning: 14, comfort: 4 },
    impact: "Cada carteira = 1 aluno em aula.",
  },
  {
    kind: "library",
    name: "Biblioteca",
    category: "ensino",
    w: 13,
    d: 10,
    cost: 8800,
    hours: 8,
    seats: 14,
    description: "Estantes, mesas de leitura, tapete e iluminação quente.",
    wall: "#e3d6c3",
    roof: "#5f6b74",
    floor: "wood",
    open: false,
    icon: "students",
    minReputation: 40,
    bonus: { learning: 10, comfort: 8 },
    impact: "Mais leitura: missões de aprendizagem aceleram.",
  },
  {
    kind: "lab",
    name: "Laboratório de ciências",
    category: "ensino",
    w: 13,
    d: 10,
    cost: 11500,
    hours: 10,
    seats: 16,
    description: "Bancadas com pias, capela, vidrarias e quadro de normas.",
    wall: "#d9e2df",
    roof: "#4f5a63",
    floor: "tile",
    open: false,
    icon: "spark",
    minReputation: 48,
    bonus: { learning: 12, social: 3 },
    impact: "Aulas práticas melhoram ciências e interesse.",
  },
  {
    kind: "computer",
    name: "Sala de informática",
    category: "ensino",
    w: 12,
    d: 9,
    cost: 10500,
    hours: 9,
    seats: 16,
    description: "16 computadores em bancadas com organização de cabos.",
    wall: "#dfe4ee",
    roof: "#4a5361",
    floor: "tile",
    open: false,
    icon: "spark",
    minReputation: 45,
    bonus: { learning: 9, fun: 4 },
    impact: "Inclusão digital: melhora aprendizagem e diversão.",
  },
  {
    kind: "arts",
    name: "Sala de artes",
    category: "ensino",
    w: 12,
    d: 9,
    cost: 7800,
    hours: 6,
    seats: 18,
    description: "Cavaletes, bancadas, pia, murais e armários de materiais.",
    wall: "#f0ded9",
    roof: "#6c5a62",
    floor: "wood",
    open: false,
    icon: "spark",
    minReputation: 35,
    bonus: { fun: 8, social: 4 },
    impact: "Desbloqueia clubes de arte e apresentações.",
  },
  {
    kind: "auditorium",
    name: "Auditório",
    category: "ensino",
    w: 19,
    d: 13,
    cost: 18500,
    hours: 16,
    seats: 40,
    description: "Palco, cortinas, poltronas e sistema de som.",
    wall: "#e6dfd2",
    roof: "#3f4652",
    floor: "wood",
    open: false,
    icon: "school",
    minReputation: 55,
    bonus: { social: 12, fun: 9 },
    impact: "Eventos com público maior e melhor reputação.",
  },
  {
    kind: "canteen",
    name: "Cantina / refeitório",
    category: "convivencia",
    w: 13,
    d: 10,
    cost: 7400,
    hours: 6,
    seats: 16,
    description: "Balcão com bandejas, mesas, geladeira e lixeiras seletivas.",
    wall: "#e9e2d1",
    roof: "#6d5b4c",
    floor: "tile",
    open: false,
    icon: "queue",
    minReputation: 0,
    bonus: { comfort: 6, social: 8 },
    impact: "Cada mesa = 4 lugares. Menos lugares = fila maior.",
  },
  {
    kind: "patio",
    name: "Pátio coberto",
    category: "convivencia",
    w: 18,
    d: 12,
    cost: 5400,
    hours: 4,
    seats: 12,
    description: "Pergolado, bancos, bebedouro e jardineiras.",
    wall: "#ded2bf",
    roof: "#59636e",
    floor: "concrete",
    open: true,
    icon: "students",
    minReputation: 0,
    bonus: { social: 10, comfort: 6 },
    impact: "Abrigo na chuva: mantém os alunos confortáveis.",
  },
  {
    kind: "garden",
    name: "Jardim pedagógico",
    category: "convivencia",
    w: 12,
    d: 9,
    cost: 3400,
    hours: 3,
    seats: 8,
    description: "Canteiros, horta, árvores e bancos de madeira.",
    wall: "#cbd6b4",
    roof: "#61745a",
    floor: "grass",
    open: true,
    icon: "spark",
    minReputation: 30,
    bonus: { comfort: 8, fun: 5 },
    impact: "Conforto e clubes de horta/comunidade.",
  },
  {
    kind: "court",
    name: "Quadra poliesportiva",
    category: "esportes",
    w: 21,
    d: 13,
    cost: 6900,
    hours: 5,
    seats: 12,
    description: "Piso pintado, traves, cestas, alambrado e arquibancada.",
    wall: "#d8c8a8",
    roof: "#4d6b5d",
    floor: "court",
    open: true,
    icon: "trophy",
    minReputation: 32,
    bonus: { fun: 12, social: 8 },
    impact: "Interclasses e esportes no intervalo.",
  },
  {
    kind: "reception",
    name: "Recepção e secretaria",
    category: "administracao",
    w: 8,
    d: 6,
    cost: 4200,
    hours: 3,
    seats: 4,
    description: "Balcão de atendimento, mural de avisos e espera.",
    wall: "#e4dccb",
    roof: "#586373",
    floor: "tile",
    open: false,
    icon: "school",
    minReputation: 0,
    bonus: { comfort: 3, safety: 5 },
    impact: "Orienta visitantes e libera a entrada.",
  },
  {
    kind: "staffroom",
    name: "Sala dos professores",
    category: "administracao",
    w: 10,
    d: 8,
    cost: 6400,
    hours: 5,
    seats: 10,
    description: "Mesas de trabalho, sofá, café e armários.",
    wall: "#e2e0d3",
    roof: "#4f5a63",
    floor: "wood",
    open: false,
    icon: "staff",
    minReputation: 35,
    bonus: { learning: 5, comfort: 4 },
    impact: "Descanso docente reduz faltas e melhora aulas.",
  },
  {
    kind: "bathroom",
    name: "Banheiros",
    category: "apoio",
    w: 7,
    d: 6,
    cost: 3600,
    hours: 3,
    seats: 0,
    description: "Cabines, pias, espelhos e um box acessível.",
    wall: "#dce6e6",
    roof: "#55616b",
    floor: "tile",
    open: false,
    icon: "cleaning",
    minReputation: 0,
    bonus: { hygiene: 12, comfort: 4 },
    impact: "Higiene baixa gera desconforto visível.",
  },
  {
    kind: "infirmary",
    name: "Enfermaria",
    category: "apoio",
    w: 7,
    d: 6,
    cost: 4800,
    hours: 4,
    seats: 3,
    description: "Maca, armário de primeiros socorros e pia.",
    wall: "#e9eef2",
    roof: "#5c6b72",
    floor: "tile",
    open: false,
    icon: "heart",
    minReputation: 40,
    bonus: { comfort: 6, safety: 8 },
    impact: "Atende ocorrências no mesmo dia.",
  },
  {
    kind: "makerspace",
    name: "Espaço maker",
    category: "ensino",
    w: 12,
    d: 9,
    cost: 12500,
    hours: 9,
    seats: 16,
    description: "Bancadas, ferramentas, impressora 3D e caixas organizadoras.",
    wall: "#dbe3d6",
    roof: "#455a52",
    floor: "concrete",
    open: false,
    icon: "spark",
    minReputation: 58,
    bonus: { learning: 10, fun: 7 },
    impact: "Clube de robótica e projetos práticos.",
  },
  {
    kind: "study",
    name: "Sala de estudos",
    category: "ensino",
    w: 10,
    d: 8,
    cost: 6200,
    hours: 5,
    seats: 12,
    description: "Cabines individuais, mesas de grupo, divisórias baixas e quadro de planejamento.",
    wall: "#dfe8f0",
    roof: "#6d7c8a",
    floor: "wood",
    open: false,
    icon: "schedule",
    minReputation: 20,
    bonus: { learning: 10, comfort: 6 },
    impact: "Lugar silencioso: estudo em atividades livres.",
  },
  {
    kind: "media",
    name: "Sala de mídia do Grêmio",
    category: "convivencia",
    w: 10,
    d: 8,
    cost: 7400,
    hours: 6,
    seats: 3,
    description: "Ilhas de edição, microfones, fones, painéis acústicos e cabine de gravação.",
    wall: "#2f2a3d",
    roof: "#4a4458",
    floor: "tile",
    open: false,
    icon: "photo",
    minReputation: 30,
    bonus: { fun: 10, social: 8 },
    impact: "O Grêmio grava avisos e podcasts.",
  },
  {
    kind: "design",
    name: "Ateliê de design",
    category: "ensino",
    w: 10,
    d: 8,
    cost: 6800,
    hours: 6,
    seats: 4,
    description: "Mesas amplas de projeto, amostras, réguas e painéis de referência.",
    wall: "#f1e6d8",
    roof: "#8a6f5c",
    floor: "wood",
    open: false,
    icon: "layers",
    minReputation: 25,
    bonus: { learning: 8, fun: 8 },
    impact: "Projetos de design em atividades livres.",
  },
  {
    kind: "corridor",
    name: "Corredor coberto",
    category: "circulacao",
    w: 3,
    d: 8,
    cost: 1400,
    hours: 2,
    seats: 0,
    description: "Passarela coberta modular para ligar blocos. Abriga da chuva e organiza o fluxo.",
    wall: "#e9e4da",
    roof: "#5d6470",
    floor: "concrete",
    open: true,
    icon: "arrow",
    minReputation: 0,
    bonus: { comfort: 3 },
    impact: "Liga prédios com caminho coberto; conta como área abrigada.",
  },
  {
    kind: "path",
    name: "Caminho pavimentado",
    category: "circulacao",
    w: 3,
    d: 3,
    cost: 180,
    hours: 0,
    seats: 0,
    description: "Concreto com juntas, liga ambientes com conforto.",
    wall: "#d6d0c2",
    roof: "#d6d0c2",
    floor: "concrete",
    open: true,
    icon: "walk",
    minReputation: 0,
    bonus: { comfort: 1 },
    impact: "Reduz atalhos na grama e melhora a circulação.",
  },
  {
    kind: "tactile",
    name: "Rota acessível (piso tátil + rampa)",
    category: "acessibilidade",
    w: 3,
    d: 3,
    cost: 420,
    hours: 0,
    seats: 0,
    description: "Piso tátil direcional e rampa suave de acesso.",
    wall: "#e8c53d",
    roof: "#e8c53d",
    floor: "concrete",
    open: true,
    icon: "access",
    minReputation: 0,
    bonus: { comfort: 2, safety: 3 },
    impact: "Sem rota acessível, Ana (cadeirante) não entra na sala.",
  },
];

export const BUILDABLE_BY_KIND: Record<string, BuildableSpec> = Object.fromEntries(
  BUILDABLES.map((b) => [b.kind, b]),
) as Record<string, BuildableSpec>;

export const IMPROVEMENTS: {
  id: string;
  name: string;
  cost: number;
  icon: IconName;
  description: string;
  effect: string;
}[] = [
  {
    id: "accessible",
    name: "Rota acessível por prédio",
    cost: 1200,
    icon: "access",
    description: "Rampa, porta larga e piso tátil até a porta do prédio selecionado.",
    effect: "Alunos com mobilidade reduzida passam a frequentar o prédio.",
  },
  {
    id: "solar",
    name: "Painéis solares",
    cost: 5600,
    icon: "energy",
    description: "Cobertura com painéis fotovoltaicos na escola.",
    effect: "Reduz a conta de energia em 28%.",
  },
  {
    id: "rain",
    name: "Captação de chuva",
    cost: 2800,
    icon: "rain",
    description: "Calhas, cisterna e filtro para irrigação e limpeza.",
    effect: "Reduz o consumo de água em 22%.",
  },
  {
    id: "led",
    name: "Iluminação eficiente",
    cost: 2200,
    icon: "spark",
    description: "Luminárias LED com sensores nas áreas comuns.",
    effect: "Reduz energia em 12% e melhora conforto.",
  },
  {
    id: "bins",
    name: "Coleta seletiva",
    cost: 900,
    icon: "cleaning",
    description: "Conjuntos de lixeiras coloridas no pátio e na cantina.",
    effect: "Reduz sujeira acumulada e aumenta satisfação.",
  },
  {
    id: "compost",
    name: "Composteira",
    cost: 1100,
    icon: "spark",
    description: "Composteira nos fundos, alimentada pela horta e cozinha.",
    effect: "Reduz desperdício de alimentos em 15%.",
  },
  {
    id: "trees",
    name: "Arborização do pátio",
    cost: 1600,
    icon: "sun",
    description: "Árvores nativas com sombra nas áreas de convivência.",
    effect: "Sobe conforto térmico em dias de sol e chuva.",
  },
];

export const MISSION_DEFS: {
  id: string;
  title: string;
  description: string;
  hint: string;
  target: number;
  unit: string;
  reward: number;
  reputation: number;
  difficulty: "Inicial" | "Média" | "Difícil" | "Muito difícil";
  icon: IconName;
  teleport?: { x: number; z: number; label: string };
}[] = [
  {
    id: "first-class",
    title: "Primeiro dia de aula",
    description: "Tenha 10 alunos sentados em sala ao mesmo tempo.",
    hint: "Construa carteiras em uma sala de aula e mantenha o horário de aula.",
    target: 10,
    unit: "alunos em aula",
    reward: 1200,
    reputation: 4,
    difficulty: "Inicial",
    icon: "students",
  },
  {
    id: "canteen-flow",
    title: "Fila sob controle",
    description: "No pico do almoço, mantenha a fila da cantina em até 3 alunos e sirva 10 refeições.",
    hint: "Mais mesas e uma cantina maior reduzem a fila.",
    target: 10,
    unit: "refeições servidas",
    reward: 1600,
    reputation: 5,
    difficulty: "Média",
    icon: "queue",
    teleport: { x: 10, z: -4, label: "Cantina" },
  },
  {
    id: "library-open",
    title: "Biblioteca viva",
    description: "Construa uma biblioteca e tenha 4 alunos lendo ao mesmo tempo.",
    hint: "A biblioteca é liberada com reputação 40.",
    target: 4,
    unit: "leitores simultâneos",
    reward: 2200,
    reputation: 6,
    difficulty: "Média",
    icon: "students",
  },
  {
    id: "access-all",
    title: "Escola para todos",
    description: "Garanta rota acessível em todos os prédios fechados e mantenha Ana frequentando as aulas.",
    hint: "Use Melhorias → Rota acessível por prédio.",
    target: 4,
    unit: "prédios acessíveis",
    reward: 2600,
    reputation: 8,
    difficulty: "Difícil",
    icon: "access",
  },
  {
    id: "budget-health",
    title: "Contas em ordem",
    description: "Termine um dia letivo com saldo acima de R$ 12.000 e sem atrasar salários.",
    hint: "Cantina e eventos geram receita; evite obras simultâneas demais.",
    target: 12000,
    unit: "saldo final",
    reward: 1800,
    reputation: 5,
    difficulty: "Difícil",
    icon: "finance",
  },
  {
    id: "event-master",
    title: "Evento inesquecível",
    description: "Realize um evento com pelo menos 18 participantes e resultado positivo.",
    hint: "Prepare o evento com 1 dia de antecedência e garanta pátio/quadra.",
    target: 18,
    unit: "participantes",
    reward: 3000,
    reputation: 10,
    difficulty: "Difícil",
    icon: "trophy",
  },
  {
    id: "enrolment",
    title: "Turma cheia",
    description: "Matricule 20 alunos com assento garantido para todos.",
    hint: "Assentos reais = carteiras + mesas; amplie sua sala.",
    target: 20,
    unit: "matrículas com assento",
    reward: 2000,
    reputation: 6,
    difficulty: "Difícil",
    icon: "school",
  },
  {
    id: "green-school",
    title: "Escola sustentável",
    description: "Instale painéis solares, LED e coleta seletiva.",
    hint: "Melhorias ficam no painel Melhorias.",
    target: 3,
    unit: "melhorias verdes",
    reward: 2600,
    reputation: 7,
    difficulty: "Média",
    icon: "energy",
  },
  {
    id: "director-round",
    title: "Ronda do diretor (1ª pessoa)",
    description: "Caminhe até a cantina no almoço, visite a biblioteca e um canteiro de obras.",
    hint: "Entre em 1ª pessoa (F), ande com WASD e aproxime-se dos pontos marcados.",
    target: 3,
    unit: "locais inspecionados",
    reward: 1500,
    reputation: 4,
    difficulty: "Média",
    icon: "walk",
    teleport: { x: 0, z: 6, label: "Pátio" },
  },
  {
    id: "reference-school",
    title: "Escola referência",
    description: "Alcance reputação 75 com aprendizagem, conforto e limpeza acima de 60.",
    hint: "Qualidade importa mais que quantidade de prédios.",
    target: 75,
    unit: "reputação",
    reward: 5200,
    reputation: 12,
    difficulty: "Muito difícil",
    icon: "trophy",
  },
];

export const EVENTS: {
  id: string;
  name: string;
  cost: number;
  duration: number;
  prep: number;
  venue: BuildingKind[];
  description: string;
  icon: IconName;
  requiredReputation: number;
}[] = [
  {
    id: "science-fair",
    name: "Feira de ciências",
    cost: 1800,
    duration: 180,
    prep: 120,
    venue: ["patio", "auditorium", "canteen"],
    description: "Bancadas, experimentos e famílias visitando. Aumenta aprendizagem.",
    icon: "spark",
    requiredReputation: 30,
  },
  {
    id: "interclasses",
    name: "Interclasses",
    cost: 2400,
    duration: 200,
    prep: 90,
    venue: ["court"],
    description: "Times, uniformes e torcida. Depende da quadra construída.",
    icon: "trophy",
    requiredReputation: 35,
  },
  {
    id: "june-party",
    name: "Festa junina",
    cost: 3200,
    duration: 210,
    prep: 150,
    venue: ["patio", "canteen"],
    description: "Barracas, bandeirinhas e música. Grande impulso de convivência.",
    icon: "spark",
    requiredReputation: 40,
  },
  {
    id: "book-week",
    name: "Semana de leitura",
    cost: 1400,
    duration: 160,
    prep: 60,
    venue: ["library", "patio"],
    description: "Contação de histórias e feira do livro na biblioteca.",
    icon: "students",
    requiredReputation: 42,
  },
];

export const STAFF_ROLES: {
  role: "teacher" | "custodian" | "maintenance" | "canteen" | "coordinator";
  label: string;
  salary: number;
  cost: number;
  skill: number;
  description: string;
}[] = [
  {
    role: "teacher",
    label: "Professor(a)",
    salary: 320,
    cost: 800,
    skill: 70,
    description: "Conduz aulas nas salas. Cada 2 turmas pedem 1 professor.",
  },
  {
    role: "custodian",
    label: "Auxiliar de limpeza",
    salary: 190,
    cost: 450,
    skill: 60,
    description: "Limpa o prédio mais sujo usando produtos de limpeza.",
  },
  {
    role: "maintenance",
    label: "Manutenção",
    salary: 240,
    cost: 600,
    skill: 65,
    description: "Conserta equipamentos quebrados e reduz a fila de reparos.",
  },
  {
    role: "canteen",
    label: "Cantina",
    salary: 210,
    cost: 500,
    skill: 55,
    description: "Serve as refeições mais rápido e reduz a fila.",
  },
  {
    role: "coordinator",
    label: "Coordenação",
    salary: 380,
    cost: 900,
    skill: 80,
    description: "Aumenta o desempenho pedagógico e orienta a entrada.",
  },
];

export const PHASE_WINDOWS: { phase: string; start: number; end: number; label: string }[] = [
  { phase: "arrival", start: 420, end: 465, label: "Chegada (7h–7h45)" },
  { phase: "class", start: 465, end: 555, label: "1ª aula (7h45–9h15)" },
  { phase: "break", start: 555, end: 585, label: "Intervalo (9h15–9h45)" },
  { phase: "class", start: 585, end: 690, label: "2ª aula (9h45–11h30)" },
  { phase: "lunch", start: 690, end: 750, label: "Almoço (11h30–12h30)" },
  { phase: "class", start: 750, end: 850, label: "3ª aula (12h30–14h10)" },
  { phase: "activity", start: 850, end: 915, label: "Clubes e esportes (14h10–15h15)" },
  { phase: "exit", start: 915, end: 970, label: "Saída (15h15–16h10)" },
];

export const INITIAL_GROUPS: ClassGroup[] = [
  { id: "turma-a", name: "Turma A — 6º ano", students: 10 },
  { id: "turma-b", name: "Turma B — 7º ano", students: 0 },
];

export function makeInitialSchedule(buildingId: string | null): ScheduleSlot[] {
  const subjects = ["Português", "Matemática", "Ciências", "História", "Arte"];
  const slots: ScheduleSlot[] = [];
  let i = 0;
  for (const group of INITIAL_GROUPS) {
    for (const [start, end] of [
      [465, 555],
      [585, 690],
      [750, 850],
    ]) {
      slots.push({
        id: `slot-${i++}`,
        groupId: group.id,
        subject: subjects[i % subjects.length],
        buildingId: buildingId,
        teacherId: null,
        start,
        end,
        conflict: null,
      });
    }
  }
  return slots;
}

export const STUDENT_NAMES = [
  "Ana Beatriz",
  "Bruno Lima",
  "Camila Rocha",
  "Diego Alves",
  "Elisa Prado",
  "Felipe Matos",
  "Gabriela Nunes",
  "Heitor Sá",
  "Isabela Cruz",
  "João Pedro",
  "Kauã Ribeiro",
  "Larissa Melo",
  "Miguel Torres",
  "Nicole Ramos",
  "Otávio Reis",
  "Yasmin Duarte",
  "Bianca Freitas",
  "Caio Barros",
  "Dandara Luz",
  "Enzo Cardoso",
];

export const STORIES = [
  "Quer montar um clube de robótica no espaço maker.",
  "Treina handebol e pede um interclasses.",
  "Lê dois livros por semana e sonha com uma feira do livro.",
  "Toca violão e ensaia em qualquer intervalo.",
  "Desenha murais nos cadernos e quer uma exposição.",
  "Ajuda na horta e quer um jardim comunitário.",
  "Prefere laboratório a quadro-negro.",
  "Organiza o time da turma para os jogos internos.",
  "Cadeirante: depende de rampas e piso tátil para chegar à aula.",
  "Quer um campeonato de xadrez no pátio.",
];

export function phaseFor(minutes: number): "arrival" | "class" | "break" | "lunch" | "activity" | "exit" | "empty" {
  for (const w of PHASE_WINDOWS) {
    if (minutes >= w.start && minutes < w.end) return w.phase as "class" | "break";
  }
  return "empty";
}

export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function lightPhase(minutes: number): "morning" | "afternoon" | "dusk" | "night" {
  if (minutes < 450) return "morning";
  if (minutes < 720) return "morning";
  if (minutes < 900) return "afternoon";
  if (minutes < 1020) return "dusk";
  return "night";
}

export function weatherLabel(weather: Weather): string {
  return weather === "sun" ? "Ensolarado" : weather === "cloud" ? "Nublado" : "Chuva";
}
