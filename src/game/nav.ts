import { GATE, PLOT } from "./config";
import { footprintOf, isWalled, doorWorld } from "./layout";
import type { BuildingInstance, Vec2 } from "./types";

export const CELL = 1;

export interface Rect4 { minX: number; maxX: number; minZ: number; maxZ: number }
let ownedRects: Rect4[] = [{ minX: -30, maxX: 30, minZ: -23, maxZ: 30 }];
/** Parcelas compradas: fora delas a grade é bloqueada (o muro acompanha esses limites). */
export function setOwnedParcels(rects: Rect4[]) { ownedRects = rects.length ? rects : ownedRects; }
export function getOwnedParcels() { return ownedRects; }
export function ownedContains(x: number, z: number) {
  return ownedRects.some((r) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ);
}
export interface NavGrid {
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  blocked: Uint8Array;
  accessible: Uint8Array;
  inside: Uint8Array;
}

export function buildNavGrid(buildings: BuildingInstance[]): NavGrid {
  const cols = Math.round((PLOT.maxX - PLOT.minX) / CELL);
  const rows = Math.round((PLOT.maxZ - PLOT.minZ) / CELL);
  const blocked = new Uint8Array(cols * rows);
  const accessible = new Uint8Array(cols * rows);
  const inside = new Uint8Array(cols * rows);
  accessible.fill(1);

  const idx = (i: number, j: number) => j * cols + i;

  // fence along the street side, open only at the gate
  for (let i = 0; i < cols; i += 1) {
    const x = PLOT.minX + i + 0.5;
    if (Math.abs(x - GATE.x) > 2.4) blocked[idx(i, 0)] = 1;
  }

  for (const b of buildings) {
    const fp = footprintOf(b);
    const walled = isWalled(b);
    if (b.progress < 1 && b.kind !== "path" && b.kind !== "tactile") {
      // obra e reforma isoladas por tapume: ninguém atravessa
      const fi = Math.ceil((fp.minX - PLOT.minX) / CELL - 0.5), li = Math.floor((fp.maxX - PLOT.minX) / CELL - 0.5);
      const fj = Math.ceil((fp.minZ - PLOT.minZ) / CELL - 0.5), lj = Math.floor((fp.maxZ - PLOT.minZ) / CELL - 0.5);
      for (let j = Math.max(0, fj); j <= Math.min(rows - 1, lj); j++) for (let i = Math.max(0, fi); i <= Math.min(cols - 1, li); i++) {
        blocked[idx(i, j)] = 1; accessible[idx(i, j)] = 0; inside[idx(i, j)] = 1;
      }
      continue;
    }
    const door = walled ? doorWorld(b) : null;
    // Uma célula pertence ao prédio quando seu centro está no perímetro.
    const firstI = Math.ceil((fp.minX - PLOT.minX) / CELL - 0.5);
    const lastI = Math.floor((fp.maxX - PLOT.minX) / CELL - 0.5);
    const firstJ = Math.ceil((fp.minZ - PLOT.minZ) / CELL - 0.5);
    const lastJ = Math.floor((fp.maxZ - PLOT.minZ) / CELL - 0.5);
    for (let j = Math.max(0, firstJ); j <= Math.min(rows - 1, lastJ); j++) {
      for (let i = Math.max(0, firstI); i <= Math.min(cols - 1, lastI); i++) {
        const k = idx(i, j);
        inside[k] = 1;
        if (!door) continue;
        const x = PLOT.minX + (i + 0.5) * CELL;
        const z = PLOT.minZ + (j + 0.5) * CELL;
        const edge = i === firstI || i === lastI || j === firstJ || j === lastJ;
        const onFront = door.nx > 0 ? i === lastI : door.nx < 0 ? i === firstI
          : door.nz > 0 ? j === lastJ : j === firstJ;
        const across = (x - door.x) * door.nz - (z - door.z) * door.nx;
        if (edge && !(onFront && Math.abs(across) <= 0.75)) {
          blocked[k] = 1;
          accessible[k] = 0;
        } else if (!b.accessible) {
          accessible[k] = 0;
        }
      }
    }
  }

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (!ownedContains(PLOT.minX + i + 0.5, PLOT.minZ + j + 0.5)) {
        blocked[idx(i, j)] = 1;
        accessible[idx(i, j)] = 0;
      }
    }
  }
  // keep a walkable strip at the gate so nobody spawns inside a wall
  for (let j = 0; j <= 2; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = PLOT.minX + i + 0.5;
      if (Math.abs(x - GATE.x) <= 2.4) blocked[idx(i, j)] = 0;
    }
  }

  return { cols, rows, minX: PLOT.minX, minZ: PLOT.minZ, blocked, accessible, inside };
}

