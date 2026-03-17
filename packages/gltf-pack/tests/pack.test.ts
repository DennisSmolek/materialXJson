import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { Document, NodeIO } from "@gltf-transform/core";
import { packGlb, writePackage } from "../src/index.js";
import type { PackInput } from "../src/index.js";
import type { TextureMapping } from "@materialxjs/texture-map";
import type { MtlxDocument, MtlxElement } from "@materialxjs/json";

// ── Test fixture helpers ───────────────────────────────────────────

let testDir: string;

beforeAll(async () => {
  testDir = join(
    tmpdir(),
    `materialxjs-gltf-pack-test-${randomBytes(4).toString("hex")}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/**
 * Create a test texture directory with fake image files.
 */
async function createTextureDir(
  name: string,
  files: string[],
): Promise<string> {
  const dir = join(testDir, name);
  await mkdir(dir, { recursive: true });
  // Create 1x1 pixel JPEG-like files (minimal valid data for gltf-transform)
  for (const file of files) {
    await writeFile(join(dir, file), Buffer.from("fake-image-data"));
  }
  return dir;
}

/**
 * Create a minimal MtlxDocument for testing.
 */
function createTestDocument(
  materialName: string,
  shader: string = "open_pbr_surface",
): MtlxDocument {
  const shaderNode: MtlxElement = {
    category: shader,
    name: `${materialName}_Shader`,
    type: "surfaceshader",
    attributes: {},
    inputs: [],
    outputs: [],
    children: [],
  };

  const materialNode: MtlxElement = {
    category: "surfacematerial",
    name: `${materialName}_Material`,
    type: "material",
    attributes: {},
    inputs: [
      {
        name: "surfaceshader",
        type: "surfaceshader",
        nodename: shaderNode.name,
        attributes: {},
      },
    ],
    outputs: [],
    children: [],
  };

  return {
    version: "1.39",
    fileprefix: "./",
    attributes: {},
    children: [shaderNode, materialNode],
  };
}

function createPackInput(
  dir: string,
  textures: TextureMapping[],
  shader?: string,
): PackInput {
  const materialName = "TestMaterial";
  return {
    document: createTestDocument(materialName, shader),
    textures,
    textureDir: dir,
    warnings: [],
  };
}

// ── packGlb tests ─────────────────────────────────────────────────

describe("packGlb", () => {
  it("creates a valid GLB from textures", async () => {
    const dir = await createTextureDir("basic", [
      "color.jpg",
      "roughness.jpg",
    ]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
      {
        file: "roughness.jpg",
        channel: "specular_roughness",
        colorspace: "linear",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb, meta } = await packGlb(input);

    // GLB should be a Uint8Array with the glTF magic bytes
    expect(glb).toBeInstanceOf(Uint8Array);
    expect(glb.length).toBeGreaterThan(0);
    // glTF magic: 0x46546C67 = "glTF"
    expect(glb[0]).toBe(0x67);
    expect(glb[1]).toBe(0x6c);
    expect(glb[2]).toBe(0x54);
    expect(glb[3]).toBe(0x46);

    // Meta should be populated
    expect(meta.name).toContain("TestMaterial");
    expect(meta.version).toBe("0.1.0");
    expect(meta.shader).toBe("open_pbr_surface");
    expect(meta.textures.length).toBe(2);
    expect(meta.channels).toContain("base_color");
    expect(meta.channels).toContain("specular_roughness");
  });

  it("can be parsed back by gltf-transform", async () => {
    const dir = await createTextureDir("roundtrip", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input);

    // Read back with gltf-transform
    const io = new NodeIO();
    const doc = await io.readBinary(glb);

    const materials = doc.getRoot().listMaterials();
    expect(materials.length).toBe(1);
    expect(materials[0].getName()).toBe("Material");
    expect(materials[0].getBaseColorTexture()).not.toBeNull();
  });

  it("includes preview mesh by default", async () => {
    const dir = await createTextureDir("mesh-default", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input);

    const io = new NodeIO();
    const doc = await io.readBinary(glb);

    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    expect(meshes[0].getName()).toBe("PreviewMesh");
  });

  it("supports sphere geometry", async () => {
    const dir = await createTextureDir("mesh-sphere", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input, { geometry: "sphere" });

    const io = new NodeIO();
    const doc = await io.readBinary(glb);

    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    // Sphere has more vertices than a plane
    const prim = meshes[0].listPrimitives()[0];
    const posCount = prim.getAttribute("POSITION")!.getCount();
    expect(posCount).toBeGreaterThan(4); // more than a plane's 4 vertices
  });

  it("supports cube geometry", async () => {
    const dir = await createTextureDir("mesh-cube", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input, { geometry: "cube" });

    const io = new NodeIO();
    const doc = await io.readBinary(glb);

    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    const prim = meshes[0].listPrimitives()[0];
    expect(prim.getAttribute("POSITION")!.getCount()).toBe(24); // 6 faces × 4 verts
  });

  it("supports no geometry", async () => {
    const dir = await createTextureDir("no-mesh", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input, { geometry: "none" });

    const io = new NodeIO();
    const doc = await io.readBinary(glb);

    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(0);
  });

  it("maps normal texture correctly", async () => {
    const dir = await createTextureDir("normal", [
      "color.jpg",
      "normal.jpg",
    ]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
      {
        file: "normal.jpg",
        channel: "normal",
        colorspace: "linear",
        confidence: "exact",
        normalConvention: "gl",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input);

    const io = new NodeIO();
    const doc = await io.readBinary(glb);
    const mat = doc.getRoot().listMaterials()[0];

    expect(mat.getNormalTexture()).not.toBeNull();
  });

  it("maps AO texture correctly", async () => {
    const dir = await createTextureDir("ao", ["color.jpg", "ao.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
      {
        file: "ao.jpg",
        channel: "ambient_occlusion",
        colorspace: "linear",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input);

    const io = new NodeIO();
    const doc = await io.readBinary(glb);
    const mat = doc.getRoot().listMaterials()[0];

    expect(mat.getOcclusionTexture()).not.toBeNull();
  });

  it("maps emission texture correctly", async () => {
    const dir = await createTextureDir("emission", [
      "color.jpg",
      "emission.jpg",
    ]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
      {
        file: "emission.jpg",
        channel: "emission",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input);

    const io = new NodeIO();
    const doc = await io.readBinary(glb);
    const mat = doc.getRoot().listMaterials()[0];

    expect(mat.getEmissiveTexture()).not.toBeNull();
    expect(mat.getEmissiveFactor()).toEqual([1, 1, 1]);
  });

  it("embeds MtlxDocument in extras when requested", async () => {
    const dir = await createTextureDir("embed-mtlx", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { glb } = await packGlb(input, { embedMaterialX: true });

    const io = new NodeIO();
    const doc = await io.readBinary(glb);
    const extras = doc.getRoot().getExtras() as Record<string, unknown>;

    expect(extras.materialx).toBeDefined();
    expect((extras.materialx as any).version).toBe("1.39");
  });

  it("detects shader model from document", async () => {
    const dir = await createTextureDir("shader-detect", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures, "standard_surface");
    const { meta } = await packGlb(input);

    expect(meta.shader).toBe("standard_surface");
  });

  it("handles packed textures in channel list", async () => {
    const dir = await createTextureDir("packed", [
      "color.jpg",
      "arm.jpg",
    ]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
      {
        file: "arm.jpg",
        channel: "packed",
        packing: {
          r: "ambient_occlusion",
          g: "specular_roughness",
          b: "metalness",
        },
        colorspace: "linear",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const { meta } = await packGlb(input);

    expect(meta.channels).toContain("base_color");
    expect(meta.channels).toContain("ambient_occlusion");
    expect(meta.channels).toContain("specular_roughness");
    expect(meta.channels).toContain("metalness");
  });
});

// ── writePackage tests ────────────────────────────────────────────

describe("writePackage", () => {
  it("writes .glb and .meta.json files", async () => {
    const dir = await createTextureDir("write-pkg", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const outPath = join(testDir, "output", "test.glb");
    const { glbPath, metaPath } = await writePackage(input, outPath);

    // Both files should exist
    expect(glbPath).toContain(".glb");
    expect(metaPath).toContain(".meta.json");

    const glbStat = await stat(glbPath);
    expect(glbStat.size).toBeGreaterThan(0);

    const metaContent = await readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);
    expect(meta.name).toContain("TestMaterial");
    expect(meta.version).toBe("0.1.0");
  });

  it("appends .glb if missing from output path", async () => {
    const dir = await createTextureDir("write-ext", ["color.jpg"]);

    const textures: TextureMapping[] = [
      {
        file: "color.jpg",
        channel: "base_color",
        colorspace: "srgb",
        confidence: "exact",
      },
    ];

    const input = createPackInput(dir, textures);
    const outPath = join(testDir, "output2", "material");
    const { glbPath, metaPath } = await writePackage(input, outPath);

    expect(glbPath).toBe(outPath + ".glb");
    expect(metaPath).toBe(outPath + ".meta.json");
  });
});
