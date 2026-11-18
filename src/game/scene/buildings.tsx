"use client";

import { useRef } from "react";
import type {} from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GeoBuilder } from "../geometry";
import { BUILDABLE_BY_KIND } from "../config";
import { buildingStage } from "../sim";
import { furnitureFor, specFor, upgradeFurniture, type SharedSides } from "../layout";
import type { BuildingInstance, BuildingKind, Furniture } from "../types";

const WHITE = "#f2efe6";
let benchColor = "#b9855c";
const PURPLE = "#6d4aa8";
const DARK = "#3a3f47";

interface Decor {
  text: string;
  sub?: string;
  pos: [number, number, number];
  rot: [number, number, number];
  w: number;
  h: number;
  bg: string;
  color: string;
  border?: string;
}

function furnMatrix(item: Furniture) {
  return (item.rot * Math.PI) / 2;
}

function addFurniture(builder: GeoBuilder, item: Furniture, quality: number): Decor[] {
  const decor: Decor[] = [];
  const r = furnMatrix(item);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const at = (x: number, y: number, z: number): [number, number, number] => [
    item.x + x * cos + z * sin, y, item.z - x * sin + z * cos,
  ];
  const box = (mat: string, size: [number, number, number], pos: [number, number, number], rotX = 0) =>
    builder.box(mat, size, at(...pos), { rotY: r, rotX, tile: 1.2 });
  const cyl = (mat: string, radius: number, height: number, pos: [number, number, number], segments = 10) =>
    builder.cylinder(mat, radius, radius, height, at(...pos), { rotY: r, segments });

  switch (item.type) {
    case "desk": {
      box("wood", [1.15, 0.06, 0.58], [0, 0.73, 0]);
      for (const [lx, lz] of [
        [-0.5, -0.23],
        [0.5, -0.23],
        [-0.5, 0.23],
        [0.5, 0.23],
      ])
        box("metal", [0.05, 0.72, 0.05], [lx, 0.36, lz]);
      box("wood", [1.0, 0.24, 0.03], [0, 0.6, 0.27]);
      if (quality > 0) {
        box("#e8dcc0", [0.3, 0.02, 0.22], [-0.22, 0.77, 0.02]);
        box("#d8735b", [0.02, 0.02, 0.16], [0.28, 0.77, 0.04]);
      }
      // chair
      box("#c49a66", [0.46, 0.06, 0.46], [0, 0.45, -0.62]);
      box("#c49a66", [0.46, 0.52, 0.05], [0, 0.72, -0.85]);
      for (const [lx, lz] of [
        [-0.2, -0.42],
        [0.2, -0.42],
        [-0.2, -0.82],
        [0.2, -0.82],
      ])
        box("metal", [0.035, 0.44, 0.035], [lx, 0.22, lz]);
      break;
    }
    case "chair": {
      box("wood", [0.44, 0.06, 0.44], [0, 0.44, 0]);
      box("wood", [0.44, 0.46, 0.05], [0, 0.68, -0.2]);
      for (const [lx, lz] of [
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ])
        box("metal", [0.035, 0.42, 0.035], [lx, 0.22, lz]);
      break;
    }
    case "stool": {
      cyl("#b9865b", 0.22, 0.06, [0, 0.56, 0], 12);
      for (let k = 0; k < 3; k += 1) {
        const a = (k / 3) * Math.PI * 2;
        box("metal", [0.035, 0.55, 0.035], [Math.cos(a) * 0.15, 0.28, Math.sin(a) * 0.15]);
      }
      break;
    }
    case "whiteboard": {
      box(WHITE, [3.4, 1.35, 0.06], [0, 1.85, 0.02]);
      box("metal", [3.55, 0.06, 0.09], [0, 2.55, 0.02]);
      box("metal", [3.55, 0.06, 0.09], [0, 1.15, 0.02]);
      box("#c9ced6", [0.5, 0.05, 0.06], [0.9, 1.2, 0.08]);
      decor.push({ text: "Aula de hoje", sub: "Projeto PEG", pos: at(0, 1.95, -0.012), rot: [0, r + Math.PI, 0], w: 2.9, h: 1.0, bg: "#fdfdf8", color: "#3a3550" });
      break;
    }
    case "teacherDesk": {
      box("wood", [1.9, 0.08, 0.72], [0, 0.76, 0]);
      box("wood", [0.06, 0.72, 0.68], [-0.9, 0.38, 0]);
      box("wood", [0.06, 0.72, 0.68], [0.9, 0.38, 0]);
      box("wood", [1.7, 0.5, 0.05], [0, 0.5, -0.3]);
      if (quality > 0) {
        box("#2f3542", [0.32, 0.02, 0.24], [-0.3, 0.81, 0]);
        box("#dfe4ea", [0.28, 0.22, 0.02], [0.35, 0.92, -0.1]);
        cyl(WHITE, 0.05, 0.12, [0.6, 0.86, 0.12], 8);
      }
      break;
    }
    case "cabinet": {
      box("wood", [1.0, 1.85, 0.42], [0, 0.93, 0]);
      box("#2f3542", [0.03, 1.7, 0.01], [0, 0.93, 0.22]);
      box("metal", [0.05, 0.16, 0.04], [0.12, 1.0, 0.24]);
      box("metal", [0.05, 0.16, 0.04], [-0.12, 1.0, 0.24]);
      break;
    }
    case "bin": {
      cyl("metal", 0.22, 0.62, [0, 0.31, 0], 12);
      cyl(DARK, 0.24, 0.05, [0, 0.65, 0], 12);
      break;
    }
    case "clock": {
      builder.cylinder(WHITE, 0.3, 0.3, 0.06, at(0, 2.55, 0), { rotX: Math.PI / 2, segments: 20 });
      builder.box(DARK, [0.04, 0.18, 0.02], at(0, 2.58, 0.0), { tile: 0.2 });
      break;
    }
    case "readingTable": {
      box("wood", [1.9, 0.07, 1.05], [0, 0.76, 0]);
      for (const [lx, lz] of [
        [-0.78, -0.38],
        [0.78, -0.38],
        [-0.78, 0.38],
        [0.78, 0.38],
      ])
        box("metal", [0.06, 0.74, 0.06], [lx, 0.37, lz]);
      if (quality > 0) {
        box("#8d3f4f", [0.28, 0.03, 0.2], [-0.5, 0.81, 0]);
        box("#3f5d8d", [0.28, 0.03, 0.2], [0.5, 0.81, 0.1]);
        box(DARK, [0.26, 0.02, 0.2], [0, 0.81, -0.2]);
      }
      break;
    }
    case "diningTable": {
      box("wood", [1.7, 0.07, 1.6], [0, 0.75, 0]);
      box("metal", [0.12, 0.72, 0.12], [0, 0.36, 0]);
      box("metal", [1.2, 0.06, 0.12], [0, 0.08, 0]);
      if (quality > 0) {
        box("#e3e8ee", [0.34, 0.03, 0.26], [-0.4, 0.8, 0.25]);
        box("#d8d2c4", [0.18, 0.08, 0.18], [0.4, 0.82, -0.2]);
      }
      break;
    }
    case "counter": {
      box("wood", [6.2, 0.92, 0.8], [0, 0.46, 0]);
      box("metal", [6.3, 0.07, 0.9], [0, 0.95, 0]);
      box("#d9d4c8", [6.2, 0.5, 0.06], [0, 0.28, 0.42]);
      if (quality > 0) {
        box("#c8583f", [0.5, 0.22, 0.3], [-1.6, 1.09, 0]);
        box("#3f6d8d", [0.5, 0.22, 0.3], [-0.9, 1.09, 0]);
        box("#e6e1d2", [0.4, 0.16, 0.24], [1.1, 1.07, 0]);
      }
      break;
    }
    case "sneeze": {
      box("glass", [5.6, 0.6, 0.04], [0, 1.35, 0]);
      box("metal", [5.7, 0.05, 0.06], [0, 1.68, 0]);
      break;
    }
    case "menu": {
      box(DARK, [3.0, 1.1, 0.05], [0, 2.3, 0.02]);
      decor.push({ text: "Menu do dia", sub: "Arroz · Feijão · Frango · Fruta", pos: at(0, 2.3, 0.06), rot: [0, r, 0], w: 2.8, h: 1.0, bg: "#2b2438", color: "#ffe9b8", border: "#6d4aa8" });
      break;
    }
    case "mural": {
      box("#ccb894", [3.0, 1.3, 0.05], [0, 1.9, -0.03]);
      decor.push({ text: "Mural da escola", sub: "Grêmio · clubes · avisos", pos: at(0, 1.95, 0.01), rot: [0, r + Math.PI, 0], w: 2.7, h: 1.1, bg: "#e8dcc0", color: "#4a3a2a" });
      break;
    }
    case "fridge": {
      box("#d7dde3", [0.72, 1.9, 0.7], [0, 0.95, 0]);
      box(DARK, [0.66, 0.01, 0.02], [0, 1.25, 0.36]);
      box(DARK, [0.06, 0.3, 0.05], [0.25, 1.5, 0.37]);
      break;
    }
    case "rug": {
      builder.plane("#7b5aa6", 5.4, 3.4, at(0, 0.02, 0), { rotY: r, tile: 1 });
      break;
    }
    case "shelf": {
      box("wood", [1.7, 2.0, 0.36], [0, 1.0, 0]);
      for (let k = 0; k < 4; k += 1) {
        box("#d8cbb2", [1.6, 0.04, 0.32], [0, 0.35 + k * 0.45, 0.02]);
        if (quality > -1) {
          for (let b = 0; b < 6; b += 1) {
            const colors = ["#8d3f4f", "#3f5d8d", "#4f7d5a", "#c58b3b", "#6d4aa8"];
            box(colors[(b + k) % colors.length], [0.16, 0.28, 0.2], [-0.65 + b * 0.22, 0.52 + k * 0.45, 0.02]);
          }
        }
      }
      break;
    }
    case "labBench": {
      box(DARK, [3.4, 0.08, 0.9], [0, 0.86, 0]);
      box("wood", [3.3, 0.8, 0.78], [0, 0.42, 0]);
      box("#9fb3b8", [0.5, 0.04, 0.36], [-1.2, 0.9, 0]);
      cyl("metal", 0.03, 0.24, [-1.2, 0.99, -0.18], 8);
      if (quality > 0) {
        box("#cfe3ee", [0.16, 0.2, 0.16], [0, 0.98, 0.1]);
        cyl("#cfe3ee", 0.05, 0.18, [0.35, 0.98, 0.05], 8);
      }
      break;
    }
    case "fumeHood": {
      box("metal", [1.4, 2.3, 0.85], [0, 1.15, 0]);
      box("glass", [1.15, 1.1, 0.04], [0, 1.5, 0.44]);
      break;
    }
    case "computerBench": {
      box("wood", [4.0, 0.07, 0.7], [0, 0.74, 0]);
      box("metal", [0.08, 0.72, 0.6], [-1.9, 0.37, 0]);
      box("metal", [0.08, 0.72, 0.6], [1.9, 0.37, 0]);
      for (let k = 0; k < 4; k += 1) {
        const x = -1.5 + k;
        box(DARK, [0.48, 0.3, 0.03], [x, 1.02, -0.12]);
        box("#565f6b", [0.1, 0.16, 0.1], [x, 0.85, -0.12]);
        box("#cfd6de", [0.36, 0.02, 0.14], [x, 0.79, 0.14]);
        builder.plane("screen", 0.42, 0.24, at(x, 1.02, -0.09), { rotX: 0, rotY: r, tile: 1 });
      }
      break;
    }
    case "serverRack": {
      box(DARK, [0.7, 1.9, 0.7], [0, 0.95, 0]);
      for (let k = 0; k < 4; k += 1) box("#6bd3a0", [0.08, 0.03, 0.02], [-0.15 + k * 0.1, 1.2 + k * 0.06, 0.36]);
      break;
    }
    case "easel": {
      box("wood", [0.62, 0.9, 0.04], [0, 1.15, 0], -0.18);
      box("wood", [0.05, 1.3, 0.05], [-0.25, 0.65, 0], 0.15);
      box("wood", [0.05, 1.3, 0.05], [0.25, 0.65, 0], -0.15);
      box("wood", [0.05, 1.2, 0.05], [0, 0.6, -0.3], -0.3);
      if (quality > 0) box("#e7dcc8", [0.5, 0.6, 0.02], [0, 1.15, 0.04]);
      break;
    }
    case "artTable": {
      box("wood", [2.6, 0.08, 1.2], [0, 0.76, 0]);
      box("metal", [2.3, 0.7, 0.08], [0, 0.36, 0]);
      if (quality > 0) {
        box("#c94f3d", [0.3, 0.1, 0.2], [-0.6, 0.85, 0]);
        box("#3f8d6d", [0.3, 0.1, 0.2], [0.4, 0.85, 0.2]);
      }
      break;
    }
    case "sink": {
      box(WHITE, [0.7, 0.85, 0.5], [0, 0.42, 0]);
      box("#c9d6d8", [0.5, 0.1, 0.34], [0, 0.86, 0]);
      cyl("metal", 0.025, 0.26, [0, 1.02, -0.16], 8);
      break;
    }
    case "stage": {
      box("wood", [7.0, 0.5, 3.2], [0, 0.25, 0]);
      box("#5a3f2a", [7.2, 0.08, 3.4], [0, 0.52, 0]);
      break;
    }
    case "curtain": {
      box("#8d2f43", [7.4, 3.0, 0.14], [0, 1.7, 0]);
      box("#5a1e2c", [7.5, 0.16, 0.22], [0, 3.1, 0]);
      break;
    }
    case "auditoriumSeat": {
      box("#6d4aa8", [0.62, 0.1, 0.5], [0, 0.46, 0]);
      box("#6d4aa8", [0.62, 0.5, 0.08], [0, 0.7, -0.24]);
      box("metal", [0.08, 0.4, 0.4], [0.28, 0.2, 0]);
      box("metal", [0.08, 0.4, 0.4], [-0.28, 0.2, 0]);
      break;
    }
    case "spot":
      break;
    case "bleacher": {
      for (let k = 0; k < 3; k += 1) {
        const height = 0.32 * (k + 1);
        box("concrete", [1.4, height, 0.5], [0, height / 2, -k * 0.5]);
        box("wood", [1.36, 0.055, 0.36], [0, height + 0.0275, -k * 0.5]);
      }
      break;
    }
    case "hoop": {
      cyl("metal", 0.07, 3.2, [0, 1.6, 0], 8);
      box("#e3e8ee", [1.0, 0.65, 0.06], [0.5, 3.0, 0]);
      box("metal", [0.1, 0.07, 0.15], [0.5, 2.85, 0.09]);
      const rim = new THREE.TorusGeometry(0.27, 0.026, 6, 24);
      rim.rotateX(Math.PI / 2);
      rim.translate(...at(0.5, 2.85, 0.42));
      builder.raw("#d9773f", rim);
      break;
    }
    case "goal": {
      box(WHITE, [3.0, 0.1, 0.1], [0, 2.0, 0]);
      box(WHITE, [0.1, 2.0, 0.1], [-1.5, 1.0, 0]);
      box(WHITE, [0.1, 2.0, 0.1], [1.5, 1.0, 0]);
      for (const side of [-1, 1]) {
        box("metal", [0.055, 2, 0.055], [side * 1.5, 1, -0.75]);
        for (const y of [0.18, 2]) box(WHITE, [0.065, 0.065, 0.8], [side * 1.5, y, -0.375]);
      }
      for (let i = 0; i <= 12; i++) {
        box(WHITE, [0.016, 1.84, 0.016], [-1.5 + i * 0.25, 1.08, -0.75]);
      }
      for (let i = 0; i <= 8; i++) {
        box(WHITE, [3, 0.016, 0.016], [0, 0.16 + i * 0.23, -0.75]);
      }
      break;
    }
    case "planter": {
      box("concrete", [1.6, 0.55, 0.8], [0, 0.28, 0]);
      box("#5b4632", [1.5, 0.1, 0.7], [0, 0.6, 0]);
      for (let k = 0; k < 4; k += 1) {
        builder.sphere("#6f9a52", 0.32 + k * 0.03, at(-0.5 + k * 0.34, 0.78, (k % 2) * 0.1), { detail: 1 });
      }
      break;
    }
    case "tree": {
      builder.cylinder("#6b5238", 0.16, 0.13, 3.2, at(0, 1.6, 0), { segments: 8, tile: 1 });
      builder.sphere("#4f7d43", 1.5, at(0, 3.5, 0), { detail: 2 });
      builder.sphere("#5f8d4c", 1.1, at(0.9, 3.0, 0.3), { detail: 2 });
      builder.sphere("#446b3a", 1.0, at(-0.7, 3.1, -0.4), { detail: 2 });
      break;
    }
    case "bench": {
      for (let k = 0; k < 3; k += 1) box(benchColor, [1.9, 0.06, 0.16], [0, 0.45, -0.2 + k * 0.18]);
      for (let k = 0; k < 2; k += 1) box(benchColor, [1.9, 0.16, 0.06], [0, 0.7 + k * 0.2, -0.28]);
      box("metal", [0.08, 0.44, 0.5], [-0.8, 0.22, 0]);
      box("metal", [0.08, 0.44, 0.5], [0.8, 0.22, 0]);
      break;
    }
    case "pergola": {
      // Duas faixas cobertas deixam uma abertura central para luz e vista do pátio.
      for (const side of [-1, 1]) {
        for (const x of [-7.8, 0, 7.8]) {
          box("concrete", [0.32, 3.05, 0.32], [x, 1.525, side * 3.8]);
          box("wood", [0.20, 0.24, 2.75], [x, 3.17, side * 2.75]);
        }
        box(DARK, [16.2, 0.26, 0.24], [0, 3.18, side * 3.8]);
        box("roof", [16.4, 0.14, 2.9], [0, 3.36, side * 2.75]);
        box("wood", [16.4, 0.20, 0.12], [0, 3.33, side * 4.22]);
      }
      break;
    }
    case "kiosk": {
      box("concrete", [3.2, 1.0, 1.4], [0, 0.5, 0]);
      box("wood", [3.3, 0.1, 1.5], [0, 1.05, 0]);
      box("roof", [3.6, 0.12, 1.8], [0, 2.6, 0]);
      box("metal", [0.1, 1.5, 0.1], [-1.4, 1.8, -0.6]);
      box("metal", [0.1, 1.5, 0.1], [1.4, 1.8, -0.6]);
      break;
    }
    case "drinkingFountain": {
      cyl("metal", 0.14, 1.05, [0, 0.52, 0], 10);
      box("#d7e2e6", [0.42, 0.1, 0.32], [0, 1.05, 0.1]);
      break;
    }
    case "compost": {
      box("wood", [1.5, 0.9, 0.9], [0, 0.45, 0]);
      box("#4a3b2c", [1.42, 0.08, 0.82], [0, 0.9, 0]);
      break;
    }
    case "receptionDesk": {
      box("wood", [3.4, 1.05, 0.8], [0, 0.52, 0]);
      box("metal", [3.6, 0.08, 0.95], [0, 1.08, 0]);
      box("#d8d2c6", [3.4, 0.5, 0.05], [0, 0.35, 0.42]);
      decor.push({ text: "ESCOLA PEG", sub: "Recepção", pos: at(0, 1.1, 0.2), rot: [0, r, 0], w: 1.8, h: 0.6, bg: PURPLE, color: "#ffffff" });
      break;
    }
    case "sofaSeat": {
      box("#7d6aa8", [1.2, 0.12, 0.6], [0, 0.46, 0]);
      box("#7d6aa8", [1.2, 0.6, 0.1], [0, 0.75, -0.28]);
      box("metal", [0.08, 0.4, 0.5], [-0.5, 0.2, 0]);
      box("metal", [0.08, 0.4, 0.5], [0.5, 0.2, 0]);
      break;
    }
    case "sofa": {
      box("#6f5f96", [2.4, 0.4, 0.9], [0, 0.32, 0]);
      box("#6f5f96", [2.4, 0.6, 0.22], [0, 0.7, -0.36]);
      box("#8574ad", [0.24, 0.5, 0.9], [-1.2, 0.5, 0]);
      box("#8574ad", [0.24, 0.5, 0.9], [1.2, 0.5, 0]);
      break;
    }
    case "coffee": {
      box(DARK, [0.9, 0.9, 0.6], [0, 0.9, 0]);
      box("wood", [1.6, 0.7, 0.6], [0, 0.45, 0]);
      if (quality > 0) {
        cyl(WHITE, 0.05, 0.12, [-0.3, 1.05, 0.2], 8);
        cyl(WHITE, 0.05, 0.12, [0.3, 1.05, 0.2], 8);
      }
      break;
    }
    case "plant": {
      builder.cylinder("#a06a48", 0.24, 0.3, 0.3, at(0, 0.15, 0), { segments: 10 });
      builder.sphere("#4f7d43", 0.5, at(0, 0.8, 0), { detail: 1 });
      break;
    }
    case "smartBoard": {
      box("#1d1f24", [1.8, 1.05, 0.06], [0, 1.65, 0.03]);
      box("screen", [1.7, 0.95, 0.01], [0, 1.65, 0.065]);
      break;
    }
    case "scoreboard": {
      for (const lx of [-1.3, 1.3]) cyl("metal", 0.06, 3.2, [lx, 1.6, 0], 8);
      box("#111318", [2.9, 1.1, 0.18], [0, 3.4, 0]);
      box("lamp", [0.8, 0.5, 0.02], [-0.7, 3.4, 0.1]);
      box("lamp", [0.8, 0.5, 0.02], [0.7, 3.4, 0.1]);
      decor.push({ text: "CASA  0 × 0  VISITA", pos: at(0, 3.85, 0.1), rot: [0, r, 0], w: 2.4, h: 0.25, bg: "#111318", color: "#f2c230" });
      break;
    }
    case "mobileStage": {
      box("wood", [4.2, 0.5, 2.4], [0, 0.25, 0]);
      box("#6d4aa8", [4.4, 2.4, 0.08], [0, 1.7, -1.2]);
      for (const lx of [-1.9, 1.9]) box("#1d1d1d", [0.4, 0.8, 0.4], [lx, 0.9, -0.8]);
      break;
    }
    case "crates": {
      for (let k = 0; k < 4; k += 1) box(k % 2 ? "#b38b52" : "#c9a46b", [0.55, 0.45, 0.55], [(k % 2) * 0.6, 0.23 + Math.floor(k / 2) * 0.46, 0]);
      break;
    }
    case "cones": {
      for (let k = 0; k < 3; k += 1) cyl("#f08a24", 0.12, 0.45, [k * 0.5, 0.23, 0], 10);
      box("#f2c230", [1.2, 0.04, 0.04], [0.5, 0.42, 0]);
      break;
    }
    case "bookCart": {
      box("metal", [0.9, 0.06, 0.45], [0, 0.35, 0]);
      box("metal", [0.9, 0.06, 0.45], [0, 0.75, 0]);
      for (let k = 0; k < 10; k += 1) box(["#d64f4f", "#3f7fbf", "#3c9a5f", "#f2c230", "#7c5cc4"][k % 5], [0.06, 0.26, 0.2], [-0.38 + (k % 10) * 0.085, k < 5 ? 0.51 : 0.91, 0]);
      for (const lx of [-0.4, 0.4]) cyl("#1d1d1d", 0.06, 0.05, [lx, 0.06, 0.18], 8);
      break;
    }
    case "staffBadge": {
      decor.push({ text: "Atendimento", sub: "Bibliotecária", pos: at(0, 2.0, 0.02), rot: [0, r, 0], w: 1.2, h: 0.4, bg: "#7a5236", color: "#fff3dc" });
      break;
    }
    case "ribbon": {
      for (const lx of [-1.4, 1.4]) cyl("metal", 0.03, 1.1, [lx, 0.55, 0], 6);
      box("#c62828", [2.8, 0.12, 0.02], [0, 1.0, 0]);
      break;
    }
    case "plaque": {
      box("#c9a46b", [0.7, 0.45, 0.03], [0, 1.5, 0]);
      decor.push({ text: "Inaugurado", sub: "Projeto concluído", pos: at(0, 1.5, 0.025), rot: [0, r, 0], w: 0.62, h: 0.36, bg: "#c9a46b", color: "#2a1f10" });
      break;
    }
    case "balloons": {
      ["#d64f4f", "#6d4aa8", "#f2c230", "#3f7fbf"].forEach((c, k) => {
        cyl("#ffffff", 0.005, 1.6, [k * 0.25, 0.8, 0], 4);
        builder.sphere(c, 0.18, at(k * 0.25, 1.75 + (k % 2) * 0.15, 0));
      });
      break;
    }
    case "robotKit": {
      box("#2f3542", [0.9, 0.05, 0.6], [0, 0.75, 0]);
      for (const lx of [-0.4, 0.4]) box("metal", [0.05, 0.72, 0.5], [lx, 0.36, 0]);
      box("#9aa1aa", [0.3, 0.2, 0.25], [-0.15, 0.88, 0]);
      cyl("#1d1d1d", 0.06, 0.04, [-0.27, 0.8, 0.13], 8);
      cyl("#1d1d1d", 0.06, 0.04, [-0.03, 0.8, 0.13], 8);
      box("screen", [0.12, 0.08, 0.02], [-0.15, 0.98, 0.13]);
      box("#3f7fbf", [0.25, 0.12, 0.2], [0.25, 0.84, 0]);
      break;
    }
    case "banner":
    case "bannerArt": {
      for (const lx of [-1.6, 1.6]) cyl("metal", 0.04, 3.0, [lx, 1.5, 0], 6);
      const art = item.type === "bannerArt";
      decor.push({ text: art ? "Mostra cultural" : "Clube de robótica", sub: "Projeto PEG", pos: at(0, 2.5, 0.02), rot: [0, r, 0], w: 3.0, h: 0.7, bg: art ? "#e08a3c" : "#3f7fbf", color: "#ffffff" });
      break;
    }
    case "trophyCase": {
      box("wood", [1.2, 1.6, 0.45], [0, 0.8, 0]);
      box("glass", [1.1, 0.9, 0.02], [0, 1.15, 0.23]);
      for (let k = 0; k < 3; k += 1) cyl("#e3b23c", 0.07, 0.25, [-0.35 + k * 0.35, 1.0, 0], 10);
      break;
    }
    case "teamFlag": {
      cyl("metal", 0.03, 3.2, [0, 1.6, 0], 6);
      box("#3c9a5f", [1.0, 0.6, 0.02], [0.5, 2.85, 0]);
      break;
    }
    case "artPanel": {
      box("wood", [1.2, 1.5, 0.06], [0, 1.0, 0]);
      for (let k = 0; k < 4; k += 1) box(["#e08a3c", "#3f7fbf", "#f2c230", "#d64f7a"][k], [0.45, 0.5, 0.01], [-0.25 + (k % 2) * 0.5, 0.75 + Math.floor(k / 2) * 0.6, 0.04]);
      for (const lx of [-0.5, 0.5]) box("wood", [0.05, 0.9, 0.05], [lx, 0.45, -0.2], -0.3);
      break;
    }
    case "goalsBoard": {
      box("#f7f5ef", [1.6, 1.0, 0.04], [0, 1.6, 0.02]);
      for (let k = 0; k < 4; k += 1) box("#3c9a5f", [0.12 + k * 0.25, 0.12, 0.01], [-0.6 + (0.12 + k * 0.25) / 2, 1.9 - k * 0.2, 0.05]);
      break;
    }
    case "handouts": {
      for (let k = 0; k < 3; k += 1) box("#f4f1e8", [0.3, 0.12 + k * 0.04, 0.22], [k * 0.35, 0.82 + (0.12 + k * 0.04) / 2, 0]);
      break;
    }
    case "teacherChair": {
      box("#3a3f47", [0.5, 0.07, 0.5], [0, 0.48, 0]);
      box("#3a3f47", [0.5, 0.6, 0.06], [0, 0.82, -0.24]);
      cyl("metal", 0.03, 0.45, [0, 0.24, 0], 8);
      break;
    }
    case "fanWall": {
      cyl("#e8e8e4", 0.28, 0.08, [0, 2.5, 0.12], 16);
      box("#9aa1aa", [0.08, 0.3, 0.08], [0, 2.3, 0.05]);
      break;
    }
    case "loanCounter": {
      box("wood", [2.4, 1.0, 0.6], [0, 0.5, 0]);
      box("#7a5236", [2.5, 0.05, 0.7], [0, 1.02, 0]);
      box("screen", [0.4, 0.28, 0.03], [0.6, 1.2, -0.1]);
      box("#3b6fd6", [0.25, 0.08, 0.18], [-0.5, 1.08, 0.1]);
      decor.push({ text: "Empréstimos", pos: at(0, 0.6, 0.32), rot: [0, r, 0], w: 1.2, h: 0.3, bg: "#7a5236", color: "#fff3dc" });
      break;
    }
    case "readingLamp": {
      cyl("metal", 0.02, 1.5, [0, 0.75, 0], 8);
      cyl("lamp", 0.18, 0.2, [0, 1.55, 0], 12);
      break;
    }
    case "beanbag": {
      box("#e08a3c", [0.75, 0.4, 0.75], [0, 0.2, 0]);
      box("#c96f22", [0.7, 0.35, 0.18], [0, 0.45, -0.28]);
      break;
    }
    case "studyCarrel": {
      box("wood", [1.3, 0.05, 0.6], [0, 0.74, 0]);
      box("#cfd8e3", [1.3, 0.6, 0.04], [0, 1.05, -0.3]);
      box("#cfd8e3", [0.04, 0.6, 0.6], [-0.65, 1.05, 0]);
      box("#cfd8e3", [0.04, 0.6, 0.6], [0.65, 1.05, 0]);
      box("metal", [0.05, 0.72, 0.5], [-0.6, 0.36, 0]);
      box("metal", [0.05, 0.72, 0.5], [0.6, 0.36, 0]);
      cyl("lamp", 0.07, 0.05, [0.4, 1.2, -0.2], 10);
      break;
    }
    case "groupTable": {
      cyl("wood", 0.85, 0.05, [0, 0.74, 0], 20);
      cyl("metal", 0.06, 0.72, [0, 0.36, 0], 8);
      break;
    }
    case "lowDivider": {
      box("#9fb3c8", [6.0, 1.1, 0.06], [0, 0.55, 0]);
      for (let k = 0; k < 5; k += 1) box("#3d7a4a", [0.3, 0.3, 0.3], [-2.4 + k * 1.2, 1.25, 0]);
      break;
    }
    case "planningBoard": {
      box("#f7f5ef", [3.0, 1.2, 0.05], [0, 1.7, 0.02]);
      for (let k = 0; k < 9; k += 1) box(["#f2d16b", "#9ad0a8", "#f2a6a0"][k % 3], [0.22, 0.22, 0.01], [-1.1 + (k % 5) * 0.55, 1.95 - Math.floor(k / 5) * 0.4, 0.06]);
      decor.push({ text: "Planejamento", sub: "Semana de provas", pos: at(0, 2.45, 0.05), rot: [0, r, 0], w: 1.6, h: 0.3, bg: "#3f7fbf", color: "#ffffff" });
      break;
    }
    case "stove": {
      box("#5a6068", [1.2, 0.9, 0.65], [0, 0.45, 0]);
      for (const [lx, lz] of [[-0.3, -0.15], [0.3, -0.15], [-0.3, 0.15], [0.3, 0.15]]) cyl("#1d1f22", 0.12, 0.03, [lx, 0.92, lz], 12);
      box("metal", [1.2, 0.5, 0.4], [0, 1.9, -0.1]);
      break;
    }
    case "prepCounter": {
      box("metal", [1.8, 0.9, 0.65], [0, 0.45, 0]);
      box("#cfd5da", [1.8, 0.04, 0.7], [0, 0.92, 0]);
      box("#d64f4f", [0.3, 0.12, 0.3], [-0.5, 0.99, 0]);
      box("#e6c45a", [0.25, 0.1, 0.2], [0.3, 0.98, 0.1]);
      break;
    }
    case "pickup":
    case "counter2": {
      box("#d9d2c4", [1.6, 0.95, 0.6], [0, 0.47, 0]);
      box("metal", [1.7, 0.05, 0.7], [0, 0.97, 0]);
      box("glass", [1.6, 0.4, 0.03], [0, 1.2, 0.25]);
      for (let k = 0; k < 3; k += 1) box("#e9e4da", [0.32, 0.03, 0.24], [-0.5 + k * 0.5, 1.01, -0.05]);
      decor.push({ text: item.type === "counter2" ? "Balcão 2" : "Retirada", pos: at(0, 0.55, 0.32), rot: [0, r, 0], w: 1.0, h: 0.28, bg: "#e08a3c", color: "#ffffff" });
      break;
    }
    case "trayReturn": {
      box("metal", [1.2, 1.0, 0.5], [0, 0.5, 0]);
      for (let k = 0; k < 4; k += 1) box("#c9c3b6", [1.1, 0.02, 0.45], [0, 0.3 + k * 0.2, 0]);
      decor.push({ text: "Devolução", pos: at(0, 1.25, 0.26), rot: [0, r, 0], w: 0.9, h: 0.26, bg: "#3d2f4f", color: "#ffe9b8" });
      break;
    }
    case "queueStart": {
      for (let k = 0; k < 5; k += 1) box("#f2c230", [0.6, 0.012, 0.08], [0, 0.28, -k * 0.6]);
      cyl("metal", 0.03, 1.0, [0.45, 0.5, 0], 8);
      decor.push({ text: "Fila começa aqui", pos: at(0.45, 1.15, 0.02), rot: [0, r, 0], w: 0.9, h: 0.3, bg: "#f2c230", color: "#3a2a00" });
      break;
    }
    case "labIsland": {
      box("#e9eef1", [2.2, 0.9, 1.1], [0, 0.45, 0]);
      box("#2f3542", [2.3, 0.05, 1.2], [0, 0.92, 0]);
      cyl("metal", 0.14, 0.05, [0, 0.95, 0], 12);
      cyl("metal", 0.02, 0.3, [0, 1.1, -0.12], 6);
      for (let k = 0; k < 3; k += 1) cyl("glass", 0.05, 0.18, [-0.7 + k * 0.2, 1.03, 0.2], 10);
      cyl("#9ad0a8", 0.04, 0.12, [0.7, 1.0, 0.25], 8);
      break;
    }
    case "glassCabinet": {
      box("wood", [1.0, 1.9, 0.4], [0, 0.95, 0]);
      box("glass", [0.9, 1.5, 0.02], [0, 1.1, 0.21]);
      for (let k = 0; k < 6; k += 1) cyl(["#9ad0a8", "#9ac0e0", "#f2c06b"][k % 3], 0.05, 0.16, [-0.3 + (k % 3) * 0.3, 0.75 + Math.floor(k / 3) * 0.5, 0], 8);
      break;
    }
    case "editStation": {
      box("#2b2b33", [1.5, 0.05, 0.7], [0, 0.74, 0]);
      box("metal", [0.05, 0.72, 0.6], [-0.7, 0.36, 0]);
      box("metal", [0.05, 0.72, 0.6], [0.7, 0.36, 0]);
      box("#111", [0.62, 0.38, 0.04], [0, 1.02, -0.22]);
      box("screen", [0.56, 0.32, 0.01], [0, 1.02, -0.195]);
      box("#2f2f2f", [0.45, 0.02, 0.15], [0, 0.78, 0.05]);
      cyl("#1d1d1d", 0.02, 0.28, [0.5, 0.92, -0.1], 6);
      cyl("#7c5cc4", 0.05, 0.08, [0.5, 1.08, -0.1], 8);
      box("#1d1d1d", [0.18, 0.06, 0.06], [-0.5, 0.79, 0.1]);
      break;
    }
    case "acousticPanel": {
      for (let k = 0; k < 6; k += 1) box(["#5b4a7a", "#3d6a8a", "#7a4a5b"][k % 3], [0.55, 0.55, 0.06], [-0.6 + (k % 3) * 0.6, 1.4 + Math.floor(k / 3) * 0.62, 0.04]);
      break;
    }
    case "recordingBooth": {
      box("#3a3550", [2.0, 2.3, 0.08], [0, 1.15, -0.9]);
      box("#3a3550", [0.08, 2.3, 1.8], [-1.0, 1.15, 0]);
      box("glass", [0.04, 1.2, 1.4], [1.0, 1.5, 0]);
      box("lamp", [0.4, 0.12, 0.06], [0, 2.2, -0.85]);
      decor.push({ text: "No ar", pos: at(0, 2.45, -0.84), rot: [0, r, 0], w: 0.7, h: 0.25, bg: "#c62828", color: "#ffffff" });
      break;
    }
    case "micStand": {
      cyl("#1d1d1d", 0.15, 0.03, [0, 0.27, 0], 10);
      cyl("#1d1d1d", 0.015, 1.4, [0, 0.98, 0], 6);
      cyl("#9aa1aa", 0.04, 0.12, [0, 1.72, 0.04], 8);
      break;
    }
    case "paintShelf": {
      box("wood", [1.4, 1.6, 0.4], [0, 0.8, 0]);
      for (let k = 0; k < 12; k += 1) cyl(["#d64f4f", "#3b6fd6", "#f2c230", "#3c9a5f", "#7c5cc4"][k % 5], 0.06, 0.14, [-0.5 + (k % 6) * 0.2, 0.55 + Math.floor(k / 6) * 0.5, 0.05], 8);
      break;
    }
    case "referenceBoard": {
      box("#d8cbb8", [3.6, 1.4, 0.05], [0, 1.7, 0.02]);
      for (let k = 0; k < 8; k += 1) box(["#e08a3c", "#3f7fbf", "#f2d16b", "#7c5cc4", "#3c9a5f"][k % 5], [0.5, 0.36, 0.01], [-1.35 + (k % 4) * 0.9, 1.95 - Math.floor(k / 4) * 0.55, 0.06]);
      break;
    }
    case "draftTable": {
      box("#f4f1ea", [2.4, 0.05, 1.2], [0, 0.88, 0], -0.12);
      box("metal", [0.06, 0.85, 1.0], [-1.1, 0.42, 0]);
      box("metal", [0.06, 0.85, 1.0], [1.1, 0.42, 0]);
      box("#3f7fbf", [0.9, 0.01, 0.6], [-0.4, 0.93, 0.05], -0.12);
      box("metal", [0.9, 0.02, 0.05], [0.5, 0.94, 0.2]);
      break;
    }
    case "sampleShelf": {
      box("wood", [1.6, 1.8, 0.35], [0, 0.9, 0]);
      for (let k = 0; k < 10; k += 1) box(["#c96f22", "#9fb3c8", "#7a5236", "#d6d0c4", "#5b4a7a"][k % 5], [0.26, 0.26, 0.05], [-0.55 + (k % 5) * 0.28, 0.6 + Math.floor(k / 5) * 0.6, 0.15]);
      break;
    }
    case "cuttingTable": {
      box("#3c9a5f", [2.6, 0.04, 1.0], [0, 0.9, 0]);
      box("wood", [2.5, 0.85, 0.9], [0, 0.44, 0]);
      break;
    }
    case "spotlight": {
      cyl("metal", 0.03, 3.0, [0, 1.5, 0], 6);
      cyl("#1d1d1d", 0.16, 0.3, [0, 3.0, -0.15], 10);
      cyl("lamp", 0.12, 0.02, [0, 3.0, -0.31], 10);
      break;
    }
    case "archive": {
      box("#8c96a3", [0.6, 1.4, 0.55], [0, 0.7, 0]);
      for (let k = 0; k < 4; k += 1) box("metal", [0.2, 0.03, 0.03], [0, 0.3 + k * 0.32, 0.28]);
      break;
    }
    case "directorDesk": {
      box("#5b3d28", [2.0, 0.08, 0.9], [0, 0.78, 0]);
      box("#5b3d28", [1.9, 0.72, 0.06], [0, 0.38, 0.4]);
      box("#5b3d28", [0.06, 0.74, 0.85], [-0.95, 0.38, 0]);
      box("#5b3d28", [0.06, 0.74, 0.85], [0.95, 0.38, 0]);
      box("screen", [0.5, 0.32, 0.03], [0.4, 1.05, -0.2]);
      box("#6d4aa8", [0.5, 0.3, 0.02], [-0.5, 0.95, -0.35]);
      decor.push({ text: "Diretoria", sub: "Gabinete", pos: at(0, 0.5, 0.44), rot: [0, r, 0], w: 1.2, h: 0.4, bg: "#6d4aa8", color: "#ffffff" });
      break;
    }
    case "meetingTable": {
      box("wood", [2.4, 0.06, 1.2], [0, 0.76, 0]);
      cyl("metal", 0.08, 0.72, [-0.8, 0.37, 0], 8);
      cyl("metal", 0.08, 0.72, [0.8, 0.37, 0], 8);
      break;
    }
    case "lockers":
    case "lockerUnit": {
      const n = item.type === "lockers" ? 4 : 1;
      for (let k = 0; k < n; k += 1) {
        box(["#3f7fbf", "#e08a3c", "#3c9a5f", "#7c5cc4"][k % 4], [0.6, 1.8, 0.45], [(k - (n - 1) / 2) * 0.62, 0.9, 0]);
        box("metal", [0.04, 0.12, 0.03], [(k - (n - 1) / 2) * 0.62 + 0.2, 1.0, 0.24]);
      }
      break;
    }
    case "scheduleBoard": {
      box("#f7f5ef", [2.2, 1.0, 0.05], [0, 1.7, 0.02]);
      for (let k = 0; k < 15; k += 1) box(["#3f7fbf", "#e08a3c", "#3c9a5f"][k % 3], [0.32, 0.12, 0.01], [-0.8 + (k % 5) * 0.4, 2.0 - Math.floor(k / 5) * 0.25, 0.06]);
      decor.push({ text: "Quadro de horários", pos: at(0, 2.35, 0.05), rot: [0, r, 0], w: 1.4, h: 0.25, bg: "#6d4aa8", color: "#ffffff" });
      break;
    }
    case "accessibleStall": {
      box("#d9d2c4", [0.05, 2.0, 1.9], [-1.0, 1.0, 0]);
      box("#d9d2c4", [2.0, 2.0, 0.05], [0, 1.0, -0.95]);
      box("#f7f7f5", [0.42, 0.44, 0.6], [-0.4, 0.22, -0.55]);
      box("#f7f7f5", [0.38, 0.3, 0.14], [-0.4, 0.75, -0.88]);
      box("metal", [0.8, 0.04, 0.04], [0.0, 0.85, -0.9]);
      box("metal", [0.04, 0.04, 0.7], [-0.95, 0.85, -0.4]);
      cyl("#2d6fa8", 0.18, 0.02, [0.5, 1.6, -0.92], 14);
      break;
    }
    case "sinkCounter": {
      box("#cfc7b8", [3.0, 0.1, 0.55], [0, 0.85, 0]);
      for (let k = 0; k < 3; k += 1) {
        cyl("#f7f7f5", 0.18, 0.08, [-1 + k, 0.86, 0.02], 14);
        cyl("metal", 0.02, 0.18, [-1 + k, 1.0, -0.18], 6);
        box("#e6efe9", [0.08, 0.14, 0.06], [-1 + k + 0.3, 1.0, -0.2]);
      }
      box("#cfc7b8", [3.0, 0.75, 0.05], [0, 0.42, -0.25]);
      break;
    }
    case "tileBand": {
      box("#3e8fa8", [6.0, 0.12, 0.02], [0, 1.25, 0]);
      break;
    }
    case "screenDivider": {
      for (let k = 0; k < 3; k += 1) box("#e6efe9", [0.6, 1.6, 0.03], [(k - 1) * 0.6, 0.9, (k % 2) * 0.1]);
      break;
    }
    case "firstAidSign": {
      box("#ffffff", [0.7, 0.7, 0.03], [0, 1.9, 0.02]);
      box("#3c9a5f", [0.45, 0.14, 0.01], [0, 1.9, 0.045]);
      box("#3c9a5f", [0.14, 0.45, 0.01], [0, 1.9, 0.045]);
      break;
    }
    case "toolWall": {
      box("#c8b08a", [4.0, 1.4, 0.05], [0, 1.6, 0.02]);
      for (let k = 0; k < 10; k += 1) box(["#d64f4f", "#3a3f47", "#f2c230"][k % 3], [0.06, 0.35, 0.04], [-1.6 + k * 0.36, 1.6 + (k % 2) * 0.2, 0.07]);
      break;
    }
    case "partsBins": {
      for (let k = 0; k < 12; k += 1) box(["#3f7fbf", "#e08a3c", "#3c9a5f", "#f2c230"][k % 4], [0.3, 0.2, 0.35], [(k % 4) * 0.32 - 0.48, 0.3 + Math.floor(k / 4) * 0.4, 0]);
      break;
    }
    case "recycleBins": {
      ["#2e6fbf", "#d64f4f", "#3c9a5f", "#f2c230"].forEach((c, k) => {
        box(c, [0.4, 0.75, 0.4], [(k - 1.5) * 0.45, 0.38, 0]);
        box("#2a2a2a", [0.42, 0.04, 0.42], [(k - 1.5) * 0.45, 0.77, 0]);
      });
      decor.push({ text: "Coleta seletiva", pos: at(0, 1.1, 0.21), rot: [0, r, 0], w: 1.6, h: 0.25, bg: "#3c9a5f", color: "#ffffff" });
      break;
    }
    case "gremioBoard": {
      cyl("metal", 0.05, 1.8, [-1.0, 0.9, 0], 6);
      cyl("metal", 0.05, 1.8, [1.0, 0.9, 0], 6);
      box("#6d4aa8", [2.2, 1.1, 0.06], [0, 1.4, 0]);
      for (let k = 0; k < 5; k += 1) box(["#f2d16b", "#ffffff", "#9ad0a8"][k % 3], [0.32, 0.36, 0.01], [-0.75 + k * 0.38, 1.35, 0.04]);
      decor.push({ text: "Mural do Grêmio", sub: "Avisos da semana", pos: at(0, 1.82, 0.04), rot: [0, r, 0], w: 1.8, h: 0.28, bg: "#4b2f7a", color: "#ffffff" });
      break;
    }
    case "dispenser": {
      box("#ffffff", [0.22, 0.32, 0.12], [0, 1.35, 0]);
      box("#3e8fa8", [0.18, 0.06, 0.13], [0, 1.25, 0.005]);
      break;
    }
    case "canopy": {
      box("metal", [7.0, 0.08, 1.8], [0, 2.5, 0]);
      for (const lx of [-3.3, 3.3]) cyl("metal", 0.05, 2.5, [lx, 1.25, 0.8], 6);
      break;
    }
    case "sectorSign": {
      cyl("metal", 0.04, 2.0, [0, 1.0, 0], 6);
      box("#3f7fbf", [0.9, 0.5, 0.05], [0, 2.05, 0]);
      break;
    }
    case "mediationTable": {
      cyl("wood", 0.6, 0.05, [0, 0.74, 0], 18);
      cyl("metal", 0.05, 0.72, [0, 0.36, 0], 8);
      cyl("#9ad0a8", 0.08, 0.12, [0.2, 0.82, 0], 8);
      break;
    }
    case "acUnit": {
      box("#f2f2f0", [1.0, 0.3, 0.22], [2.2, 2.75, 0.1]);
      box("#cfd5da", [0.9, 0.04, 0.02], [2.2, 2.65, 0.21]);
      break;
    }
    case "stall": {
      box("#d9d2c4", [0.05, 2.0, 1.4], [-0.62, 1.0, 0]);
      box("#d9d2c4", [0.05, 2.0, 1.4], [0.62, 1.0, 0]);
      box("#6d4aa8", [1.2, 1.75, 0.04], [0, 1.0, 0.7]);
      box("metal", [0.05, 0.12, 0.05], [0.45, 1.0, 0.73]);
      box("#f7f7f5", [0.38, 0.42, 0.55], [0, 0.21, -0.35]);
      box("#f7f7f5", [0.36, 0.3, 0.14], [0, 0.72, -0.64]);
      cyl("#ffffff", 0.06, 0.1, [0.42, 0.75, -0.3], 8);
      break;
    }
    case "stallOld": {
      box("metal", [1.3, 2.0, 0.06], [0, 1.0, 0]);
      box("#c9ced6", [1.2, 1.7, 0.03], [0.05, 1.05, 0.04]);
      break;
    }
    case "mirror": {
      box("glass", [1.6, 0.9, 0.03], [0, 1.55, 0]);
      break;
    }
    case "bed": {
      box("metal", [1.0, 0.5, 2.0], [0, 0.25, 0]);
      box(WHITE, [0.95, 0.16, 1.95], [0, 0.58, 0]);
      box("#dfe6ee", [0.7, 0.12, 0.35], [0, 0.7, -0.7]);
      break;
    }
    case "workbench": {
      box("wood", [2.6, 0.1, 0.9], [0, 0.85, 0]);
      box("metal", [0.1, 0.8, 0.8], [-1.2, 0.4, 0]);
      box("metal", [0.1, 0.8, 0.8], [1.2, 0.4, 0]);
      if (quality > 0) {
        box("#8a6b3f", [0.4, 0.06, 0.2], [-0.6, 0.94, 0]);
        box("#5f6b74", [0.3, 0.2, 0.2], [0.5, 1.0, 0]);
      }
      break;
    }
    case "tools": {
      box("wood", [2.2, 1.4, 0.08], [0, 1.5, 0]);
      for (let k = 0; k < 6; k += 1) {
        box(k % 2 === 0 ? "metal" : "#c98a3c", [0.06, 0.32, 0.04], [-0.8 + k * 0.3, 1.5, 0.06]);
      }
      break;
    }
    case "printer3d": {
      box(DARK, [0.7, 0.8, 0.7], [0, 0.9, 0]);
      box("metal", [0.6, 0.5, 0.6], [0, 1.55, 0]);
      box("#6bd3a0", [0.04, 0.04, 0.04], [0.2, 1.3, 0.3]);
      box("wood", [1.0, 0.5, 0.8], [0, 0.25, 0]);
      break;
    }
    default:
      break;
  }
  return decor;
}

