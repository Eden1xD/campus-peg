import type { Agent } from "./types";

// The front road is centred at z=-33.2. Both lanes share one crossing.
const farCurb = -37.1;
const nearCurb = -29.3;
const stopLine = 4.5;
const roadEnd = 90;

export function createTraffic() {
  return [
    { x: -40, direction: 1, cruise: 6.5, speed: 6.5, halfLength: 1.95 },
    { x: 30, direction: -1, cruise: 5.1, speed: 5.1, halfLength: 1.1 },
  ];
}

type Traffic = ReturnType<typeof createTraffic>;
const onRoad = (z: number) => z >= farCurb && z <= nearCurb;

function needsCrossing(a: Agent) {
  if (!a.active || !a.visible || Math.abs(a.x) > 4) return false;
  if (onRoad(a.z)) return true;
  const next = a.path[a.pathIndex];
  if (!next) return false;
  return (a.z > nearCurb && a.z <= nearCurb + 3 && next.z < a.z) ||
    (a.z < farCurb && a.z >= farCurb - 3 && next.z > a.z);
}

export function advanceTraffic(cars: Traffic, agents: Agent[], dt: number) {
  const yieldToPeople = agents.some(needsCrossing);
  for (const car of cars) {
    const along = car.direction * car.x;
    const distanceToStop = -stopLine - car.halfLength - along;
    const yielding = yieldToPeople && distanceToStop >= -0.00001;
    const available = Math.max(0, distanceToStop);
    const target = yielding ? Math.min(car.cruise, Math.sqrt(8 * available)) : car.cruise;
    car.speed = Math.max(car.speed - 4 * dt, Math.min(target, car.speed + 2.5 * dt));
    const step = yielding ? Math.min(car.speed * dt, available) : car.speed * dt;
    if (yielding && step >= available) car.speed = 0;
    car.x += car.direction * step;
    if (car.direction * car.x > roadEnd) car.x -= car.direction * 2 * roadEnd;
  }
}

// A car already beyond the stop line finishes its passage before anyone enters.
export function waitAtCurb(cars: Traffic, x: number, z: number, nextZ: number) {
  if (Math.abs(x) > 4 || onRoad(z) || !onRoad(nextZ)) return false;
  return cars.some(car => Math.abs(car.x) < stopLine + car.halfLength - 0.00001);
}
