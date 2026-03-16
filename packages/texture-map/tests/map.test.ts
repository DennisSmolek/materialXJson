import { describe, it, expect } from "vitest";
import { mapTextures } from "../src/index.js";

// ── ambientCG full set ─────────────────────────────────────────────

describe("mapTextures — ambientCG set", () => {
  const files = [
    "Onyx006_2K-JPG_Color.jpg",
    "Onyx006_2K-JPG_Roughness.jpg",
    "Onyx006_2K-JPG_NormalGL.jpg",
    "Onyx006_2K-JPG_NormalDX.jpg",
    "Onyx006_2K-JPG_Displacement.jpg",
    "Onyx006.png", // preview image — no channel token
  ];

  it("maps all textures to correct channels", () => {
    const result = mapTextures(files);

    const channels = result.mapped.map((m) => m.channel);
    expect(channels).toContain("base_color");
    expect(channels).toContain("specular_roughness");
    expect(channels).toContain("normal");
    expect(channels).toContain("displacement");
  });

  it("prefers GL normal over DX", () => {
    const result = mapTextures(files);
    const normal = result.mapped.find((m) => m.channel === "normal");
    expect(normal).toBeDefined();
    expect(normal!.file).toBe("Onyx006_2K-JPG_NormalGL.jpg");
    expect(normal!.normalConvention).toBe("gl");
  });

  it("reports DX/GL conflict", () => {
    const result = mapTextures(files);
    const normalConflict = result.conflicts.find((c) => c.channel === "normal");
    expect(normalConflict).toBeDefined();
    expect(normalConflict!.files).toContain("Onyx006_2K-JPG_NormalDX.jpg");
    expect(normalConflict!.files).toContain("Onyx006_2K-JPG_NormalGL.jpg");
  });

  it("puts preview image in unmapped", () => {
    const result = mapTextures(files);
    // Onyx006.png has no channel token — goes to unmapped
    expect(result.unmapped).toContain("Onyx006.png");
  });

  it("every file appears exactly once across mapped/unmapped/conflicts", () => {
    const result = mapTextures(files);
    const mappedFiles = result.mapped.map((m) => m.file);
    const conflictFiles = result.conflicts.flatMap((c) => c.files);
    const allAccountedFor = new Set([
      ...mappedFiles,
      ...result.unmapped,
      ...conflictFiles,
    ]);
    for (const file of files) {
      expect(allAccountedFor.has(file)).toBe(true);
    }
  });
});

// ── Polyhaven full set ─────────────────────────────────────────────

describe("mapTextures — Polyhaven set", () => {
  const files = [
    "rosewood_veneer1_diff_2k.jpg",
    "rosewood_veneer1_rough_2k.exr",
    "rosewood_veneer1_nor_gl_2k.exr",
    "rosewood_veneer1_ao_2k.jpg",
    "rosewood_veneer1_disp_2k.png",
  ];

  it("maps all channels correctly", () => {
    const result = mapTextures(files);
    expect(result.mapped.length).toBe(5);
    expect(result.unmapped.length).toBe(0);
    expect(result.conflicts.length).toBe(0);

    const channels = result.mapped.map((m) => m.channel).sort();
    expect(channels).toEqual([
      "ambient_occlusion",
      "base_color",
      "displacement",
      "normal",
      "specular_roughness",
    ]);
  });

  it("infers EXR textures as linear", () => {
    const result = mapTextures(files);
    const rough = result.mapped.find((m) => m.channel === "specular_roughness");
    expect(rough!.colorspace).toBe("linear");
  });
});

// ── FreePBR / custom naming set ────────────────────────────────────

describe("mapTextures — FreePBR set", () => {
  const files = [
    "gray-granite-flecks-albedo.png",
    "gray-granite-flecks-ao.png",
    "gray-granite-flecks-Metallic.png",
    "gray-granite-flecks-Normal-ogl.png",
    "gray-granite-flecks-Roughness.png",
    "gray-granite-flecks-preview.jpg",
  ];

  it("maps all PBR channels", () => {
    const result = mapTextures(files);
    const channels = result.mapped.map((m) => m.channel).sort();
    expect(channels).toEqual([
      "ambient_occlusion",
      "base_color",
      "metalness",
      "normal",
      "specular_roughness",
    ]);
  });

  it("puts preview image in unmapped (not mapped to a channel)", () => {
    const result = mapTextures(files);
    // Preview is filtered by SKIP_TOKENS → detectChannel returns null → unmapped
    expect(result.unmapped).toContain("gray-granite-flecks-preview.jpg");
    expect(result.mapped.find((m) => m.file === "gray-granite-flecks-preview.jpg")).toBeUndefined();
  });
});

