import { Document, Accessor } from "@gltf-transform/core";
import type { Mesh } from "@gltf-transform/core";

/**
 * Create a preview mesh of the given type.
 *
 * The mesh includes POSITION, NORMAL, and TEXCOORD_0 attributes
 * suitable for previewing a PBR material.
 */
export function createPreviewMesh(
  doc: Document,
  type: "plane" | "sphere" | "cube",
): Mesh {
  switch (type) {
    case "plane":
      return createPlane(doc);
    case "sphere":
      return createSphere(doc);
    case "cube":
      return createCube(doc);
  }
}

function createPlane(doc: Document): Mesh {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();

  // 2x2 plane centered at origin, 1 unit each side
  const positions = new Float32Array([
    -0.5, 0, -0.5,
     0.5, 0, -0.5,
     0.5, 0,  0.5,
    -0.5, 0,  0.5,
  ]);

  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);

  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]);

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const posAccessor = doc.createAccessor("position")
    .setArray(positions)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);

  const normAccessor = doc.createAccessor("normal")
    .setArray(normals)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);

  const uvAccessor = doc.createAccessor("uv")
    .setArray(uvs)
    .setType(Accessor.Type.VEC2)
    .setBuffer(buffer);

  const indexAccessor = doc.createAccessor("indices")
    .setArray(indices)
    .setType(Accessor.Type.SCALAR)
    .setBuffer(buffer);

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", posAccessor)
    .setAttribute("NORMAL", normAccessor)
    .setAttribute("TEXCOORD_0", uvAccessor)
    .setIndices(indexAccessor);

  return doc.createMesh("PreviewMesh").addPrimitive(prim);
}

function createSphere(doc: Document): Mesh {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const segments = 16;
  const rings = 12;
  const radius = 0.5;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring++) {
    const theta = (ring / rings) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let seg = 0; seg <= segments; seg++) {
      const phi = (seg / segments) * Math.PI * 2;
      const x = sinTheta * Math.cos(phi);
      const y = cosTheta;
      const z = sinTheta * Math.sin(phi);

      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
      uvs.push(seg / segments, ring / rings);
    }
  }

  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * (segments + 1) + seg;
      const b = a + segments + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const posAccessor = doc.createAccessor("position")
    .setArray(new Float32Array(positions))
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);

  const normAccessor = doc.createAccessor("normal")
    .setArray(new Float32Array(normals))
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);

  const uvAccessor = doc.createAccessor("uv")
    .setArray(new Float32Array(uvs))
    .setType(Accessor.Type.VEC2)
    .setBuffer(buffer);

  const indexAccessor = doc.createAccessor("indices")
    .setArray(new Uint16Array(indices))
    .setType(Accessor.Type.SCALAR)
    .setBuffer(buffer);

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", posAccessor)
    .setAttribute("NORMAL", normAccessor)
    .setAttribute("TEXCOORD_0", uvAccessor)
    .setIndices(indexAccessor);

  return doc.createMesh("PreviewMesh").addPrimitive(prim);
}

function createCube(doc: Document): Mesh {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const s = 0.5;

  // 6 faces, 4 vertices each = 24 vertices
  // prettier-ignore
  const positions = new Float32Array([
    // Front
    -s, -s,  s,   s, -s,  s,   s,  s,  s,  -s,  s,  s,
    // Back
     s, -s, -s,  -s, -s, -s,  -s,  s, -s,   s,  s, -s,
    // Top
    -s,  s,  s,   s,  s,  s,   s,  s, -s,  -s,  s, -s,
    // Bottom
    -s, -s, -s,   s, -s, -s,   s, -s,  s,  -s, -s,  s,
    // Right
     s, -s,  s,   s, -s, -s,   s,  s, -s,   s,  s,  s,
    // Left
    -s, -s, -s,  -s, -s,  s,  -s,  s,  s,  -s,  s, -s,
  ]);

  // prettier-ignore
  const normals = new Float32Array([
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
   -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  // prettier-ignore
  const uvs = new Float32Array([
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
  ]);

  const idx: number[] = [];
  for (let face = 0; face < 6; face++) {
    const o = face * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  const posAccessor = doc.createAccessor("position")
    .setArray(positions)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);

  const normAccessor = doc.createAccessor("normal")
    .setArray(normals)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);

  const uvAccessor = doc.createAccessor("uv")
    .setArray(uvs)
    .setType(Accessor.Type.VEC2)
    .setBuffer(buffer);

  const indexAccessor = doc.createAccessor("indices")
    .setArray(new Uint16Array(idx))
    .setType(Accessor.Type.SCALAR)
    .setBuffer(buffer);

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", posAccessor)
    .setAttribute("NORMAL", normAccessor)
    .setAttribute("TEXCOORD_0", uvAccessor)
    .setIndices(indexAccessor);

  return doc.createMesh("PreviewMesh").addPrimitive(prim);
}
