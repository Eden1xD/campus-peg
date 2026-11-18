"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PLOT } from "../config";
import { SignLabel } from "./shared";
import type { QualityTier } from "../types";

type Triple = [number, number, number];
type Block = { pos: Triple; size: Triple; color: string; yaw: number; pitch: number };
type Label = { text: string; x: number; y: number; z: number; color: string };

function makeNeighborhood(quality: QualityTier) {
  const blocks: Block[] = [];
  const labels: Label[] = [];
  const detail = quality !== "low";
  const left = PLOT.minX - 12;
  const right = PLOT.maxX + 12;
  const back = PLOT.maxZ + 11;
  // A rua do portão está centrada em z = -33.2 e mede 7.4 m.
  const pavement = "#c8bcaa";
  const asphalt = "#535252";
  const trim = "#e4d8bf";
  const frame = "#455455";
  function box(pos: Triple, size: Triple, color: string, yaw = 0, pitch = 0) {
    blocks.push({ pos, size, color, yaw, pitch });
  }
  function facade(x: number, z: number, yaw: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return (lx: number, y: number, lz: number, w: number, h: number, d: number, color: string, pitch = 0) =>
      box([x + lx*c + lz*s, y, z - lx*s + lz*c], [w,h,d], color, yaw, pitch);
  }
  const fronts = [
    ["PADARIA", "#984f3b"], ["PAPELARIA", "#39716d"],
    ["MERCADO", "#667348"], ["OFICINA", "#4b667b"],
    ["SORVETERIA", "#a66362"],
  ];
  const span = right - left;
  box([(left+right)/2,0.02,-39], [span+7,0.14,4.1], pavement);
  for (const x of [left,right]) {
    const length = back + 36.9;
    box([x,0.018,back-length/2], [6.5,0.07,length], asphalt);
    const outward = x === left ? -1 : 1;
    box([x+4.55*outward,0.065,back-length/2], [2.6,0.15,length], pavement);
    for(let z=-27;z<back-4;z+=9) box([x,0.065,z],[0.09,0.012,3],"#e5d1a0");
  }
  box([(left+right)/2,0.02,back], [span+6.5,0.08,6.5], asphalt);
  box([(left+right)/2,0.06,back+4.55], [span+6.5,0.16,2.6], pavement);

  fronts.forEach(([name, accent], index) => {
    const x = (index-2)*11;
    const f = facade(x,-45,0);
    const h = index % 2 ? 5.2 : 4.4;
    f(0,h/2,0,10.4,h,8,"#dad1bc");
    f(0,h,0,10.6,0.22,8.25,trim);
    f(-2.45,1.53,4.05,4.65,2.4,0.13,frame);
    f(-2.45,1.58,4.13,4.3,2.12,0.06,"#7c999a");
    f(-2.45,1.58,4.18,0.1,2.15,0.07,trim);
    f(1.4,1.32,4.09,1.45,2.64,0.16,frame);
    f(3.52,1.2,4.08,2.1,2.4,0.13,"#aaa79b");
    if(detail) for(let n=0;n<6;n++) f(3.52,0.4+n*0.33,4.16,2.02,0.035,0.04,"#797d76");
    f(0,2.95,4.55,10.55,0.15,1.18,accent,0.13);
    f(0,3.63,4.11,9.9,0.98,0.15,accent);
    labels.push({text:name, x, y:3.63, z:-40.78, color:accent});
  });

  function house(x: number, z: number, yaw: number, index: number) {
    const f = facade(x,z,yaw);
    const walls = ["#d3b69c","#c3c9ae","#e1ccaa","#b5c5c5"];
    const h = index % 3 === 0 ? 5.6 : 3.25;
    f(0,h/2,0,7.3,h,6.4,walls[index%4]);
    const pitch = 0.26;
    for(const side of [-1,1])
      f(0,h+0.45,side*1.75,7.9,0.19,3.5/Math.cos(pitch),index%2 ? "#a36148":"#80584a",side*pitch);
    f(1.9,1.14,3.24,1.16,2.28,0.12,"#665348");
    for(let y=1.65;y<h-0.35;y+=2.55) {
      f(-1.5,y,3.25,2.25,1.18,0.14,frame);
      f(-1.5,y-0.62,3.36,2.48,0.10,0.30,trim);
      if(detail) f(-1.5,y,3.34,0.09,1.18,0.08,trim);
    }
    f(-1.0,0.38,4.85,5.2,0.76,0.19,walls[index%4]);
    f(1.93,0.06,4.23,1.32,0.12,2,pavement);
  }
  for(let i=0;i<5;i++) {
    const z=-24+i*((back+15)/4);
    house(left-11,z,Math.PI/2,i);
    house(right+11,z,-Math.PI/2,i+1);
  }

  for(let i=0;i<6;i++) {
    const x=left+5+i*(span-10)/5;
    const floors=[3,5,4,3,6,4][i];
    const f=facade(x,back+11,Math.PI);
    const h=floors*2.7;
    f(0,h/2,0,8.4,h,8.4,i%2 ? "#c3b4a3":"#d3cabc");
    f(0,h+0.09,0,8.72,0.18,8.72,trim);
    f(-1.5,h+0.75,0,2.3,1.35,2.5,"#9b978c");
    f(0,1.2,4.26,1.6,2.4,0.15,frame);
    for(let level=0;level<floors;level++) {
      for(const u of [-2.75,2.75]) f(u,1.55+level*2.7,4.24,1.65,1.16,0.13,"#597577");
      if(detail && level>0) {
        f(0,level*2.7+0.12,4.58,3.1,0.18,0.92,trim);
        f(0,level*2.7+0.55,4.98,3.1,0.72,0.12,"#aea594");
      }
    }
  }
  // Raised roadside poster between the last shop and the eastern corner.
  const boardX = right - 8;
  for (const offset of [-2.35, 2.35]) {
    box([boardX + offset, 2.82, -42.7], [0.17, 5.64, 0.21], frame);
    box([boardX + offset, 0.18, -42.7], [0.58, 0.36, 0.6], "#aea699");
  }
  box([boardX, 4.82, -42.5], [7.7, 2.92, 0.2], "#443a4e");
  for (const y of [3.68, 5.98]) box([boardX, y, -42.72], [7.45, 0.1, 0.15], frame);
  box([boardX, 3.48, -42.36], [7.48, 0.095, 0.05], "#d8ad67");
  return {blocks,labels};
}

