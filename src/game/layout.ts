import { BUILDABLE_BY_KIND } from "./config";
import type { BuildingInstance, BuildingKind, Furniture, Seat } from "./types";

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  w: number;
  d: number;
}

export function specFor(kind: BuildingKind) {
  const spec = BUILDABLE_BY_KIND[kind];

  if (!spec) {
    throw new Error(
      `Construção não cadastrada: "${String(kind)}".`
    );
  }

  return spec;
}

export function footprintOf(b: Pick<BuildingInstance, "kind" | "x" | "z" | "rot">): Footprint {
  const spec = specFor(b.kind);
  const odd = quarterTurns(b.rot) % 2 === 1;
  const w = odd ? spec.d : spec.w;
  const d = odd ? spec.w : spec.d;
  return { minX: b.x - w / 2, maxX: b.x + w / 2, minZ: b.z - d / 2, maxZ: b.z + d / 2, w, d };
}

export function quarterTurns(rot: number): number {
  return ((Math.round(rot) % 4) + 4) % 4;
}

export function rotateLocal(x: number, z: number, rot: number): { x: number; z: number } {
  const t = quarterTurns(rot);
  if (t === 0) return { x, z };
  if (t === 1) return { x: z, z: -x };
  if (t === 2) return { x: -x, z: -z };
  return { x: -z, z: x };
}

export function doorLocal(kind: BuildingKind, w: number, d: number): { x: number; z: number } {
  const offsetX =
    kind === "classroom" ? -w * 0.18 : kind === "canteen" ? -w * 0.15 : 0;
  return { x: offsetX, z: d / 2 };
}

export function doorWorld(b: Pick<BuildingInstance, "kind" | "x" | "z" | "rot">): { x: number; z: number; nx: number; nz: number } {
  const { w, d } = specFor(b.kind);
  const local = doorLocal(b.kind, w, d);
  // Áreas abertas mantêm o acesso central usado pela simulação.
  const rotated = rotateLocal(local.x, isWalled(b) ? local.z : 0, b.rot);
  const outward = rotateLocal(0, 1, b.rot);
  return { x: b.x + rotated.x, z: b.z + rotated.z, nx: outward.x, nz: outward.z };
}

export function entryPoint(b: Pick<BuildingInstance, "kind" | "x" | "z" | "rot">): { x: number; z: number } {
  const door = doorWorld(b);
  return { x: door.x + door.nx * 1.7, z: door.z + door.nz * 1.7 };
}

export function isWalled(b: Pick<BuildingInstance, "kind">): boolean {
  const spec = specFor(b.kind);
  return !spec.open;
}

/** deterministic pseudo random from a string */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const f = (type: string, x: number, z: number, rot = 0, seat = false, activity?: Furniture["activity"]): Furniture => ({
  id: `${type}-${x.toFixed(2)}-${z.toFixed(2)}-${rot}`,
  type,
  x,
  z,
  rot,
  seat,
  activity,
});

/** furniture is authored in local metres (centre = 0,0, front face/door = +z, lousa/palco = -z).
 * rot: 0 → assento olha para +z, 1 → +x, 2 → -z (frente da sala), 3 → -x. A mesma referência
 * desenha o móvel, posiciona o personagem e define a direção do olhar. */