function constructionVisuals(builder: GeoBuilder, stage: number, w: number, d: number) {
  // hoarding / tapumes
  builder.box("metal", [w + 1.2, 0.05, 0.06], [0, 1.9, d / 2 + 0.8], { tile: 1 });
  for (let k = 0; k < Math.max(2, Math.round(w / 2.4)); k += 1) {
    const x = -w / 2 + 0.6 + k * 2.4;
    builder.box("#c9b28a", [2.2, 1.9, 0.06], [x, 0.95, d / 2 + 0.8], { tile: 1.4 });
    builder.box("metal", [0.08, 2.0, 0.08], [x - 1.1, 1.0, d / 2 + 0.8], { tile: 1 });
  }
  // material pallets
  builder.box("wood", [1.6, 0.14, 1.1], [-w / 2 + 1.2, 0.07, d / 2 + 2.0], { tile: 1 });
  for (let k = 0; k < 3; k += 1) builder.box("#a5644b", [1.4, 0.14, 0.9], [-w / 2 + 1.2, 0.18 + k * 0.15, d / 2 + 2.0], { tile: 0.8 });
  builder.box("#cbc9c3", [0.8, 0.5, 0.6], [w / 2 - 1.4, 0.25, d / 2 + 2.1], { tile: 1 });
  builder.box("dirt", [w + 3, 0.04, d + 3], [0, 0.02, 0], { tile: 2.4 });
  // scaffold when structure is up
  if (stage >= 2 && stage <= 6) {
    for (let k = 0; k < 3; k += 1) {
      builder.cylinder("metal", 0.04, 0.04, 3.2, [-w / 2 - 0.6 + k * 1.6, 1.6, d / 2 + 0.35], { segments: 6 });
      builder.cylinder("metal", 0.04, 0.04, 3.2, [-w / 2 - 0.6 + k * 1.6, 1.6, d / 2 + 1.4], { segments: 6 });
    }
    for (let level = 0; level < 3; level += 1) {
      builder.box("metal", [3.6, 0.06, 1.15], [-w / 2 + 1.0, 1.0 + level, d / 2 + 0.9], { tile: 1 });
    }
  }
}