export function toCell(grid: NavGrid, x: number, z: number): { i: number; j: number } {
  return {
    i: Math.max(0, Math.min(grid.cols - 1, Math.floor(x - grid.minX))),
    j: Math.max(0, Math.min(grid.rows - 1, Math.floor(z - grid.minZ))),
  };
}

export function toWorld(grid: NavGrid, i: number, j: number): Vec2 {
  return { x: grid.minX + i + 0.5, z: grid.minZ + j + 0.5 };
}

export function cellBlocked(grid: NavGrid, i: number, j: number, accessibleOnly: boolean): boolean {
  if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return true;
  const k = j * grid.cols + i;
  if (grid.blocked[k]) return true;
  if (accessibleOnly && !grid.accessible[k]) return true;
  return false;
}

export function nearestWalkable(grid: NavGrid, x: number, z: number, accessibleOnly = false): { i: number; j: number } | null {
  const start = toCell(grid, x, z);
  if (!cellBlocked(grid, start.i, start.j, accessibleOnly)) return start;
  for (let r = 1; r <= 8; r += 1) {
    for (let di = -r; di <= r; di += 1) {
      for (let dj = -r; dj <= r; dj += 1) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = start.i + di;
        const j = start.j + dj;
        if (!cellBlocked(grid, i, j, accessibleOnly)) return { i, j };
      }
    }
  }
  return null;
}

interface Node {
  i: number;
  j: number;
  g: number;
  f: number;
  parent: number;
}

export interface PathResult {
  points: Vec2[];
  reachable: boolean;
  expanded: number;
}

/**
 * A* with 8-dir movement. Wheelchair agents restrict to accessible cells, so a
 * missing ramp produces a genuine "no route" instead of a cosmetic warning.
 */
export function findPath(
  grid: NavGrid,
  from: Vec2,
  to: Vec2,
  options: { accessibleOnly?: boolean; maxExpanded?: number } = {},
): PathResult {
  const accessibleOnly = options.accessibleOnly ?? false;
  const start = nearestWalkable(grid, from.x, from.z, accessibleOnly);
  const targetCell = toCell(grid, to.x, to.z);
  if (accessibleOnly && grid.inside[targetCell.j * grid.cols + targetCell.i] &&
      !grid.accessible[targetCell.j * grid.cols + targetCell.i]) {
    return { points: [], reachable: false, expanded: 0 };
  }
  const goal = nearestWalkable(grid, to.x, to.z, accessibleOnly);
  if (!start || !goal) return { points: [], reachable: false, expanded: 0 };
  const target = walkableAt(grid, to.x, to.z, accessibleOnly) ? { ...to } : toWorld(grid, goal.i, goal.j);
  if (start.i === goal.i && start.j === goal.j) {
    return { points: [target], reachable: true, expanded: 1 };
  }

  const total = grid.cols * grid.rows;
  const gScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const startIdx = start.j * grid.cols + start.i;
  const goalIdx = goal.j * grid.cols + goal.i;
  const heuristic = (i: number, j: number) => {
    const dx = Math.abs(i - goal.i);
    const dz = Math.abs(j - goal.j);
    return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  gScore[startIdx] = 0;
  // fila de prioridade (heap binário): o mapa ampliado tem 4× mais células
  const heapIdx: number[] = [startIdx];
  const heapF: number[] = [heuristic(start.i, start.j)];
  const push = (k: number, f: number) => {
    let i = heapIdx.length;
    heapIdx.push(k); heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapIdx[p], heapIdx[i]] = [heapIdx[i], heapIdx[p]];
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heapIdx[0];
    const lastK = heapIdx.pop()!, lastF = heapF.pop()!;
    if (heapIdx.length) {
      heapIdx[0] = lastK; heapF[0] = lastF;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heapIdx.length && heapF[l] < heapF[m]) m = l;
        if (r < heapIdx.length && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        [heapIdx[m], heapIdx[i]] = [heapIdx[i], heapIdx[m]];
        [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
        i = m;
      }
    }
    return top;
  };
  const maxExpanded = options.maxExpanded ?? 30000;
  let expanded = 0;
  while (heapIdx.length > 0 && expanded < maxExpanded) {
    const cIdx = pop();
    if (closed[cIdx]) continue;
    closed[cIdx] = 1;
    expanded += 1;
    const cj = Math.floor(cIdx / grid.cols);
    const ci = cIdx - cj * grid.cols;
    if (cIdx === goalIdx) {
      const cells: Vec2[] = [];
      let walk = cIdx;
      while (walk !== -1) {
        const j = Math.floor(walk / grid.cols);
        const i = walk - j * grid.cols;
        cells.push(toWorld(grid, i, j));
        walk = cameFrom[walk];
      }
      cells.reverse();
      const points = simplify(cells);
      const last = points[points.length - 1];
      if (target.x !== last.x || target.z !== last.z) points.push(target);
      return { points, reachable: true, expanded };
    }
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        if (di === 0 && dj === 0) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (cellBlocked(grid, ni, nj, accessibleOnly)) continue;
        if (di !== 0 && dj !== 0) {
          if (cellBlocked(grid, ci + di, cj, accessibleOnly)) continue;
          if (cellBlocked(grid, ci, cj + dj, accessibleOnly)) continue;
        }
        const nIdx = nj * grid.cols + ni;
        if (closed[nIdx]) continue;
        const tentative = gScore[cIdx] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
        if (tentative < gScore[nIdx]) {
          gScore[nIdx] = tentative;
          cameFrom[nIdx] = cIdx;
          push(nIdx, tentative + heuristic(ni, nj));
        }
      }
    }
  }
  return { points: [], reachable: false, expanded };
}

