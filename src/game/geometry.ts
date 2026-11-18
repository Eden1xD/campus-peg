import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type V3 = [number, number, number];

interface TransformOptions {
  rotY?: number;
  rotZ?: number;
  rotX?: number;
  tile?: number;
  scale?: V3;
}

function planarUV(geometry: THREE.BufferGeometry, tile: number) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;

  if (!uv) return;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));

    let u: number;
    let v: number;

    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }

    uv.setXY(i, u / tile, v / tile);
  }

  uv.needsUpdate = true;
}

function applyTransform(
  geometry: THREE.BufferGeometry,
  pos: V3,
  options?: TransformOptions,
) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      options?.rotX ?? 0,
      options?.rotY ?? 0,
      options?.rotZ ?? 0,
    ),
  );

  const scale = new THREE.Vector3(...(options?.scale ?? [1, 1, 1]));

  matrix.compose(new THREE.Vector3(...pos), quaternion, scale);
  geometry.applyMatrix4(matrix);
}

export class GeoBuilder {
  private groups = new Map<string, THREE.BufferGeometry[]>();

  private push(mat: string, geometry: THREE.BufferGeometry) {
    const list = this.groups.get(mat);

    if (list) {
      list.push(geometry);
    } else {
      this.groups.set(mat, [geometry]);
    }
  }

  box(mat: string, size: V3, pos: V3, options?: TransformOptions) {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);

    planarUV(geometry, options?.tile ?? 2);
    applyTransform(geometry, pos, options);
    this.push(mat, geometry);

    return this;
  }

  cylinder(
    mat: string,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    pos: V3,
    options?: TransformOptions & { segments?: number },
  ) {
    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      options?.segments ?? 12,
      1,
      false,
    );

    const uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;
    const tile = options?.tile ?? 1.6;

    if (uv) {
      const circumference = Math.PI * (radiusTop + radiusBottom);

      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(
          i,
          (uv.getX(i) * circumference) / tile,
          (uv.getY(i) * height) / tile,
        );
      }
    }

    applyTransform(geometry, pos, options);
    this.push(mat, geometry);

    return this;
  }

  sphere(
    mat: string,
    radius: number,
    pos: V3,
    options?: TransformOptions & { detail?: number },
  ) {
    const geometry = new THREE.IcosahedronGeometry(
      radius,
      options?.detail ?? 1,
    );

    applyTransform(geometry, pos, options);
    this.push(mat, geometry);

    return this;
  }

  plane(
    mat: string,
    w: number,
    d: number,
    pos: V3,
    options?: TransformOptions,
  ) {
    const geometry = new THREE.PlaneGeometry(w, d, 1, 1);
    const uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;
    const tile = options?.tile ?? 2;

    if (uv) {
      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
      }
    }

    const withRot = { rotX: -Math.PI / 2, ...options };

    applyTransform(geometry, pos, withRot);
    this.push(mat, geometry);

    return this;
  }

  raw(mat: string, geometry: THREE.BufferGeometry) {
    this.push(mat, geometry);
    return this;
  }

  build(): Record<string, THREE.BufferGeometry> {
    const out: Record<string, THREE.BufferGeometry> = {};

    this.groups.forEach((geometries, mat) => {
      if (geometries.length === 0) return;

      if (geometries.length === 1) {
        out[mat] = geometries[0];
        return;
      }

      const temIndice = geometries.some((geometry) => geometry.index !== null);

      if (temIndice) {
        for (const geometry of geometries) {
          if (geometry.index !== null) continue;

          // A ordem original dos vértices já define os triângulos da peça.
          const total = geometry.getAttribute("position").count;
          const indices = Array.from({ length: total }, (_, i) => i);
          geometry.setIndex(indices);
        }
      }

      const merged = mergeGeometries(geometries, false);

      if (merged) {
        out[mat] = merged;
      } else {
        console.error(`[GeoBuilder] Falha ao juntar o material "${mat}".`);
      }

      geometries.forEach((geometry) => geometry.dispose());
    });

    this.groups.clear();
    return out;
  }
}