function addOpenArea(builder: GeoBuilder, kind: BuildingKind, w: number, d: number) {
  if (kind === "court") {
    builder.box("concrete", [w + 1.2, 0.14, d + 1.2], [0, 0.07, 0], { tile: 2.4 });
    builder.plane("#ae7664", w, d, [0, 0.15, 0]);
    const fieldD = d - 2;
    const centerZ = -0.8;
    builder.plane("courtPaint", w - 1, fieldD - 2, [0, 0.153, centerZ], { tile: 3 });
    // court markings
    builder.box(WHITE, [w - 1, 0.01, 0.08], [0, 0.16, centerZ - fieldD / 2 + 1], { tile: 1 });
    builder.box(WHITE, [w - 1, 0.01, 0.08], [0, 0.16, centerZ + fieldD / 2 - 1], { tile: 1 });
    builder.box(WHITE, [0.08, 0.01, fieldD - 2], [-w / 2 + 0.5, 0.16, centerZ], { tile: 1 });
    builder.box(WHITE, [0.08, 0.01, fieldD - 2], [w / 2 - 0.5, 0.16, centerZ], { tile: 1 });
    builder.box(WHITE, [0.08, 0.01, fieldD - 2], [0, 0.16, centerZ], { tile: 1 });
    const circle = new THREE.RingGeometry(1.72, 1.80, 48);
    circle.rotateX(-Math.PI / 2);
    circle.translate(0, 0.172, centerZ);
    builder.raw(WHITE, circle);
    const endX = w / 2 - 0.5;
    const areaDepth = Math.min(3.1, w * 0.18);
    const areaWidth = Math.min(6.2, d * 0.55);
    for (const side of [-1, 1]) {
      const x = side * (endX - areaDepth / 2);
      builder.plane("#547b80", areaDepth, areaWidth, [x, 0.156, centerZ]);
      for (const edge of [-1, 1]) {
        builder.box(WHITE, [areaDepth, 0.01, 0.08], [x, 0.165, centerZ + edge * areaWidth / 2]);
      }
      builder.box(WHITE, [0.08, 0.01, areaWidth], [side * (endX - areaDepth), 0.165, centerZ]);
    }
    // fence
    for (let k = 0; k < Math.round(w / 2.5); k += 1) {
      builder.cylinder("metal", 0.05, 0.05, 2.4, [-w / 2 + k * 2.5, 1.2, -d / 2 - 0.5], { segments: 6 });
      builder.cylinder("metal", 0.05, 0.05, 2.4, [-w / 2 + k * 2.5, 1.2, d / 2 + 0.5], { segments: 6 });
    }
    for (let level = 0; level < 3; level += 1) {
      builder.box("metal", [w + 0.2, 0.04, 0.04], [0, 0.7 + level * 0.8, -d / 2 - 0.5], { tile: 1 });
    }
    // alambrado: tela nas laterais e fundos (a frente da arquibancada fica aberta para o acesso)
    builder.box("#7b8790", [w + 0.1, 2.3, 0.02], [0, 1.2, -d / 2 - 0.5], { tile: 1 });
    for (const sx of [-1, 1]) {
      for (let k = 0; k <= Math.round((d + 1) / 2.5); k += 1) builder.cylinder("metal", 0.05, 0.05, 2.4, [sx * (w / 2 + 0.5), 1.2, -d / 2 - 0.5 + k * 2.5], { segments: 6 });
      builder.box("#7b8790", [0.02, 2.3, d + 1], [sx * (w / 2 + 0.5), 1.2, 0], { tile: 1 });
    }
  } else if (kind === "corridor") {
    builder.box("concrete", [w, 0.12, d], [0, 0.06, 0], { tile: 2 });
    builder.plane("terrazzo", w - 0.1, d - 0.1, [0, 0.125, 0], { tile: 2 });
    for (const sx of [-1, 1]) for (let k = 0; k <= Math.round(d / 2.6); k += 1) {
      builder.cylinder("metal", 0.07, 0.07, 2.9, [sx * (w / 2 - 0.15), 1.5, -d / 2 + 0.2 + k * ((d - 0.4) / Math.round(d / 2.6))], { segments: 8 });
    }
    builder.box("metal", [w + 0.5, 0.1, d + 0.2], [0, 3.0, 0], { tile: 1.5 });
    builder.box("#6d4aa8", [0.06, 0.22, d + 0.2], [w / 2 + 0.25, 2.92, 0]);
    builder.box("#6d4aa8", [0.06, 0.22, d + 0.2], [-w / 2 - 0.25, 2.92, 0]);
    builder.box("lamp", [0.4, 0.04, 0.4], [0, 2.93, 0]);
  } else if (kind === "patio") {
    builder.box("concrete", [w + 1, 0.12, d + 1], [0, 0.06, 0], { tile: 2.4 });
    builder.plane("sidewalk", w, d, [0, 0.13, 0], { tile: 2.4 });
    for (let k = 0; k < 3; k += 1) builder.plane("#8a8073", 5.2, 0.22, [0, 0.14, -d / 4 + k * 3.4], { tile: 1 });
  } else if (kind === "garden") {
    builder.plane("grass", w, d, [0, 0.14, 0], { tile: 3 });
    builder.box("concrete", [w, 0.12, 1.6], [0, 0.06, d / 2 - 0.8], { tile: 2.4 });
    builder.box("dirt", [w - 2, 0.1, 2.2], [0, 0.15, -d / 4], { tile: 2 });
    for (let k = 0; k < 7; k += 1) {
      builder.sphere("#5f8d4c", 0.28, [-w / 2 + 1.4 + k * ((w - 2.8) / 6), 0.32, -d / 4 + (k % 2) * 0.7], { detail: 1 });
    }
  } else if (kind === "path" || kind === "tactile") {
    builder.plane(kind === "tactile" ? "tactile" : "sidewalk", w, d, [0, 0.16, 0], { tile: kind === "tactile" ? 1 : 2.4 });
    if (kind === "tactile") {
      builder.box("#e8c53d", [w, 0.04, 0.24], [0, 0.19, -d / 2 + 0.3], { tile: 1 });
    }
  }

}