function simplify(cells: Vec2[]): Vec2[] {
  if (cells.length <= 2) return cells;
  const out: Vec2[] = [cells[0]];
  for (let k = 1; k < cells.length - 1; k += 1) {
    const prev = cells[k - 1];
    const cur = cells[k];
    const next = cells[k + 1];
    const dx1 = Math.round(cur.x - prev.x);
    const dz1 = Math.round(cur.z - prev.z);
    const dx2 = Math.round(next.x - cur.x);
    const dz2 = Math.round(next.z - cur.z);
    if (dx1 !== dx2 || dz1 !== dz2) out.push(cur);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

export function walkableAt(grid: NavGrid, x: number, z: number, accessibleOnly = false): boolean {
  if (!(x >= grid.minX && x < grid.minX + grid.cols * CELL &&
        z >= grid.minZ && z < grid.minZ + grid.rows * CELL)) return false;
  const { i, j } = toCell(grid, x, z);
  return !cellBlocked(grid, i, j, accessibleOnly);
}


// The regular campus grid still bounds building placement and the player's movement.
const departureGrids = new WeakMap<NavGrid, NavGrid>();

export function neighborhoodHome(index: number): Vec2 {
  const left = index % 2 === 0;
  const road = left ? PLOT.minX - 12 : PLOT.maxX + 12;
  const z = -24 + Math.floor(index / 2) * ((PLOT.maxZ + 26) / 4);
  // Door at local (1.9, 3.24), rotated toward the street. Stop on the doorstep.
  return { x: road + (left ? -7.55 : 7.55), z: z + (left ? -1.9 : 1.9) };
}

export function departureGrid(campus: NavGrid): NavGrid {
  const cached = departureGrids.get(campus);
  if (cached) return cached;
  const minX = campus.minX - 24;
  const minZ = Math.min(campus.minZ, -42);
  const cols = campus.cols + 48;
  const rows = campus.rows + Math.round(campus.minZ - minZ) + 8;
  const blocked = new Uint8Array(cols * rows).fill(1);
  const accessible = new Uint8Array(cols * rows);
  const inside = new Uint8Array(cols * rows);
  const grid = { cols, rows, minX, minZ, blocked, accessible, inside };
  const walks = [PLOT.minX - 16.55, PLOT.maxX + 16.55];
  const homes = Array.from({ length: 10 }, (_, index) => neighborhoodHome(index));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const { x, z } = toWorld(grid, i, j);
      const k = j * cols + i;
      if (x >= campus.minX && x < campus.minX + campus.cols &&
          z >= campus.minZ && z < campus.minZ + campus.rows) {
        const cell = toCell(campus, x, z);
        const source = cell.j * campus.cols + cell.i;
        blocked[k] = campus.blocked[source];
        accessible[k] = campus.accessible[source];
        inside[k] = campus.inside[source];
        continue;
      }
      const crossing = Math.abs(x - GATE.x) <= 1.75 && z <= campus.minZ && z >= -39.7;
      const farSidewalk = Math.abs(z + 39) <= 1.6 && x >= walks[0] - 1 && x <= walks[1] + 1;
      const sideStreet = z >= -39.5 && z <= PLOT.maxZ + 4 &&
        walks.some((walk) => Math.abs(x - walk) <= 1.15);
      const doorstep = homes.some((home, index) => Math.abs(z - home.z) <= 0.85 &&
        x >= Math.min(home.x, walks[index % 2]) - 0.55 &&
        x <= Math.max(home.x, walks[index % 2]) + 0.55);
      if (crossing || farSidewalk || sideStreet || doorstep) {
        blocked[k] = 0;
        accessible[k] = 1;
      }
    }
  }
  departureGrids.set(campus, grid);
  return grid;
}
