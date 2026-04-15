import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { writeFile, mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { zipSync } from "fflate";

const exec = promisify(execFile);

// Use tsx via node_modules/.bin for cross-platform compat
const TSX = join(__dirname, "..", "node_modules", ".bin", "tsx");
const CLI = join(__dirname, "..", "src", "cli.ts");

/**
 * Run CLI and return stdout/stderr.
 * Note: consola output may not be captured in subprocess mode on Windows,
 * so tests check console.log (stdout) output where possible.
 */
const run = async (args: string[]) => {
  const result = await exec(TSX, [CLI, ...args], {
    cwd: testDir,
    shell: true,
  });
  return { ...result, output: result.stdout + result.stderr };
};

let testDir: string;

beforeAll(async () => {
  testDir = join(
    tmpdir(),
    `materialxjs-cli-test-${randomBytes(4).toString("hex")}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ── Helpers ─────────────────────────────────────────────────────────

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

async function createZipFile(
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const entries: Record<string, Uint8Array> = {};
  for (const [n, content] of Object.entries(files)) {
    entries[n] = new TextEncoder().encode(content);
  }
  const zipPath = join(testDir, name);
  await writeFile(zipPath, zipSync(entries));
  return zipPath;
}

async function createMtlxFile(name: string, content: string): Promise<string> {
  const path = join(testDir, name);
  await writeFile(path, content);
  return path;
}

// ── Top-level help ──────────────────────────────────────────────────

describe("cli — help", () => {
  it("runs without error", async () => {
    // citty help output goes through consola which may not be captured
    // in subprocess mode — just verify the CLI doesn't crash
    await run(["--help"]);
  });

  it("shows subcommand help", async () => {
    // Subcommand help is more reliably captured
    await run(["inspect", "--help"]);
    await run(["create", "--help"]);
    await run(["convert", "--help"]);
  });
});

// ── Inspect command ─────────────────────────────────────────────────

describe("cli — inspect", () => {
  it("inspects a texture folder", async () => {
    const dir = await createTextureDir("inspect-textures", {
      "mat_color.jpg": "data",
      "mat_roughness.jpg": "data",
      "mat_normal.jpg": "data",
    });

    const { output } = await run(["inspect", dir]);
    expect(output).toContain("base_color");
    expect(output).toContain("specular_roughness");
    expect(output).toContain("normal");
    expect(output).toContain("Ready:");
  });

  it("shows unmapped warnings", async () => {
    const dir = await createTextureDir("inspect-unmapped", {
      "mat_color.jpg": "data",
      "mat_mysterious.jpg": "data",
    });

    const { output } = await run(["inspect", dir]);
    expect(output).toContain("Unmapped");
  });

  it("inspects a .mtlx file", async () => {
    const mtlx = await createMtlxFile(
      "inspect-test.mtlx",
      `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="TestShader" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.2, 0.1" />
  </standard_surface>
</materialx>`,
    );

    const { output } = await run(["inspect", mtlx]);
    expect(output).toContain("Nodes:");
  });

  it("outputs JSON with --json-log", async () => {
    const dir = await createTextureDir("inspect-json", {
      "mat_color.jpg": "data",
    });

    const { stdout } = await run(["inspect", dir, "--json-log"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.textures).toBeInstanceOf(Array);
    expect(parsed.textures.length).toBe(1);
    expect(parsed.nodes).toBeInstanceOf(Array);
    expect(parsed.warnings).toBeInstanceOf(Array);
  });

  it("reports error for missing path", async () => {
    await expect(
      run(["inspect", join(testDir, "nonexistent")]),
    ).rejects.toThrow();
  });

  it("inspects a zip file", async () => {
    const zipPath = await createZipFile("inspect-test.zip", {
      "mat_color.jpg": "data",
      "mat_roughness.jpg": "data",
    });

    const { stdout } = await run(["inspect", zipPath]);
    expect(stdout).toContain("base_color");
  });
});

// ── Create command ──────────────────────────────────────────────────

describe("cli — create", () => {
  it("creates .mtlx from texture folder", async () => {
    const dir = await createTextureDir("create-textures", {
      "mat_color.jpg": "data",
      "mat_roughness.jpg": "data",
    });

    const outPath = join(testDir, "create-textures.mtlx");
    await run(["create", dir, "-o", outPath, "--force"]);

    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("<materialx");
    expect(content).toContain("open_pbr_surface");
    expect(content).toContain("tiledimage");
  });

  it("creates .json with --json flag", async () => {
    const dir = await createTextureDir("create-json", {
      "mat_color.jpg": "data",
    });

    const outPath = join(testDir, "create-json.json");
    await run(["create", dir, "--json", "-o", outPath, "--force"]);

    const content = await readFile(outPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.mimetype).toBe("application/mtlx+json");
  });

  it("creates .gltf.json with --gltf flag", async () => {
    const dir = await createTextureDir("create-gltf", {
      "mat_color.jpg": "data",
    });

    const outPath = join(testDir, "create-gltf.gltf.json");
    await run(["create", dir, "--gltf", "-o", outPath, "--force"]);

    const content = await readFile(outPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.procedurals).toBeDefined();
  });

  it("respects --shader option", async () => {
    const dir = await createTextureDir("create-shader", {
      "mat_color.jpg": "data",
    });

    const outPath = join(testDir, "create-shader.mtlx");
    await run([
      "create", dir, "--shader", "standard_surface",
      "-o", outPath, "--force",
    ]);

    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("standard_surface");
    expect(content).not.toContain("open_pbr_surface");
  });

  it("respects --name option", async () => {
    const dir = await createTextureDir("create-name", {
      "mat_color.jpg": "data",
    });

    const outPath = join(testDir, "create-name.mtlx");
    await run([
      "create", dir, "--name", "CustomMaterial",
      "-o", outPath, "--force",
    ]);

    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("CustomMaterial");
  });

  it("dry-run does not create files", async () => {
    const dir = await createTextureDir("create-dryrun", {
      "mat_color.jpg": "data",
    });

    const outPath = join(testDir, "should-not-exist.mtlx");
    const { output } = await run([
      "create", dir, "-o", outPath, "--dry-run",
    ]);

    expect(output).toContain("[dry-run]");
    await expect(stat(outPath)).rejects.toThrow();
  });

  it("refuses to overwrite without --force in non-interactive mode", async () => {
    const dir = await createTextureDir("create-noforce", {
      "mat_color.jpg": "data",
    });

    const outPath = join(testDir, "existing.mtlx");
    await writeFile(outPath, "existing content");

    await expect(
      run(["create", dir, "-o", outPath]),
    ).rejects.toThrow();
  });

  it("creates from zip file", async () => {
    const zipPath = await createZipFile("create-zip.zip", {
      "mat_color.jpg": "data",
      "mat_roughness.jpg": "data",
    });

    const outPath = join(testDir, "from-zip.mtlx");
    await run(["create", zipPath, "-o", outPath, "--force"]);

    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("<materialx");
    expect(content).toContain("tiledimage");
  });

  it("reports error for missing path", async () => {
    await expect(
      run(["create", join(testDir, "nonexistent")]),
    ).rejects.toThrow();
  });
});

// ── Create --glb ────────────────────────────────────────────────────

describe("cli — create --glb", () => {
  it("creates .glb + .meta.json from texture folder", async () => {
    const dir = await createTextureDir("create-glb-textures", {
      "mat_color.jpg": "fake-image-data",
      "mat_roughness.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "create-glb-output.glb");
    await run(["create", dir, "--glb", "-o", outPath, "--force"]);

    const glbStat = await stat(outPath);
    expect(glbStat.size).toBeGreaterThan(0);

    const metaPath = outPath.replace(/\.glb$/, ".meta.json");
    const metaContent = await readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);
    expect(meta.version).toBe("0.1.0");
    expect(meta.channels).toContain("base_color");
  });

  it("creates .glb from zip file", async () => {
    const zipPath = await createZipFile("create-glb.zip", {
      "mat_color.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "from-zip-glb.glb");
    await run(["create", zipPath, "--glb", "-o", outPath, "--force"]);

    const glbStat = await stat(outPath);
    expect(glbStat.size).toBeGreaterThan(0);
  });

  it("supports --geometry option", async () => {
    const dir = await createTextureDir("create-glb-sphere", {
      "mat_color.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "create-glb-sphere.glb");
    await run([
      "create", dir, "--glb", "--geometry", "sphere",
      "-o", outPath, "--force",
    ]);

    const glbStat = await stat(outPath);
    expect(glbStat.size).toBeGreaterThan(0);
  });

  it("dry-run shows both .glb and .meta.json", async () => {
    const dir = await createTextureDir("create-glb-dryrun", {
      "mat_color.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "dryrun-glb.glb");
    const { output } = await run([
      "create", dir, "--glb", "-o", outPath, "--dry-run",
    ]);

    expect(output).toContain("[dry-run]");
    expect(output).toContain(".glb");
    expect(output).toContain(".meta.json");
    await expect(stat(outPath)).rejects.toThrow();
  });
});

// ── Pack command ────────────────────────────────────────────────────

describe("cli — pack", () => {
  it("packs a texture folder into .glb", async () => {
    const dir = await createTextureDir("pack-textures", {
      "mat_color.jpg": "fake-image-data",
      "mat_normal.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "pack-output.glb");
    await run(["pack", dir, "-o", outPath, "--force"]);

    const glbStat = await stat(outPath);
    expect(glbStat.size).toBeGreaterThan(0);

    const metaPath = outPath.replace(/\.glb$/, ".meta.json");
    const metaContent = await readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);
    expect(meta.channels).toContain("base_color");
    expect(meta.channels).toContain("normal");
  });

  it("packs a .mtlx file", async () => {
    const mtlx = await createMtlxFile(
      "pack-test.mtlx",
      `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="TestShader" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.2, 0.1" />
  </standard_surface>
  <surfacematerial name="TestMaterial" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="TestShader" />
  </surfacematerial>
</materialx>`,
    );

    const outPath = join(testDir, "pack-mtlx.glb");
    await run(["pack", mtlx, "-o", outPath, "--force"]);

    const glbStat = await stat(outPath);
    expect(glbStat.size).toBeGreaterThan(0);

    const metaPath = outPath.replace(/\.glb$/, ".meta.json");
    const metaContent = await readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);
    expect(meta.shader).toBe("standard_surface");
  });

  it("packs a zip file", async () => {
    const zipPath = await createZipFile("pack-test.zip", {
      "mat_color.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "pack-zip.glb");
    await run(["pack", zipPath, "-o", outPath, "--force"]);

    const glbStat = await stat(outPath);
    expect(glbStat.size).toBeGreaterThan(0);
  });

  it("dry-run does not create files", async () => {
    const dir = await createTextureDir("pack-dryrun", {
      "mat_color.jpg": "fake-image-data",
    });

    const outPath = join(testDir, "pack-dryrun.glb");
    const { output } = await run([
      "pack", dir, "-o", outPath, "--dry-run",
    ]);

    expect(output).toContain("[dry-run]");
    expect(output).toContain(".glb");
    expect(output).toContain(".meta.json");
    await expect(stat(outPath)).rejects.toThrow();
  });

  it("reports error for missing path", async () => {
    await expect(
      run(["pack", join(testDir, "nonexistent")]),
    ).rejects.toThrow();
  });

  it("shows help without error", async () => {
    await run(["pack", "--help"]);
  });
});

// ── Convert command ─────────────────────────────────────────────────

describe("cli — convert", () => {
  it("converts .mtlx to .json", async () => {
    const mtlx = await createMtlxFile(
      "convert-test.mtlx",
      `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="Shader" type="surfaceshader">
    <input name="base_color" type="color3" value="1, 0, 0" />
  </standard_surface>
</materialx>`,
    );

    const outPath = join(testDir, "convert-test.json");
    await run(["convert", mtlx, "-o", outPath, "--force"]);

    const content = await readFile(outPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.mimetype).toBe("application/mtlx+json");
  });

  it("converts .mtlx to .gltf.json", async () => {
    const mtlx = await createMtlxFile(
      "convert-gltf.mtlx",
      `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="Shader" type="surfaceshader">
    <input name="base_color" type="color3" value="1, 0, 0" />
  </standard_surface>
</materialx>`,
    );

    const outPath = join(testDir, "convert-gltf.gltf.json");
    await run(["convert", mtlx, "--gltf", "-o", outPath, "--force"]);

    const content = await readFile(outPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.procedurals).toBeDefined();
  });
});