/** Identidade de materiais por ambiente: piso e revestimento interno compartilham mapas PBR (sem cópias por prédio). */
const FLOOR_BY_KIND: Partial<Record<BuildingKind, string>> = {
  classroom: "terrazzo", study: "wood", bathroom: "ceramic", canteen: "ceramic", library: "darkwood", lab: "vinyl", computer: "vinyl",
  media: "carpet", infirmary: "vinyl", reception: "terrazzo", staffroom: "wood", auditorium: "carpet", arts: "concrete", design: "wood", makerspace: "concrete",
};
const LINING_BY_KIND: Partial<Record<BuildingKind, { mat: string; h: number; band?: string }>> = {
  bathroom: { mat: "wallTile", h: 2.1, band: "#3e8fa8" },
  canteen: { mat: "wallTile", h: 1.6, band: "#e08a3c" },
  infirmary: { mat: "wallTile", h: 1.5, band: "#3c9a5f" },
  lab: { mat: "wallTile", h: 1.2, band: "#3f7fbf" },
  library: { mat: "woodWall", h: 1.1 },
  staffroom: { mat: "woodWall", h: 1.0 },
  auditorium: { mat: "woodWall", h: 2.2 },
  classroom: { mat: "#d9cfe8", h: 1.1, band: "#6d4aa8" },
};

