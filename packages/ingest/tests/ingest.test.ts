import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { zipSync } from "fflate";
import { ingest, MaterialXError } from "../src/index.js";

// ── Test fixture helpers ───────────────────────────────────────────

let testDir: string;

beforeAll(async () => {
  testDir = join(tmpdir(), `materialxjs-ingest-test-${randomBytes(4).toString("hex")}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function createTextureDir(
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = join(testDir, name);
  await mkdir(dir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    await writeFile(join(dir, filename), content);
  }
  return dir;
}

function createZipBuffer(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = new TextEncoder().encode(content);
  }
  return zipSync(entries);
}

async function createZipFile(
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const zipPath = join(testDir, name);
  const zipData = createZipBuffer(files);
  await writeFile(zipPath, zipData);
  return zipPath;
}

// ── Directory ingestion ────────────────────────────────────────────

describe("ingest — directory", () => {
  it("builds MtlxDocument from texture folder", async () => {
    const dir = await createTextureDir("wood-textures", {
      "Wood_Color.jpg": "fake-image-data",
      "Wood_Roughness.jpg": "fake-image-data",
      "Wood_NormalGL.jpg": "fake-image-data",
    });

    const result = await ingest(dir);

    expect(result.document.version).toBe("1.39");
    expect(result.document.fileprefix).toBe("./");
    expect(result.textures.length).toBe(3);
    expect(result.textureDir).toBe(dir);

    // Should have tiledimage nodes + shader + material
    const categories = result.document.children.map((c) => c.category);
    expect(categories.filter((c) => c === "tiledimage").length).toBe(3);
    expect(categories).toContain("open_pbr_surface"); // default shader
    expect(categories).toContain("surfacematerial");
  });

  it("uses OpenPBR Surface by default", async () => {
    const dir = await createTextureDir("openpbr-test", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(dir);
    const shader = result.document.children.find(
      (c) => c.category === "open_pbr_surface",
    );
    expect(shader).toBeDefined();
    expect(shader!.type).toBe("surfaceshader");
  });

  it("respects shader option", async () => {
    const dir = await createTextureDir("standard-surface-test", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(dir, { shader: "standard_surface" });
    const shader = result.document.children.find(
      (c) => c.category === "standard_surface",
    );
    expect(shader).toBeDefined();
  });

  it("wires textures to correct shader inputs", async () => {
    const dir = await createTextureDir("wiring-test", {
      "mat_color.jpg": "data",
      "mat_roughness.jpg": "data",
      "mat_normal.jpg": "data",
    });

    const result = await ingest(dir);
    const shader = result.document.children.find(
      (c) => c.category === "open_pbr_surface",
    );
    expect(shader).toBeDefined();

    const inputNames = shader!.inputs.map((i) => i.name);
    expect(inputNames).toContain("base_color");
    expect(inputNames).toContain("specular_roughness");
    expect(inputNames).toContain("geometry_normal"); // OpenPBR name
  });

  it("generates extract nodes for packed ARM textures", async () => {
    const dir = await createTextureDir("packed-test", {
      "mat_color.jpg": "data",
      "mat_arm.jpg": "data",
    });

    const result = await ingest(dir);
    const extractNodes = result.document.children.filter(
      (c) => c.category === "extract",
    );
    expect(extractNodes.length).toBe(3); // R=AO, G=Roughness, B=Metalness
  });

  it("reports warnings for unmapped texture files", async () => {
    const dir = await createTextureDir("unmapped-test", {
      "mat_color.jpg": "data",
      "mat_mysterious.jpg": "data",
    });

    const result = await ingest(dir);
    expect(result.warnings.some((w) => w.includes("E_TEXTURE_UNMAPPED"))).toBe(true);
  });

  it("reports warnings for dropped channels", async () => {
    const dir = await createTextureDir("dropped-test", {
      "mat_displacement.jpg": "data",
    });

    // glTF PBR has no displacement input
    const result = await ingest(dir, { shader: "gltf_pbr" });
    expect(result.warnings.some((w) => w.includes("E_CHANNEL_DROPPED"))).toBe(true);
  });

  it("uses relative paths in generated document", async () => {
    const dir = await createTextureDir("paths-test", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(dir);
    expect(result.document.fileprefix).toBe("./");

    // No absolute paths in any input values
    for (const child of result.document.children) {
      for (const input of child.inputs) {
        if (input.value && input.type === "filename") {
          expect(input.value.startsWith("/")).toBe(false);
          expect(input.value.includes(":\\")).toBe(false);
        }
      }
    }
  });

  it("cleanup is a no-op for directory inputs", async () => {
    const dir = await createTextureDir("noop-cleanup", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(dir);
    // Should not throw
    await result.cleanup();
    await result.cleanup(); // idempotent
  });

  it("handles custom material name", async () => {
    const dir = await createTextureDir("custom-name", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(dir, { name: "MyWoodMaterial" });
    const material = result.document.children.find(
      (c) => c.category === "surfacematerial",
    );
    expect(material!.name).toBe("MyWoodMaterial_Material");
  });
});

// ── .mtlx passthrough ──────────────────────────────────────────────

describe("ingest — .mtlx passthrough", () => {
  it("parses .mtlx file and returns document", async () => {
    const mtlxContent = `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="TestShader" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.2, 0.1" />
  </standard_surface>
  <surfacematerial name="TestMat" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="TestShader" />
  </surfacematerial>
</materialx>`;

    const mtlxPath = join(testDir, "test-passthrough.mtlx");
    await writeFile(mtlxPath, mtlxContent);

    const result = await ingest(mtlxPath);

    expect(result.document.version).toBe("1.39");
    expect(result.document.children.length).toBe(2);
    expect(result.document.children[0].category).toBe("standard_surface");
    expect(result.warnings.length).toBe(0);
  });

  it("preserves original shading model", async () => {
    const mtlxContent = `<?xml version="1.0"?>
<materialx version="1.39">
  <open_pbr_surface name="PBR" type="surfaceshader">
    <input name="base_color" type="color3" value="0.5, 0.5, 0.5" />
  </open_pbr_surface>
</materialx>`;

    const mtlxPath = join(testDir, "test-openpbr.mtlx");
    await writeFile(mtlxPath, mtlxContent);

    const result = await ingest(mtlxPath);
    expect(result.document.children[0].category).toBe("open_pbr_surface");
  });
});

// ── Zip ingestion ──────────────────────────────────────────────────

describe("ingest — zip", () => {
  it("extracts and processes zip contents", async () => {
    const zipPath = await createZipFile("textures.zip", {
      "mat_color.jpg": "fake-image",
      "mat_roughness.jpg": "fake-image",
    });

    const result = await ingest(zipPath);
    try {
      expect(result.document.children.length).toBeGreaterThan(0);
      expect(result.textures.length).toBe(2);
    } finally {
      await result.cleanup();
    }
  });

  it("cleanup removes temp directory", async () => {
    const zipPath = await createZipFile("cleanup-test.zip", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(zipPath);
    const tempDir = result.textureDir;
    await result.cleanup();

    // Verify temp dir is gone
    const { stat } = await import("node:fs/promises");
    await expect(stat(tempDir)).rejects.toThrow();
  });

  it("cleanup is idempotent", async () => {
    const zipPath = await createZipFile("idempotent-test.zip", {
      "mat_color.jpg": "data",
    });

    const result = await ingest(zipPath);
    await result.cleanup();
    await result.cleanup(); // should not throw
  });

  it("handles zip with single top-level folder", async () => {
    const zipPath = await createZipFile("nested.zip", {
      "Wood066_2K/mat_color.jpg": "data",
      "Wood066_2K/mat_roughness.jpg": "data",
    });

    const result = await ingest(zipPath);
    try {
      expect(result.textures.length).toBe(2);
    } finally {
      await result.cleanup();
    }
  });

  it("handles zip containing .mtlx", async () => {
    const mtlxContent = `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="ZipShader" type="surfaceshader">
    <input name="base_color" type="color3" value="1, 0, 0" />
  </standard_surface>
</materialx>`;

    const zipPath = await createZipFile("with-mtlx.zip", {
      "material.mtlx": mtlxContent,
      "color.jpg": "data",
    });

    const result = await ingest(zipPath);
    try {
      // Should use the .mtlx file, not assemble from textures
      expect(result.document.children[0].name).toBe("ZipShader");
    } finally {
      await result.cleanup();
    }
  });
});

// ── Zip safety ─────────────────────────────────────────────────────

describe("ingest — zip safety", () => {
  it("rejects path traversal entries", async () => {
    const zipPath = await createZipFile("traversal.zip", {
      "../../../etc/passwd": "malicious",
    });

    await expect(ingest(zipPath)).rejects.toThrow(MaterialXError);
    await expect(ingest(zipPath)).rejects.toMatchObject({
      code: "E_ZIP_UNSAFE",
    });
  });

  it("rejects zip exceeding file count limit", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      files[`tex_${i}.jpg`] = "data";
    }
    const zipPath = await createZipFile("too-many.zip", files);

    await expect(
      ingest(zipPath, { zip: { maxFileCount: 5 } }),
    ).rejects.toMatchObject({ code: "E_ZIP_UNSAFE" });
  });

  it("rejects zip exceeding size limit", async () => {
    const zipPath = await createZipFile("too-big.zip", {
      "big.jpg": "x".repeat(1000),
    });

    await expect(
      ingest(zipPath, { zip: { maxUncompressedSize: 100 } }),
    ).rejects.toMatchObject({ code: "E_ZIP_UNSAFE" });
  });

  it("cleans up temp dir on zip safety failure", async () => {
    // We can't easily test this directly, but we verify no throw on repeated attempts
    const zipPath = await createZipFile("cleanup-on-fail.zip", {
      "../evil.txt": "bad",
    });

    await expect(ingest(zipPath)).rejects.toThrow();
    // If cleanup failed, the temp dir would leak — but we can't easily check tmpdir
    // This test mainly ensures the error path doesn't itself throw
  });
});

// ── Error cases ────────────────────────────────────────────────────

describe("ingest — errors", () => {
  it("throws E_INPUT_NOT_FOUND for missing path", async () => {
    await expect(ingest("/nonexistent/path")).rejects.toMatchObject({
      code: "E_INPUT_NOT_FOUND",
    });
  });

  it("throws E_INPUT_UNSUPPORTED for unknown file type", async () => {
    const txtPath = join(testDir, "test.txt");
    await writeFile(txtPath, "not a material");

    await expect(ingest(txtPath)).rejects.toMatchObject({
      code: "E_INPUT_UNSUPPORTED",
    });
  });

  it("throws E_INPUT_UNSUPPORTED for empty directory", async () => {
    const dir = join(testDir, "empty-dir");
    await mkdir(dir, { recursive: true });

    await expect(ingest(dir)).rejects.toMatchObject({
      code: "E_INPUT_UNSUPPORTED",
    });
  });

  it("throws E_PARSE_FAILED for invalid .mtlx", async () => {
    const badPath = join(testDir, "bad.mtlx");
    await writeFile(badPath, "this is not XML");

    await expect(ingest(badPath)).rejects.toMatchObject({
      code: "E_PARSE_FAILED",
    });
  });
});
