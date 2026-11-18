import type { IconName } from "../types";

// Cada desenho usa a mesma grade e herda a cor do controle.
const PATHS: Record<IconName, string> = {
  school: "M3 20h18 M5 20V10l7-6 7 6v10 M10 20v-5h4v5 M12 8v2",
  build: "m4 9 6-6 5 1 4 4-3 3-4-4-2 2 M10 9l2 2-7 9-3-3 8-8 M13 8l2 2",
  students: "M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M5 20v-1a7 5 0 0 1 14 0v1 M18 5a3 3 0 0 1 0 6 M19 14q3 1 3 4",
  staff: "M9 5H5v15h14V5h-4 M10 3h4v4h-4z M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z M8 17q4-4 8 0",
  schedule: "M5 5h14q1 0 1 2v12q0 1-1 1H5q-1 0-1-1V7q0-2 1-2Z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2",
  finance: "M20 8H6a2 2 0 0 1 0-4h12v4 M4 6v12a2 2 0 0 0 2 2h14V8 M20 12h-4a2 2 0 0 0 0 4h4",
  missions: "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 13l3 3 5-6",
  settings: "M4 7h7m5 0h4 M4 17h2m5 0h9 M16 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0Z M11 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0Z",
  camera: "m12 3 8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9",
  photo: "M4 7h4l2-3h4l2 3h4q1 0 1 2v9q0 2-2 2H5q-2 0-2-2V9q0-2 1-2Z M16 13a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z",
  firstperson: "M8 4H4v4m12-4h4v4 M4 16v4h4m12-4v4h-4 M12 9v6m-3-3h6",
  layers: "m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  access: "M13 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0Z M11 9v5h5l3 5 2-1 M8 11a5 5 0 1 0 6 7",
  spark: "m10 5 1.8 5.2L17 12l-5.2 1.8L10 19l-1.8-5.2L3 12l5.2-1.8z M18 3v5m-2.5-2.5h5",
  close: "m6 6 12 12 M18 6 6 18",
  play: "m7 4 13 8-13 8z",
  pause: "M8 5v14 M16 5v14",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0Z M12 7v5l3 2",
  weather: "M5 18a3 3 0 1 1 1-6 4 4 0 0 1 8-1 3.5 3.5 0 1 1 1 7Z M14 6a4 4 0 0 1 5 6 M17 3v1 M21 6l1-1",
  coin: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0Z M15 9h-4a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9 M12 7v2m0 6v2",
  heart: "M12 20 4.5 13a5 5 0 0 1 7.5-7 5 5 0 0 1 7.5 7Z",
  map: "m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14",
  eye: "M2 12q10-14 20 0-10 14-20 0Z M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0Z",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5m4-5v5",
  rotate: "M20 10a8 8 0 1 0-1 8 M20 4v6h-6",
  move: "M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3",
  check: "m4 12 5 5L20 6",
  warning: "m12 3 10 17H2z M12 9v5m0 3v.1",
  arrow: "M4 12h15 M13 6l6 6-6 6",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z M12 2v2m0 16v2 M2 12h2m16 0h2 M5 5l1.5 1.5m11 11L19 19 M19 5l-1.5 1.5m-11 11L5 19",
  rain: "M6 14a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1A3.5 3.5 0 1 1 17 14Z M8 17l-1 3m6-3-1 3m6-3-1 3",
  cloud: "M7 18a4.5 4.5 0 0 1-.5-9A5.5 5.5 0 0 1 17 10a4 4 0 0 1 0 8Z",
  volume: "M3 9h4l5-4v14l-5-4H3z M15 8a5 5 0 0 1 0 8 M18 5a9 9 0 0 1 0 14",
  save: "M4 4h12l4 4v12H4z M8 4v6h7V4 M8 20v-6h8v6",
  download: "M12 3v12m-5-5 5 5 5-5 M4 16v4h16v-4",
  upload: "M12 16V4m-5 5 5-5 5 5 M4 16v4h16v-4",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H4v2a4 4 0 0 0 4 4 M16 6h4v2a4 4 0 0 1-4 4 M12 13v6m-4 1h8",
  cleaning: "m18 3-7 9 M8 10l6 5-4 6-7-5z M5 17l3-4m0 6 3-4",
  energy: "m13 2-9 12h7l-1 8 10-13h-7z",
  queue: "m3 7 9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M7.5 5l9 4",
  grid: "M3 3h18v18H3z M9 3v18m6-18v18 M3 9h18M3 15h18",
  walk: "M15 5a1.7 1.7 0 1 1-3.4 0A1.7 1.7 0 1 1 15 5Z M8 12l3-4 3 1 2 4 3 1 M12 9l-2 6 4 3 1 3 M10 15l-4 6",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 16 ? 1.9 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