const SECTOR_COLOR: Record<string, string> = {
  ensino: "#3f7fbf",
  convivencia: "#e08a3c",
  esportes: "#3c9a5f",
  administracao: "#6d4aa8",
  apoio: "#2e8b8b",
};

/** Silhuetas próprias por ambiente: reconhecíveis na câmera de gestão e de perto. */
function addIdentity(b: GeoBuilder, kind: BuildingKind, w: number, d: number, H: number, door: number, color: string, roofs: boolean, sh: SharedSides, tier: number) {
  const halfW = w / 2;
  const halfD = d / 2;
  if (kind === "classroom" || kind === "study") {
    for (let k = 0; k < Math.floor(d / 0.9); k += 1) for (const side of [-1, 1]) if (!((side < 0 && sh.left) || (side > 0 && sh.right))) b.box(color, [0.32, H - 0.6, 0.06], [side * (halfW + 0.22), H / 2 + 0.3, -halfD + 0.5 + k * 0.9], { rotY: 0.6 * side });
  } else if (kind === "library" && !sh.left) {
    b.box("wood", [3.6, 0.12, d - 1], [-halfW - 1.8, 0.3, 0], { tile: 1.2 });
    for (let k = 0; k < 4; k += 1) b.box("wood", [0.12, 2.6, 0.12], [-halfW - 3.4, 1.6, -halfD + 1 + k * ((d - 2) / 3)]);
    for (let k = 0; k < 9; k += 1) b.box("wood", [3.6, 0.08, 0.14], [-halfW - 1.8, 2.9, -halfD + 0.8 + k * ((d - 1.6) / 8)]);
  } else if (kind === "bathroom" || kind === "infirmary") {
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 5; j += 1) b.box("#f2efe6", [0.36, 0.36, 0.14], [door + 1.4 + i * 0.4, 0.6 + j * 0.4, halfD + 0.1]);
  } else if ((kind === "lab" || kind === "computer" || kind === "media") && !sh.back) {
    b.box("glass", [w - 2, 0.6, 0.05], [0, H - 0.25, -halfD - 0.04], { tile: 1 });
    for (let k = 0; k < 6; k += 1) b.box(color, [0.08, 0.7, 0.4], [-halfW + 1.2 + k * ((w - 2.4) / 5), H - 0.25, -halfD - 0.2]);
  } else if (kind === "makerspace") {
    b.box("metal", [w + 0.05 * ((sh.left ? 0 : 1) + (sh.right ? 0 : 1)), 1.2, d + 0.05 * ((sh.back ? 0 : 1) + (sh.front ? 0 : 1))], [0.025 * ((sh.right ? 0 : 1) - (sh.left ? 0 : 1)), H - 0.4, 0.025 * ((sh.front ? 0 : 1) - (sh.back ? 0 : 1))], { tile: 1 });
    b.box("glass", [3.2, 2.2, 0.05], [halfW * 0.45, 1.4, halfD + 0.02], { tile: 1 });
    if (roofs) for (let k = 0; k < 4; k += 1) b.box("metal", [w + 0.6, 0.1, 1.6], [0, H + 0.8, -halfD + 1 + k * ((d - 1) / 3)], { rotX: 0.35, tile: 1.5 });
  } else if (kind === "canteen") {
    b.box(color, [w * 0.6, 0.14, 2.2], [door + 1.5, 2.7, halfD + 1.1], { tile: 1 });
    for (const x of [door - 1, door + 4]) b.cylinder("metal", 0.05, 0.05, 2.6, [x, 1.35, halfD + 2.1], { segments: 6 });
  } else if (kind === "reception") {
    b.box("#6d4aa8", [3.4, 0.35, 0.35], [door, 3.0, halfD + 0.3]);
    b.box("#6d4aa8", [0.35, 2.8, 0.35], [door - 1.6, 1.6, halfD + 0.3]);
    b.box("#6d4aa8", [0.35, 2.8, 0.35], [door + 1.6, 1.6, halfD + 0.3]);
  } else if (kind === "auditorium") {
    if (roofs) b.box("#6a5f74", [w * 0.7, 2.2, 3.2], [0, H + 1.4, -halfD + 1.8], { tile: 2 });
  } else if ((kind === "arts" || kind === "design") && !sh.back) {
    ["#e08a3c", "#3f7fbf", "#f2c230", "#3c9a5f"].forEach((c, k) => b.box(c, [1.2, 1.6, 0.04], [-halfW + 1.2 + k * 1.4, 1.6, -halfD - 0.05]));
  } else if (kind === "staffroom") {
    b.box("wood", [w - 1, 0.1, 1.2], [0, 2.8, halfD + 0.6], { tile: 1.2 });
  }
  // reformas visíveis: nível 1 marquise e faixa roxa; nível 2 revestimento, jardineiras e luminárias de fachada
  if (tier >= 1) {
    b.box("#6d4aa8", [w - 0.4, 0.22, 0.08], [0, H - 0.15, halfD + 0.06]);
    b.box("metal", [w * 0.55, 0.1, 1.3], [0, 2.75, halfD + 0.65], { tile: 1 });
  }
  if (tier >= 2) {
    for (let k = 0; k < Math.floor((w - 1) / 0.5); k += 1) if (Math.abs(-halfW + 0.75 + k * 0.5 - door) > 1.2) b.box("woodWall", [0.12, 1.4, 0.06], [-halfW + 0.75 + k * 0.5, 1.75, halfD + 0.05], { tile: 1 });
    for (const side of [-1, 1]) {
      b.box("concrete", [1.6, 0.5, 0.6], [door + side * 2.6, 0.5, halfD + 0.6], { tile: 1 });
      b.box("#3f7f3a", [1.4, 0.35, 0.45], [door + side * 2.6, 0.9, halfD + 0.6]);
      b.box("lamp", [0.12, 0.3, 0.1], [door + side * 1.5, 2.3, halfD + 0.08]);
    }
  }
}