export function furnitureFor(kind: BuildingKind, w: number, d: number): Furniture[] {
  const items: Furniture[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  const around = (tx: number, tz: number, type: string, act: Furniture["activity"], dx = 1.1, dz = 0.95) => {
    items.push(f(type, tx - dx, tz, 1, true, act));
    items.push(f(type, tx + dx, tz, 3, true, act));
    items.push(f(type, tx, tz - dz, 0, true, act));
    items.push(f(type, tx, tz + dz, 2, true, act));
  };
  switch (kind) {
    case "classroom": {
      items.push(f("whiteboard", 0, -halfD + 0.2, 0));
      items.push(f("teacherDesk", -2.4, -halfD + 1.6, 0));
      items.push(f("teacherChair", -2.4, -halfD + 1.0, 0));
      items.push(f("cabinet", halfW - 0.6, -halfD + 1.0, 3));
      items.push(f("bin", halfW - 0.6, halfD - 0.8, 0));
      items.push(f("clock", 0, -halfD + 0.16, 0));
      items.push(f("fanWall", -halfW + 0.3, 0, 1));
      // duas fileiras duplas com corredor central e acesso lateral; carteiras voltadas à lousa
      const cols = [-4.6, -2.5, 2.5, 4.6];
      const rows = Math.min(5, Math.max(3, Math.floor((d - 4.2) / 1.8)));
      for (let r = 0; r < rows; r += 1) for (const x of cols) items.push(f("desk", x, -halfD + 3.3 + r * 1.75, 2, true, "write"));
      break;
    }
    case "library": {
      // estantes formam corredores; balcão de empréstimo junto à porta; canto de leitura perto da janela
      for (let row = 0; row < 3; row += 1) {
        for (let i = 0; i < 3; i += 1) items.push(f("shelf", -halfW + 1.2 + i * 1.0, -halfD + 1.4 + row * 1.9, 0));
      }
      items.push(f("loanCounter", halfW - 2.2, halfD - 1.4, 2));
      items.push(f("readingLamp", -halfW + 0.8, halfD - 1.0, 0));
      items.push(f("beanbag", -halfW + 1.2, halfD - 1.8, 1, true, "read"));
      items.push(f("beanbag", -halfW + 2.4, halfD - 1.4, 2, true, "read"));
      items.push(f("rug", -halfW + 1.9, halfD - 1.7, 0));
      for (let r = 0; r < 2; r += 1) {
        const tz = -1.2 + r * 3.0;
        items.push(f("readingTable", 2.6, tz, 0));
        around(2.6, tz, "chair", "read", 1.15, 1.0);
      }
      items.push(f("mural", 0, -halfD + 0.18, 0));
      break;
    }
    case "study": {
      items.push(f("planningBoard", 0, -halfD + 0.2, 0));
      for (let i = 0; i < 4; i += 1) {
        const x = -halfW + 1.3 + i * 1.6;
        items.push(f("studyCarrel", x, -halfD + 1.3, 0));
        items.push(f("chair", x, -halfD + 2.0, 2, true, "write"));
      }
      for (let k = 0; k < 2; k += 1) {
        const tx = (k - 0.5) * 4.2;
        items.push(f("groupTable", tx, 1.6, 0));
        around(tx, 1.6, "chair", "write", 1.0, 0.9);
      }
      items.push(f("lowDivider", 0, 0.1, 0));
      break;
    }
    case "canteen": {
      // preparo (fundo) → balcão → retirada → mesas → devolução de bandejas
      items.push(f("stove", -halfW + 1.2, -halfD + 0.7, 0));
      items.push(f("prepCounter", -halfW + 3.0, -halfD + 0.7, 0));
      items.push(f("fridge", -halfW + 4.6, -halfD + 0.7, 0));
      items.push(f("counter", 0.6, -halfD + 2.1, 0));
      items.push(f("sneeze", 0.6, -halfD + 2.45, 0));
      items.push(f("menu", 0, -halfD + 0.16, 0));
      items.push(f("pickup", halfW - 1.6, -halfD + 2.1, 0));
      items.push(f("trayReturn", halfW - 0.7, halfD - 1.6, 3));
      items.push(f("queueStart", -halfW + 1.4, halfD - 0.9, 0));
      for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          const tx = -1.0 + (c - 0.5) * 4.2;
          const tz = 0.3 + r * 2.6;
          items.push(f("diningTable", tx, tz, 0));
          around(tx, tz, "stool", "eat", 1.05, 0.95);
        }
      }
      break;
    }
    case "lab": {
      items.push(f("whiteboard", 0, -halfD + 0.2, 0));
      items.push(f("teacherDesk", 0, -halfD + 1.5, 0));
      for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          const bx = (c - 0.5) * 5.0;
          const bz = 0.2 + r * 3.0;
          items.push(f("labIsland", bx, bz, 0));
          for (let s2 = 0; s2 < 2; s2 += 1) items.push(f("stool", bx - 0.7 + s2 * 1.4, bz + 1.0, 2, true, "write"));
          for (let s2 = 0; s2 < 2; s2 += 1) items.push(f("stool", bx - 0.7 + s2 * 1.4, bz - 1.0, 0, true, "write"));
        }
      }
      items.push(f("fumeHood", halfW - 0.8, -halfD + 1.2, 0));
      items.push(f("glassCabinet", -halfW + 0.6, -halfD + 1.4, 1));
      break;
    }
    case "computer": {
      items.push(f("whiteboard", 0, -halfD + 0.2, 0));
      items.push(f("teacherDesk", -halfW + 2.0, -halfD + 1.4, 0));
      items.push(f("serverRack", halfW - 0.6, -halfD + 0.8, 0));
      for (let r = 0; r < 3; r += 1) {
        const bz = -halfD + 3.1 + r * 2.2;
        for (const side of [-1, 1]) {
          const bx = side * 2.6;
          items.push(f("computerBench", bx, bz, 0));
          for (let s2 = 0; s2 < 3; s2 += 1) items.push(f("chair", bx - 1.3 + s2 * 1.3, bz + 0.8, 2, true, "write"));
        }
      }
      break;
    }
    case "media": {
      items.push(f("acousticPanel", -2, -halfD + 0.15, 0));
      items.push(f("acousticPanel", 2, -halfD + 0.15, 0));
      items.push(f("recordingBooth", halfW - 1.6, -halfD + 1.6, 0));
      for (let i = 0; i < 3; i += 1) {
        const x = -halfW + 1.6 + i * 2.0;
        items.push(f("editStation", x, -0.6, 0));
        items.push(f("chair", x, 0.2, 2, true, "write"));
      }
      items.push(f("micStand", halfW - 1.6, -halfD + 2.6, 0));
      items.push(f("sofa", 0, halfD - 1.0, 2));
      break;
    }
    case "arts": {
      items.push(f("mural", 0, -halfD + 0.18, 0));
      for (let i = 0; i < 4; i += 1) items.push(f("easel", -halfW + 1.5 + i * 2.0, -halfD + 1.8, 2, true, "write"));
      items.push(f("artTable", -0.8, 1.6, 0));
      for (let s2 = 0; s2 < 3; s2 += 1) items.push(f("stool", -2.1 + s2 * 1.3, 2.6, 2, true, "write"));
      items.push(f("paintShelf", halfW - 0.6, 0.6, 3));
      items.push(f("sink", halfW - 0.9, -halfD + 0.8, 0));
      break;
    }
    case "design": {
      items.push(f("referenceBoard", 0, -halfD + 0.18, 0));
      for (let i = 0; i < 2; i += 1) {
        const tx = (i - 0.5) * 4.6;
        items.push(f("draftTable", tx, 0, 0));
        items.push(f("stool", tx - 0.6, 0.9, 2, true, "write"));
        items.push(f("stool", tx + 0.6, 0.9, 2, true, "write"));
      }
      items.push(f("sampleShelf", -halfW + 0.5, 1.2, 1));
      items.push(f("cuttingTable", 0, halfD - 1.4, 0));
      break;
    }
    case "auditorium": {
      items.push(f("stage", 0, -halfD + 2.0, 0));
      items.push(f("curtain", 0, -halfD + 0.6, 0));
      items.push(f("spotlight", -3, -halfD + 3.8, 0));
      items.push(f("spotlight", 3, -halfD + 3.8, 0));
      for (let r = 0; r < 5; r += 1) {
        for (let c = 0; c < 8; c += 1) {
          const x = (c < 4 ? -1 : 1) * (1.2 + (c % 4) * 1.2);
          items.push(f("auditoriumSeat", x, -halfD + 5.0 + r * 1.3, 2, true, "sit"));
        }
      }
      break;
    }
    case "court": {
      for (let i = 0; i < 10; i += 1) {
        items.push(f("spot", (i % 5 - 2) * Math.min(3.2, w / 7), -0.8 + (Math.floor(i / 5) - 0.5) * Math.min(4, d / 3), 0, true, "play"));
      }
      for (let i = 0; i < 6; i += 1) {
        items.push(f("bleacher", (i - 2.5) * Math.min(1.44, (w - 1.6) / 6), halfD - 1.28, 2, true, "sit"));
      }
      items.push(f("hoop", -(halfW - 0.35), -0.8, 1));
      items.push(f("goal", -(halfW - 0.5), -0.8, 1));
      items.push(f("hoop", halfW - 0.35, -0.8, 3));
      items.push(f("goal", halfW - 0.5, -0.8, 3));
      break;
    }
    case "garden": {
      items.push(f("planter", -3.2, 0.5, 0));
      items.push(f("planter", 3.2, 0.5, 0));
      items.push(f("tree", 0, 0.8, 0));
      for (let i = 0; i < 3; i += 1) items.push(f("bench", (i - 1) * 3.1, 2.9, 2, true, "sit"));
      for (let i = 0; i < 3; i += 1) items.push(f("spot", (i - 1) * 2.4, -1.6, 0, true, "play"));
      items.push(f("compost", -halfW + 1.2, halfD - 1.2, 0));
      break;
    }
    case "patio": {
      items.push(f("pergola", 0, 0, 0));
      for (let i = 0; i < 4; i += 1) items.push(f("bench", -4.2, -2.2 + i * 1.7, 1, true, "sit"));
      for (let i = 0; i < 4; i += 1) items.push(f("bench", 4.2, -2.2 + i * 1.7, 3, true, "sit"));
      items.push(f("kiosk", 0, -halfD + 2.4, 0));
      items.push(f("planter", -halfW + 1.6, -halfD + 1.6, 0));
      items.push(f("planter", halfW - 1.6, -halfD + 1.6, 0));
      items.push(f("recycleBins", 1.8, halfD - 1.4, 2));
      items.push(f("drinkingFountain", -1.6, halfD - 1.4, 0));
      items.push(f("gremioBoard", 0, halfD - 0.6, 2));
      for (let i = 0; i < 4; i += 1) items.push(f("spot", (i - 1.5) * 2.2, 1.0, 0, true, "idle"));
      break;
    }
    case "reception": {
      // balcão voltado para a entrada, espera, arquivo e mesa do diretor (abre o gabinete)
      items.push(f("receptionDesk", 0, 0.4, 2));
      items.push(f("mural", 0, -halfD + 0.18, 0));
      items.push(f("archive", -halfW + 0.5, -halfD + 1.2, 1));
      items.push(f("archive", -halfW + 0.5, -halfD + 2.2, 1));
      items.push(f("directorDesk", halfW - 2.0, -halfD + 1.4, 0));
      items.push(f("chair", halfW - 2.0, -halfD + 0.8, 0));
      for (let i = 0; i < 3; i += 1) items.push(f("sofaSeat", -halfW + 1.4 + i * 1.0, halfD - 1.0, 2, true, "sit"));
      items.push(f("plant", halfW - 0.6, halfD - 0.6, 0));
      break;
    }
    case "staffroom": {
      items.push(f("meetingTable", -1.2, 0.2, 0));
      around(-1.2, 0.2, "chair", "idle", 1.5, 0.9);
      items.push(f("lockers", halfW - 0.4, -0.4, 3));
      items.push(f("coffee", -halfW + 0.8, -halfD + 0.7, 0));
      items.push(f("sofa", 2.0, halfD - 1.0, 2));
      items.push(f("scheduleBoard", 0.5, -halfD + 0.18, 0));
      break;
    }
    case "bathroom": {
      // cabines com divisórias e portas no fundo; bancada de cubas e espelho na área comum; cabine acessível com barras
      const stalls = Math.max(2, Math.floor((w - 3.2) / 1.3));
      for (let i = 0; i < stalls; i += 1) {
        const x = -halfW + 0.85 + i * 1.3;
        items.push(f("stall", x, -halfD + 0.95, 0));
        items.push(f("spot", x, -halfD + 2.3, 2, true, "idle"));
      }
      items.push(f("accessibleStall", halfW - 1.3, -halfD + 1.2, 0));
      items.push(f("sinkCounter", -0.6, halfD - 0.7, 2));
      items.push(f("mirror", -0.6, halfD - 0.2, 2));
      items.push(f("tileBand", 0, 0, 0));
      break;
    }
    case "infirmary": {
      items.push(f("bed", -halfW + 1.3, -halfD + 1.6, 0, true, "sit"));
      items.push(f("screenDivider", -halfW + 2.6, -halfD + 1.6, 1));
      items.push(f("chair", 1.0, 0.2, 3, true, "sit"));
      items.push(f("teacherDesk", 1.8, -0.6, 0));
      items.push(f("sink", halfW - 0.7, -halfD + 0.7, 0));
      items.push(f("cabinet", halfW - 0.5, 0.8, 3));
      items.push(f("firstAidSign", 0, -halfD + 0.18, 0));
      break;
    }
    case "makerspace": {
      items.push(f("toolWall", 0, -halfD + 0.18, 0));
      for (let i = 0; i < 2; i += 1) {
        const bx = (i - 0.5) * 5.0;
        items.push(f("workbench", bx, 0, 0));
        items.push(f("stool", bx - 0.7, 0.9, 2, true, "write"));
        items.push(f("stool", bx + 0.7, 0.9, 2, true, "write"));
      }
      items.push(f("printer3d", halfW - 1.1, -halfD + 1.4, 0));
      items.push(f("partsBins", -halfW + 0.6, 1.2, 1));
      items.push(f("readingTable", 0, halfD - 1.6, 0, true, "write"));
      break;
    }
    default:
      break;
  }
  return items;
}