// ── Packed vs individual conflict ──────────────────────────────────

describe("mapTextures — packed vs individual", () => {
  it("prefers individual textures over packed when overlap exists", () => {
    const files = [
      "material_color.jpg",
      "material_roughness.jpg",
      "material_metallic.jpg",
      "material_ao.jpg",
      "material_arm.jpg", // packed: overlaps with roughness, metallic, ao
    ];

    const result = mapTextures(files);

    // Individual textures should win
    const channels = result.mapped.map((m) => m.channel).sort();
    expect(channels).toEqual([
      "ambient_occlusion",
      "base_color",
      "metalness",
      "specular_roughness",
    ]);

    // ARM should be in conflicts
    expect(result.conflicts.length).toBeGreaterThan(0);
    const armConflict = result.conflicts.find((c) =>
      c.files.includes("material_arm.jpg"),
    );
    expect(armConflict).toBeDefined();
  });

  it("keeps packed texture when no individual overlap", () => {
    const files = ["material_color.jpg", "material_arm.jpg"];

    const result = mapTextures(files);
    const channels = result.mapped.map((m) => m.channel);
    expect(channels).toContain("base_color");
    expect(channels).toContain("packed");
    expect(result.conflicts.length).toBe(0);
  });
});

// ── Overrides ──────────────────────────────────────────────────────

describe("mapTextures — overrides", () => {
  it("applies simple channel override", () => {
    const files = ["weird_texture_A.png", "weird_texture_B.png"];
    const result = mapTextures(files, {
      "weird_texture_A.png": "base_color",
      "weird_texture_B.png": "normal",
    });

    expect(result.mapped.length).toBe(2);
    expect(result.mapped.find((m) => m.file === "weird_texture_A.png")!.channel).toBe("base_color");
    expect(result.mapped.find((m) => m.file === "weird_texture_B.png")!.channel).toBe("normal");
    expect(result.mapped.every((m) => m.confidence === "override")).toBe(true);
  });

  it("applies rich override with colorspace", () => {
    const files = ["hdr_albedo.exr"];
    const result = mapTextures(files, {
      "hdr_albedo.exr": { channel: "base_color", colorspace: "srgb" },
    });

    const mapping = result.mapped[0];
    expect(mapping.channel).toBe("base_color");
    expect(mapping.colorspace).toBe("srgb"); // overridden from default linear
    expect(mapping.confidence).toBe("override");
  });

  it("applies packed override", () => {
    const files = ["custom_packed.png"];
    const result = mapTextures(files, {
      "custom_packed.png": {
        channel: "packed",
        packing: {
          r: "ambient_occlusion",
          g: "specular_roughness",
          b: "metalness",
        },
      },
    });

    const mapping = result.mapped[0];
    expect(mapping.channel).toBe("packed");
    expect(mapping.packing).toEqual({
      r: "ambient_occlusion",
      g: "specular_roughness",
      b: "metalness",
    });
  });

  it("override wins over auto-detection", () => {
    const files = ["material_roughness.jpg"];
    const result = mapTextures(files, {
      "material_roughness.jpg": "base_color", // force wrong channel
    });

    expect(result.mapped[0].channel).toBe("base_color");
    expect(result.mapped[0].confidence).toBe("override");
  });
});

// ── Deterministic output ───────────────────────────────────────────

describe("mapTextures — determinism", () => {
  it("produces same output for same input regardless of file order", () => {
    const files = [
      "mat_roughness.jpg",
      "mat_color.jpg",
      "mat_normal.jpg",
      "mat_ao.jpg",
    ];

    const result1 = mapTextures(files);
    const result2 = mapTextures([...files].reverse());

    const channels1 = result1.mapped.map((m) => m.channel);
    const channels2 = result2.mapped.map((m) => m.channel);
    expect(channels1).toEqual(channels2);
  });

  it("mapped array is sorted by channel name", () => {
    const files = [
      "z_roughness.jpg",
      "a_color.jpg",
      "m_normal.jpg",
    ];

    const result = mapTextures(files);
    const channels = result.mapped.map((m) => m.channel);
    expect(channels).toEqual([...channels].sort());
  });
});