export function buildBuildingGeometry(
  building: BuildingInstance,
  options: { showRoofs: boolean; quality: number; improvements: string[]; schoolName: string; schoolColor: string; shared?: SharedSides; roomLabel?: string; tier?: number; paint?: string | null; plateColor?: string | null; benchColor?: string | null; facade?: string },
) {
  benchColor = options.benchColor ?? "#b9855c";
  let spec = specFor(building.kind);
  const { w, d } = spec;
  const stage = building.progress >= 1 ? 7 : buildingStage(building.progress).index;
  const decor: Decor[] = [];

  if (spec.open) {
    const builder = new GeoBuilder();
    addOpenArea(builder, building.kind, w, d);
    if (building.kind !== "path" && building.kind !== "tactile") {
      const items = [...furnitureFor(building.kind, w, d), ...upgradeFurniture(building, w, d)].filter((x) => x.type !== "courtRoof");
      if (building.upgrades?.includes("coberturaQuadra") && building.kind === "court") {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) builder.cylinder("metal", 0.12, 0.12, 6.2, [sx * (w / 2 - 0.3), 3.1, sz * (d / 2 - 0.3)], { segments: 8 });
        builder.box("metal", [w + 0.6, 0.12, d + 0.6], [0, 6.25, 0], { tile: 2 });
        for (let k = 0; k < 6; k += 1) builder.box("#d9dde2", [w + 0.4, 0.08, (d + 0.6) / 6 - 0.05], [0, 6.36, -d / 2 + (k + 0.5) * ((d + 0.6) / 6) - 0.3], { tile: 2 });
      }
      const totalSeats = items.filter((item) => item.type === "bleacher").length;
      let seat = 0;
      let goal = 0;
      let hoop = 0;
      for (const original of items) {
        let item = original;
        if (building.kind === "court") {
          if (original.type === "bleacher") {
            const spacing = Math.min(1.44, (w - 1.6) / Math.max(1, totalSeats));
            item = { ...original, x: (seat++ - (totalSeats - 1) / 2) * spacing, z: d / 2 - 1.28, rot: 2 };
          } else if (original.type === "goal" || original.type === "hoop") {
            const isGoal = original.type === "goal";
            const side = ((isGoal ? goal++ : hoop++) % 2 === 0) ? -1 : 1;
            item = { ...original, x: side * (w / 2 - (isGoal ? 0.5 : 0.35)), z: -0.8, rot: side < 0 ? 1 : 3 };
          }
        }
        decor.push(...addFurniture(builder, item, options.quality));
      }
    }
    return { parts: builder.build(), decor, stage };
  }

  const builder = new GeoBuilder();
  const sh: SharedSides = options.shared ?? { front: false, back: false, left: false, right: false };
  const exL = sh.left ? 0 : 1, exR = sh.right ? 0 : 1, exB = sh.back ? 0 : 1, exF = sh.front ? 0 : 1;
  const H = 3.35;
  const t = 0.26;
  const halfW = w / 2;
  const halfD = d / 2;
  const frontWallHeight = options.showRoofs ? H : 0.55;
  const door = building.kind === "classroom" ? -w * 0.18 : building.kind === "canteen" ? -w * 0.15 : 0;

  if (stage <= 0) {
    constructionVisuals(builder, stage, w, d);
  } else {
    // foundation / slab
    builder.box("concrete", [w + 0.25 * (exL + exR), 0.24, d + 0.25 * (exB + exF)], [0.125 * (exR - exL), 0.12, 0.125 * (exF - exB)], { tile: 2.4 });
    builder.plane(building.floorStyle ?? FLOOR_BY_KIND[building.kind] ?? spec.floor, w - 0.2, d - 0.2, [0, 0.26, 0], { tile: 2 });
    const lining = LINING_BY_KIND[building.kind];
    if (lining && stage >= 5) {
      const lh = lining.h;
      builder.box(lining.mat, [w - 2 * t - 0.04, lh, 0.02], [0, 0.26 + lh / 2, -halfD + t + 0.012], { tile: 1.2 });
      builder.box(lining.mat, [0.02, lh, d - 2 * t - 0.04], [-halfW + t + 0.012, 0.26 + lh / 2, 0], { tile: 1.2 });
      builder.box(lining.mat, [0.02, lh, d - 2 * t - 0.04], [halfW - t - 0.012, 0.26 + lh / 2, 0], { tile: 1.2 });
      if (lining.band) builder.box(lining.band, [w - 2 * t - 0.03, 0.1, 0.025], [0, 0.26 + lh + 0.05, -halfD + t + 0.013], { tile: 1 });
    }
    // skirting
    builder.box("#cfc7b8", [w, 0.18, t], [0, 0.35, halfD - t / 2], { tile: 1.6 });
    builder.box("#cfc7b8", [w, 0.18, t], [0, 0.35, -halfD + t / 2], { tile: 1.6 });
    builder.box("#cfc7b8", [t, 0.18, d], [halfW - t / 2, 0.35, 0], { tile: 1.6 });
    builder.box("#cfc7b8", [t, 0.18, d], [-halfW + t / 2, 0.35, 0], { tile: 1.6 });
  }

  if (stage >= 2) {
    // columns + beams
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        builder.box("concrete", [0.34, H, 0.34], [sx * (halfW - 0.2), H / 2, sz * (halfD - 0.2)], { tile: 1.6 });
      }
    }
    if (stage <= 3) {
      for (let k = 0; k < Math.round(w / 3.2); k += 1) {
        builder.box("concrete", [0.22, H, 0.22], [-halfW + 1.4 + k * 3.2, H / 2, -halfD + 0.4], { tile: 1.6 });
      }
    }
  }

  if (options.paint && (building.kind === "classroom" || building.kind === "study" || building.kind === "library")) spec = { ...spec, wall: options.paint };
  if (building.paint) spec = { ...spec, wall: building.paint };
  const facadeModel = options.facade ?? "classica";
  if (facadeModel === "tijolo") spec = { ...spec, wall: "brick" };
  if (facadeModel === "colonial" && !building.paint) spec = { ...spec, wall: "#f4f1ea" };
  if (stage >= 3) {
    const wallHeight = stage >= 4 ? H : 1.9;
    builder.box(spec.wall, [w, wallHeight, t], [0, wallHeight / 2 + 0.26, -halfD + t / 2], { tile: 2 });
    builder.box(spec.wall, [t, wallHeight, d], [halfW - t / 2, wallHeight / 2 + 0.26, 0], { tile: 2 });
    builder.box(spec.wall, [t, wallHeight, d], [-halfW + t / 2, wallHeight / 2 + 0.26, 0], { tile: 2 });
    // front wall: door opening + cutaway
    const frontHeight = stage >= 5 ? frontWallHeight : Math.min(frontWallHeight, 1.2);
    const doorLeft = door - 0.75;
    const doorRight = door + 0.75;
    const segments: [number, number][] = [
      [-halfW, doorLeft],
      [doorRight, halfW],
    ];
    segments.forEach(([a, b]) => {
      if (b - a < 0.1) return;
      builder.box(spec.wall, [b - a, frontHeight, t], [(a + b) / 2, frontHeight / 2 + 0.26, halfD - t / 2], { tile: 2 });
    });
    if (frontHeight > 2.1) {
      builder.box(spec.wall, [1.5, frontHeight - 2.1, t], [door, 2.1 + (frontHeight - 2.1) / 2 + 0.26, halfD - t / 2], { tile: 2 });
    }
    builder.box("metal", [0.1, 2.1, t + 0.12], [doorLeft, 1.31, halfD - t / 2], { tile: 1 });
    builder.box("metal", [0.1, 2.1, t + 0.12], [doorRight, 1.31, halfD - t / 2], { tile: 1 });
    builder.box("metal", [1.6, 0.1, t + 0.12], [door, 2.4, halfD - t / 2], { tile: 1 });
    builder.box("glass", [1.3, 2.0, 0.04], [door, 1.3, halfD - 0.06], { tile: 1 });
    builder.box("metal", [0.04, 0.5, 0.06], [door + 0.5, 1.25, halfD - 0.02], { tile: 1 });
    // window frames on side and back walls
    if (stage >= 5) {
      const windows = sh.back ? 0 : Math.max(2, Math.round(w / 3.4));
      for (let k = 0; k < windows; k += 1) {
        const x = -halfW + 1.6 + (k * (w - 3.2)) / Math.max(1, windows - 1);
        builder.box("glass", [1.5, 1.25, 0.05], [x, 1.85, -halfD - 0.035], { tile: 1 });
        builder.box("#e6e1d6", [1.6, 0.07, 0.09], [x, 2.5, -halfD - 0.06], { tile: 1 });
        builder.box("#e6e1d6", [1.6, 0.07, 0.09], [x, 1.2, -halfD - 0.06], { tile: 1 });
        builder.box("#e6e1d6", [0.07, 1.3, 0.09], [x - 0.78, 1.85, -halfD - 0.06], { tile: 1 });
        builder.box("#e6e1d6", [0.07, 1.3, 0.09], [x + 0.78, 1.85, -halfD - 0.06], { tile: 1 });
      }
      const sideWindows = Math.max(1, Math.round(d / 4));
      for (const side of [-1, 1]) {
        if ((side < 0 && sh.left) || (side > 0 && sh.right)) continue; // parede compartilhada: sem janela para a sala vizinha
        for (let k = 0; k < sideWindows; k += 1) {
          const z = -halfD + 2.0 + (k * (d - 4)) / Math.max(1, sideWindows - 1);
          for (const offset of [-0.65, 0, 0.65]) {
            builder.box(DARK, [0.09, 1.26, 0.06], [side * (halfW + 0.07), 1.85, z + offset]);
          }
          builder.box("glass", [0.05, 1.2, 1.3], [side * (halfW + 0.035), 1.85, z], { tile: 1 });
          builder.box("#e6e1d6", [0.09, 0.07, 1.4], [side * (halfW + 0.06), 2.48, z], { tile: 1 });
          builder.box("#e6e1d6", [0.09, 0.07, 1.4], [side * (halfW + 0.06), 1.22, z], { tile: 1 });
        }
      }
      // Faixa de tijolo aparente e peitoris contínuos nas duas laterais.
      for (const side of [-1, 1]) {
        if ((side < 0 && sh.left) || (side > 0 && sh.right) || facadeModel === "moderna" || facadeModel === "tijolo") continue;
        if (facadeModel === "colonial") { builder.box("#c99a4a", [0.065, 0.9, d - 0.45], [side * (halfW + 0.03), 0.72, 0]); continue; }
        builder.box("#b27e65", [0.065, 0.69, d - 0.45], [side * (halfW + 0.03), 0.72, 0]);
        builder.box("concrete", [0.19, 0.09, d - 0.42], [side * (halfW + 0.05), 1.105, 0]);
      }
      // entrance canopy + accessible ramp
      builder.box(options.schoolColor, [2.8, 0.16, 1.5], [door, 2.62, halfD + 0.7], { tile: 1 });
      builder.cylinder("metal", 0.05, 0.05, 2.5, [door + 1.2, 1.25, halfD + 1.25], { segments: 6 });
      builder.cylinder("metal", 0.05, 0.05, 2.5, [door - 1.2, 1.25, halfD + 1.25], { segments: 6 });
      builder.box("concrete", [2.6, 0.14, 1.1], [door, 0.2, halfD + 0.6], { tile: 1.6 });
      if (building.accessible) {
        builder.box("concrete", [2.4, 0.08, 1.8], [door, 0.25, halfD + 1.5], { rotX: -0.08, tile: 1.6 });
        builder.box("tactile", [1.9, 0.03, 0.35], [door, 0.31, halfD + 2.35], { tile: 1 });
        builder.cylinder("#2d6fa8", 0.24, 0.24, 0.05, [door + 1.2, 1.7, halfD + 0.4], { rotX: Math.PI / 2, segments: 12 });
      }
    }
  }

  if (stage >= 5) {
    // thin cornice / band in school colour
    if (options.showRoofs) {
      builder.box(options.schoolColor, [w + 0.2, 0.16, 0.12], [0, H + 0.26, halfD + 0.04], { tile: 1 });
    }
    const sector = SECTOR_COLOR[spec.category] ?? options.schoolColor;
    if (!sh.right) builder.box(sector, [0.12, 0.16, d + 0.2], [halfW + 0.04, H + 0.26, 0], { tile: 1 });
    if (!sh.left) builder.box(sector, [0.12, 0.16, d + 0.2], [-halfW - 0.04, H + 0.26, 0], { tile: 1 });
    addIdentity(builder, building.kind, w, d, H, door, sector, options.showRoofs, sh, options.tier ?? 0);
    if (facadeModel === "moderna") {
      for (const side of [-1, 1]) if (!((side < 0 && sh.left) || (side > 0 && sh.right))) builder.box("#6d4aa8", [0.08, H - 0.4, 0.24], [side * (halfW + 0.05), H / 2 + 0.2, halfD - 0.3]);
      builder.box("#6d4aa8", [w * 0.9, 0.08, 0.1], [0, 1.15, halfD + 0.04]);
    }
    const label = options.roomLabel ?? BUILDABLE_BY_KIND[building.kind]?.name ?? "";
    const reception = building.kind === "reception";
    const bath = building.kind === "bathroom";
    decor.push({
      text: label,
      sub: bath ? "Feminino · Masculino · Acessível" : reception ? options.schoolName : undefined,
      pos: [door + (reception ? 0 : 1.55), reception ? 3.3 : 2.3, halfD + 0.16],
      rot: [0, 0, 0],
      w: reception ? 3.2 : bath ? 2.0 : 1.6,
      h: reception ? 0.75 : bath ? 0.6 : 0.42,
      bg: bath ? "#2d6fa8" : options.plateColor ?? "#ffffff",
      color: bath || options.plateColor ? "#ffffff" : "#2a2440",
      border: sector,
    });
    if (building.kind === "classroom") {
      decor.push({ text: "Bem-vindos", sub: "Turma A · PEG", pos: [-1.4, 1.6, -halfD + 0.17], rot: [0, 0, 0], w: 1.5, h: 0.9, bg: "#f2efe6", color: "#6d4aa8" });
      decor.push({ text: "Grêmio", pos: [2.0, 1.7, -halfD + 0.17], rot: [0, 0, 0], w: 1.1, h: 0.7, bg: "#efd9a8", color: "#5b4426" });
    }
    if (building.kind === "canteen") {
      decor.push({ text: "CANTINA", sub: "Merenda · R$ 7,00", pos: [0, 1.8, -halfD + t + 0.04], rot: [0, 0, 0], w: 2.4, h: 0.7, bg: "#3d2f4f", color: "#ffe9b8" });
    }
  }

  if (stage >= 6) {
    if (options.showRoofs) {
      // full roof: only when the player chose to show roofs
      builder.box(spec.roof, [w + 0.35 * (exL + exR), 0.18, d + 0.35 * (exB + exF)], [0.175 * (exR - exL), H + 0.36, 0.175 * (exF - exB)], { tile: 2 });
      for (let k = 0; k < Math.round(d / 1.2); k += 1) {
        builder.box("roof", [w + 0.45 * (exL + exR) - 0.02, 0.12, 0.5], [0.225 * (exR - exL), H + 0.5 + (k % 2 === 0 ? 0.03 : 0), -halfD - 0.3 * exB + k * 1.2], { tile: 1.4 });
      }
    } else {
      // Arremates assentados nas paredes, inclusive na fachada em corte.
      for (const side of [-1, 1]) {
        builder.box(spec.roof, [0.32, 0.12, d], [side * (halfW - t / 2), H + 0.32, 0]);
      }
      builder.box(spec.roof, [w - 2 * t, 0.12, 0.32], [0, H + 0.32, -halfD + t / 2]);
    }
    if (options.showRoofs && options.improvements.includes("solar")) {
      for (let k = 0; k < 4; k += 1) {
        builder.box("#22354a", [1.6, 0.06, 1.0], [-halfW + 1.6 + k * 1.9, H + 0.68, 0.2], { rotX: -0.28, tile: 1 });
      }
    }
    if (options.improvements.includes("led")) {
      builder.box("#fff4d8", [w - 2, 0.06, 0.22], [0, H - 0.08, 0], { tile: 1 });
    }
  }

  if (stage >= 7) {
    [...furnitureFor(building.kind, w, d), ...upgradeFurniture(building, w, d)].forEach((item) => {
      const decorations = addFurniture(builder, item, options.quality);
      decor.push(...decorations);
    });
    // little details that read at iso distance: fans, posters, extinguisher
    builder.cylinder("#5d6470", 0.8, 0.8, 0.06, [-1.6, H - 0.2, 1.2], { segments: 16 });
    builder.box("#c94f3d", [0.22, 0.55, 0.22], [halfW - 0.5, 0.7, -halfD + 0.5], { tile: 1 });
    builder.box(WHITE, [0.3, 0.14, 0.02], [halfW - 0.5, 0.95, -halfD + 0.4], { tile: 1 });
  }

  if (stage < 7) constructionVisuals(builder, stage, w, d);

  return { parts: builder.build(), decor, stage };
}

