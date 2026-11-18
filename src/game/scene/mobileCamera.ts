type CameraView = {
  yaw: number; pitch: number; distance: number;
  targetX: number; targetZ: number; lookYaw: number; lookPitch: number;
};
type Point = { x: number; y: number };
type Finger = { start: Point; point: Point; startedAt: number; role: "walk" | "look"; dragged: boolean };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const span = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Defer the scene's pointerdown selection until a completed single-finger tap.
export const mobileTapEvents = new WeakSet<Event>();

export function bindMobileCamera(canvas: HTMLCanvasElement, first: boolean, view: CameraView,
  axis: Point, saveView: () => void) {
  const fingers = new Map<number, Finger>();
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  let multi = false;
  let blockClickUntil = 0;
  let skipClickForPointer: number | null = null;
  const pad = document.createElement("div");
  const thumb = document.createElement("span");
  pad.setAttribute("aria-hidden", "true");
  pad.style.cssText = "display:none;pointer-events:none;position:fixed;width:84px;height:84px;border:2px solid white;border-radius:50%;background:#33234688;transform:translate(-50%,-50%);z-index:5";
  thumb.style.cssText = "position:absolute;left:25px;top:25px;width:34px;height:34px;background:#eee5ff;border-radius:50%";
  pad.append(thumb);
  document.body.append(pad);
  function reset() {
    for (const id of Array.from(fingers.keys())) {
      fingers.delete(id);
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    multi = false;
    axis.x = axis.y = 0;
    pad.style.display = "none";
  }
  function handle(e: PointerEvent) {
    if (e.pointerType !== "touch" || mobileTapEvents.has(e)) return;
    const point = { x: e.clientX, y: e.clientY };
    const down = e.type === "pointerdown";
    if (!down && !fingers.has(e.pointerId)) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
    if (down) {
      const rect = canvas.getBoundingClientRect();
      const walk = first && point.x < rect.left + rect.width * 0.46 &&
        !Array.from(fingers.values()).some(f => f.role === "walk");
      fingers.set(e.pointerId, { start: point, point, startedAt: e.timeStamp, role: walk ? "walk" : "look", dragged: false });
      multi ||= fingers.size > 1;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // The browser can cancel a touch before granting capture.
        fingers.delete(e.pointerId);
        if (!fingers.size) multi = false;
      }
      return;
    }
    const f = fingers.get(e.pointerId)!;
    const prev = f.point;
    f.dragged ||= span(f.start, point) > 8;
    f.point = point;
    const dx = point.x - prev.x, dy = point.y - prev.y;
    if (e.type === "pointermove") {
      if (first && f.role === "walk" && f.dragged) {
        const x = point.x - f.start.x, y = point.y - f.start.y;
        const r = Math.max(42, Math.hypot(x, y));
        axis.x = x/r; axis.y = -y/r;
        pad.style.display = "block"; pad.style.left = f.start.x+"px"; pad.style.top = f.start.y+"px";
        thumb.style.transform = `translate(${axis.x*23}px,${-axis.y*23}px)`;
      } else if (!first && fingers.size === 2) {
        const other = Array.from(fingers.values()).find(v => v !== f)!.point;
        const oldSpan = span(prev, other), newSpan = span(point, other);
        if (Math.min(oldSpan, newSpan) > 12) view.distance = clamp(view.distance * oldSpan/newSpan, 10, 105);
        const k = view.distance / Math.max(260, canvas.clientHeight);
        view.targetX = clamp(view.targetX - (dx*Math.cos(view.yaw)+dy*Math.sin(view.yaw))*k/2, -40, 40);
        view.targetZ = clamp(view.targetZ + (dx*Math.sin(view.yaw)-dy*Math.cos(view.yaw))*k/2, -36, 36);
      } else if (f.role === "look" && f.dragged && (first || fingers.size === 1)) {
        const k = 2.7 / Math.max(320, Math.min(canvas.clientWidth, canvas.clientHeight));
        if (first) {
          { const st = (globalThis as { __pegSim?: { world: { settings: { sensitivity?: number; invertY?: boolean } } } }).__pegSim?.world.settings; const sk = k * (st?.sensitivity ?? 1); view.lookYaw -= dx*sk; view.lookPitch = clamp(view.lookPitch-dy*sk*.8*(st?.invertY ? -1 : 1), -1.15, 1.1); }
        } else {
          view.yaw -= dx*k; view.pitch = clamp(view.pitch+dy*k*.7, .24, 1.35);
        }
      }
      return;
    }
    fingers.delete(e.pointerId);
    const tap = e.type === "pointerup" && !multi && !f.dragged && e.timeStamp - f.startedAt <= 400;
    if (!first && fingers.size === 1) {
      const remaining = fingers.values().next().value;
      if (remaining) {
        remaining.start = remaining.point;
        remaining.dragged = false;
      }
    }
    skipClickForPointer = tap ? null : e.pointerId;
    blockClickUntil = tap ? 0 : performance.now()+550;
    if (f.role === "walk") { axis.x = axis.y = 0; pad.style.display = "none"; }
    if (!fingers.size) { multi = false; if (!first && !tap) saveView(); }
    if (tap) {
      for (const type of ["pointerdown","pointerup"]) {
        const next = new PointerEvent(type, {bubbles:true, cancelable:true, pointerId:e.pointerId,
          pointerType:"touch", isPrimary:true, button:0, buttons:type==="pointerdown"?1:0,
          clientX:e.clientX,clientY:e.clientY});
        mobileTapEvents.add(next); canvas.dispatchEvent(next);
      }
    }
  }
  function click(e: MouseEvent) {
    if (e instanceof PointerEvent && e.pointerType &&
        (e.pointerType !== "touch" || e.pointerId !== skipClickForPointer)) return;
    if (performance.now() < blockClickUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  const types = ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture"] as const;
  for (const t of types) canvas.addEventListener(t,handle,{capture:true,passive:false});
  canvas.addEventListener("click",click,true);
  window.addEventListener("blur",reset); document.addEventListener("visibilitychange",reset);
  return () => {
    reset(); pad.remove(); canvas.style.touchAction = previousTouchAction;
    for (const t of types) canvas.removeEventListener(t,handle,true);
    canvas.removeEventListener("click",click,true);
    window.removeEventListener("blur",reset); document.removeEventListener("visibilitychange",reset);
  };
}