/** Móveis das melhorias compradas para um prédio específico (render + assentos). */
export function upgradeFurniture(b: Pick<BuildingInstance, "kind" | "upgrades">, w: number, d: number): Furniture[] {
  const items: Furniture[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  for (const id of b.upgrades ?? []) {
    if (id === "balcao2" && b.kind === "canteen") items.push(f("counter2", -halfW + 2.2, -halfD + 2.1, 0));
    if (id === "armarios") for (let i = 0; i < 4; i += 1) items.push(f("lockerUnit", -halfW + 0.35, -halfD + 2.6 + i * 0.7, 1));
    if (id === "kitHigiene") for (let i = 0; i < 3; i += 1) items.push(f("dispenser", -2 + i * 1.2, halfD - 0.25, 2));
    if (id === "bancosCobertos") {
      items.push(f("canopy", 0, halfD - 1.2, 0));
      for (let i = 0; i < 4; i += 1) items.push(f("bench", (i - 1.5) * 1.6, halfD - 1.2, 2, true, "sit"));
    }
    if (id === "sinalizacao") items.push(f("sectorSign", halfW - 0.6, halfD + 0.5, 0));
    if (id === "mediacao") {
      items.push(f("mediationTable", -halfW + 1.6, halfD - 1.6, 0));
      items.push(f("chair", -halfW + 1.6 - 0.8, halfD - 1.6, 1));
      items.push(f("chair", -halfW + 1.6 + 0.8, halfD - 1.6, 3));
    }
    if (id === "coberturaQuadra") items.push(f("courtRoof", 0, 0, 0));
    if (id === "climatizacao") items.push(f("acUnit", 0, -halfD + 0.2, 0));
    if (id === "carteirasExtra" && b.kind === "classroom") for (const x of [-4.6, 2.5, 4.6]) items.push(f("desk", x, -halfD + 3.3 + 3 * 1.75, 2, true, "write"));
    if (id === "lousaDigital") items.push(f("smartBoard", 2.6, -halfD + 0.22, 0));
    if (id === "bibliotecaSala") items.push(f("shelf", -halfW + 0.5, halfD - 1.6, 1));
    if (id === "placar") items.push(f("scoreboard", 0, -halfD + 0.4, 0));
    if (id === "palcoMovel") items.push(f("mobileStage", 0, -halfD + 4.6, 0));
    const m = /^(lib|tec|esp|art|aca)(\d)$/.exec(id);
    if (m) {
      const step = Number(m[2]);
      const ex = halfW - 1.4, ez = halfD - 1.4;
      if (m[1] === "lib") {
        if (step === 1) { items.push(f("crates", ex, ez, 0)); items.push(f("cones", ex - 1.2, ez, 0)); }
        if (step === 2) { items.push(f("shelf", halfW - 0.5, -0.6, 3)); items.push(f("shelf", halfW - 0.5, 0.6, 3)); }
        if (step === 3) { items.push(f("bookCart", ex, ez - 1.2, 0)); items.push(f("bookCart", ex - 1.1, ez - 1.2, 0)); }
        if (step === 4) items.push(f("staffBadge", halfW - 2.2, halfD - 0.4, 2));
        if (step === 5) { items.push(f("ribbon", 0, halfD + 1.2, 0)); items.push(f("plaque", 1.6, halfD + 0.2, 0)); items.push(f("balloons", -1.8, halfD + 1.0, 0)); }
      } else if (m[1] === "tec") {
        if (step === 1) items.push(f("crates", ex, ez, 0));
        if (step === 2) items.push(f("robotKit", ex, ez - 1.0, 0));
        if (step === 3) items.push(f("banner", 0, halfD + 0.2, 0));
        if (step === 4) items.push(f("trophyCase", -halfW + 0.6, halfD - 1.0, 1));
      } else if (m[1] === "esp") {
        if (step === 1) items.push(f("cones", -halfW + 1.5, halfD - 1.2, 0));
        if (step === 3) items.push(f("teamFlag", halfW - 1.0, halfD - 0.6, 0));
        if (step === 4) items.push(f("trophyCase", -halfW + 1.0, halfD - 0.8, 0));
      } else if (m[1] === "art") {
        if (step === 1) items.push(f("artPanel", ex, ez, 0));
        if (step === 2) items.push(f("artPanel", ex - 1.3, ez, 0));
        if (step === 3) items.push(f("bannerArt", 0, halfD + 0.2, 0));
        if (step === 4) items.push(f("balloons", ex - 2.4, ez, 0));
      } else if (m[1] === "aca") {
        if (step === 1) items.push(f("goalsBoard", halfW - 0.3, 0, 3));
        if (step === 2) items.push(f("handouts", 2.4, -halfD + 1.6, 0));
        if (step === 4) items.push(f("plaque", 1.6, halfD + 0.2, 0));
      }
    }
  }
  return items;
}

function furnitureWorldPosition(b: BuildingInstance, item: Furniture): { x: number; z: number; rot: number } {
  // A cadeira integrada à carteira fica 62 cm atrás do centro do tampo.
  const offset = rotateLocal(0, item.type === "desk" ? -0.62 : 0, item.rot);
  const rotated = rotateLocal(item.x + offset.x, item.z + offset.z, b.rot);
  return { x: b.x + rotated.x, z: b.z + rotated.z, rot: quarterTurns(b.rot + item.rot) };
}

export function seatsForBuilding(b: BuildingInstance): Seat[] {
  if (b.progress < 1) return [];
  const { w, d } = specFor(b.kind);
  const base = furnitureFor(b.kind, w, d);
  const furniture = [...base, ...upgradeFurniture(b, w, d)];
  const seats: Seat[] = [];
  furniture.forEach((item, index) => {
    if (!item.seat) return;
    const upgradeItem = index >= base.length;
    const world = furnitureWorldPosition(b, item);
    // face the seat toward the front of the room
    const facing = rotateLocal(0, 1, quarterTurns(b.rot + item.rot));
    const heading = Math.atan2(facing.x, facing.z);
    seats.push({
      // móveis-base mantêm a chave por índice (saves antigos); móveis de melhorias usam chave estável por id
      key: upgradeItem ? `${b.id}:up:${item.id}` : `${b.id}:seat:${index}`,
      buildingId: b.id,
      kind: b.kind,
      x: world.x,
      z: world.z,
      rot: heading,
      activity: item.activity ?? "sit",
      label: `${specFor(b.kind).name} · lugar ${seats.length + 1}`,
    });
  });
  return seats;
}

export function allSeats(buildings: BuildingInstance[]): Seat[] {
  return buildings.flatMap((b) => seatsForBuilding(b));
}

export function servicePoints(b: BuildingInstance): { x: number; z: number }[] {
  const door = entryPoint(b);
  if (b.kind !== "canteen") return [door];
  const points: { x: number; z: number }[] = [];
  for (let i = 0; i < 8; i += 1) {
    const offset = rotateLocal(1.2 + i * 0.95, -0.4 - (i % 2) * 0.35, b.rot);
    points.push({ x: door.x + offset.x, z: door.z + offset.z });
  }
  return points;
}

export function constructionSite(b: BuildingInstance): { x: number; z: number } {
  const door = entryPoint(b);
  const offset = rotateLocal(1.2, 1.2, b.rot);
  return { x: door.x + offset.x, z: door.z + offset.z };
}

// ------------------------------------------------------------------ paredes encostadas e área da porta
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
/** Área que precisa ficar livre em frente à porta (2,2 m de largura × 2 m de profundidade). */
export function doorZone(b: Pick<BuildingInstance, "kind" | "x" | "z" | "rot">): Rect {
  const door = doorWorld(b);
  const half = 1.1;
  const depth = 2.0;
  const ax = door.x + door.nx * depth;
  const az = door.z + door.nz * depth;
  return {
    minX: Math.min(door.x, ax) - (door.nx === 0 ? half : 0.02),
    maxX: Math.max(door.x, ax) + (door.nx === 0 ? half : 0.02),
    minZ: Math.min(door.z, az) - (door.nz === 0 ? half : 0.02),
    maxZ: Math.max(door.z, az) + (door.nz === 0 ? half : 0.02),
  };
}
export function rectOverlap(a: Rect, b: Rect) {
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.05 && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0.05;
}
export interface SharedSides { front: boolean; back: boolean; left: boolean; right: boolean }
/** Lados (locais) em que este prédio encosta em outro prédio fechado: sem janelas, frisos ou laje sobrando. */
export function sharedSides(b: BuildingInstance, all: BuildingInstance[]): SharedSides {
  const out: SharedSides = { front: false, back: false, left: false, right: false };
  if (!isWalled(b)) return out;
  const fp = footprintOf(b);
  const local: Record<string, keyof SharedSides> = {};
  const map: [number, number, keyof SharedSides][] = [[0, 1, "front"], [0, -1, "back"], [-1, 0, "left"], [1, 0, "right"]];
  for (const [lx, lz, name] of map) {
    const w = rotateLocal(lx, lz, b.rot);
    local[`${Math.round(w.x)},${Math.round(w.z)}`] = name;
  }
  for (const o of all) {
    if (o.id === b.id || !isWalled(o) || o.kind === "path" || o.kind === "tactile") continue;
    const ofp = footprintOf(o);
    const ovX = Math.min(fp.maxX, ofp.maxX) - Math.max(fp.minX, ofp.minX);
    const ovZ = Math.min(fp.maxZ, ofp.maxZ) - Math.max(fp.minZ, ofp.minZ);
    if (Math.abs(fp.maxX - ofp.minX) < 0.06 && ovZ > 0.8) out[local["1,0"]] = true;
    if (Math.abs(fp.minX - ofp.maxX) < 0.06 && ovZ > 0.8) out[local["-1,0"]] = true;
    if (Math.abs(fp.maxZ - ofp.minZ) < 0.06 && ovX > 0.8) out[local["0,1"]] = true;
    if (Math.abs(fp.minZ - ofp.maxZ) < 0.06 && ovX > 0.8) out[local["0,-1"]] = true;
  }
  return out;
}