export function Neighborhood({quality}: {quality: QualityTier}) {
  const data = useMemo(() => makeNeighborhood(quality), [quality]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const part = new THREE.Object3D();
    part.rotation.order = "YXZ";
    const color = new THREE.Color();
    data.blocks.forEach((b,i) => {
      part.position.set(...b.pos);
      part.scale.set(...b.size);
      part.rotation.set(b.pitch,b.yaw,0);
      part.updateMatrix();
      target.setMatrixAt(i,part.matrix);
      target.setColorAt(i,color.set(b.color));
    });
    target.instanceMatrix.needsUpdate = true;
    if(target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  },[data]);
  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined,undefined,data.blocks.length]} receiveShadow>
        <boxGeometry args={[1,1,1]} />
        <meshStandardMaterial roughness={0.92} />
      </instancedMesh>
      <SignLabel text="INTERCLASSES" sub="ESPORTE NA ESCOLA  ·  PEG"
        position={[PLOT.maxX + 4, 4.85, -42.38]} rotation={[0, 0, 0]}
        width={1024} height={384} worldWidth={7.45} worldHeight={2.58}
        color="#fff5df" background="#57426d" />
      {data.labels.map(label => (
        <SignLabel key={label.text} text={label.text} position={[label.x,label.y,label.z]}
          rotation={[0,0,0]} width={512} height={96} worldWidth={6.5} worldHeight={0.85}
          color="#fff5dd" background={label.color} />
      ))}
    </group>
  );
}
