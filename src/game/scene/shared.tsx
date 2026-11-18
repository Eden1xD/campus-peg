"use client";

import { useMemo } from "react";
import type {} from "@react-three/fiber";
import * as THREE from "three";
import { resolveMaterial } from "../materials";
import { labelCanvas } from "../textures";

export function MergedParts({
  parts,
  castShadow = true,
  receiveShadow = true,
}: {
  parts: Record<string, THREE.BufferGeometry>;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const entries = useMemo(() => Object.entries(parts), [parts]);
  return (
    <group>
      {entries.map(([key, geometry]) => (
        <mesh
          key={key}
          geometry={geometry}
          material={resolveMaterial(key)}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </group>
  );
}

interface LabelProps {
  text: string;
  sub?: string;
  width: number;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  background?: string;
  color?: string;
  border?: string;
  worldWidth?: number;
  worldHeight?: number;
  doubleSided?: boolean;
}

export function SignLabel({
  text,
  sub,
  width,
  height,
  position,
  rotation = [0, 0, 0],
  background = "#f4efe6",
  color = "#332a45",
  border,
  worldWidth,
  worldHeight,
  doubleSided = false,
}: LabelProps) {
  const texture = useMemo(() => {
    const canvas = labelCanvas(text, { width, height, background, color, sub, border });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [text, sub, width, height, background, color, border]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.65,
        metalness: 0.05,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      }),
    [texture, doubleSided],
  );
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <planeGeometry args={[worldWidth ?? 2, worldHeight ?? 1]} />
    </mesh>
  );
}

export function Billboard({
  text,
  sub,
  position,
  scale = 2.4,
  background = "#1b1626",
  color = "#f6f1ff",
}: {
  text: string;
  sub?: string;
  position: [number, number, number];
  scale?: number;
  background?: string;
  color?: string;
}) {
  const texture = useMemo(() => {
    const canvas = labelCanvas(text, { width: 512, height: 256, background, color, sub, border: "#8a6bbf" });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [text, sub, background, color]);
  const material = useMemo(() => new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }), [texture]);
  return <sprite position={position} scale={[scale, scale * 0.5, 1]} material={material} />;
}

export const SHARED = {
  skin: ["#5c3b28", "#8a5a3b", "#c68e64", "#e0b18a", "#3f2a1d", "#a06d4b"],
};