export function ConstructionCrew({ site }: { site: BuildingInstance }) {
  const ref = useRef<THREE.Group>(null);
  const hammer = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.position.x = site.x - 2.2 + Math.sin(t * 0.4) * 0.8;
      ref.current.position.z = site.z + 4.6 + Math.cos(t * 0.35) * 0.5;
      ref.current.rotation.y = Math.sin(t * 0.4) * 0.5 + Math.PI;
    }
    if (hammer.current) hammer.current.rotation.x = -0.6 + Math.abs(Math.sin(t * 5)) * 0.8;
  });
  return (
    <group ref={ref} position={[site.x - 2.2, 0.05, site.z + 4.6]}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.5, 4, 8]} />
        <meshStandardMaterial color="#e8a33d" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color="#c68e64" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.2, 0.1, 12]} />
        <meshStandardMaterial color="#e8c53d" roughness={0.6} />
      </mesh>
      <mesh position={[0.16, 1.1, 0]} castShadow>
        <capsuleGeometry args={[0.07, 0.4, 3, 6]} />
        <meshStandardMaterial color="#c68e64" roughness={0.7} />
      </mesh>
      <group ref={hammer} position={[-0.2, 1.2, 0.05]}>
        <mesh position={[0, -0.2, 0.2]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.55]} />
          <meshStandardMaterial color="#8a6a45" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.2, 0.48]} castShadow>
          <boxGeometry args={[0.12, 0.16, 0.22]} />
          <meshStandardMaterial color="#6d727b" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
