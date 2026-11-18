"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import styles from "./game.module.css";

const mobile = "(hover: none) and (pointer: coarse)";
function subscribe(update: () => void) {
  const query = window.matchMedia(mobile);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
function mode() {
  if (window.parent !== window && window.name === "campus-peg-landscape") return "game";
  return window.matchMedia(mobile).matches ? "landscape" : "game";
}
function pending() { return "pending"; }

export function MobileLandscape({children}: {children: ReactNode}) {
  const screen = useSyncExternalStore(subscribe, mode, pending);
  if (screen === "pending") return null;
  if (screen === "game") return <>{children}</>;
  const gameUrl = new URL(window.location.href);
  gameUrl.searchParams.set("pegView", "landscape");
  return (
    <div className={styles.campusViewport}>
      <iframe className={styles.campusFrame} name="campus-peg-landscape"
        title="Campus PEG" src={gameUrl.href} allow="fullscreen; autoplay" />
    </div>
  );
}
