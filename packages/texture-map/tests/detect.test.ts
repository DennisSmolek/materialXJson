import { describe, it, expect } from "vitest";
import { detectChannel, tokenize, isTextureFile } from "../src/index.js";

// ── Tokenizer ──────────────────────────────────────────────────────

describe("tokenize", () => {
  it("splits on underscores and dashes", () => {
    const { tokens } = tokenize("Wood066_2K-JPG_Color.jpg");
    expect(tokens).toEqual(["wood066", "2k", "jpg", "color"]);
  });

  it("splits camelCase boundaries", () => {
    const { tokens } = tokenize("NormalGL.jpg");
    expect(tokens).toEqual(["normal", "gl"]);
  });

  it("splits uppercase runs followed by lowercase", () => {
    const { tokens } = tokenize("NormalDX.png");
    expect(tokens).toEqual(["normal", "dx"]);
  });

  it("returns extension separately", () => {
    const { ext } = tokenize("texture.exr");
    expect(ext).toBe(".exr");
  });

  it("handles compound separators", () => {
    const { tokens } = tokenize("gray-granite-flecks-Normal-ogl.png");
    expect(tokens).toEqual(["gray", "granite", "flecks", "normal", "ogl"]);
  });
});

// ── isTextureFile ──────────────────────────────────────────────────

describe("isTextureFile", () => {
  it("recognizes common texture formats", () => {
    expect(isTextureFile("tex.jpg")).toBe(true);
    expect(isTextureFile("tex.png")).toBe(true);
    expect(isTextureFile("tex.exr")).toBe(true);
    expect(isTextureFile("tex.hdr")).toBe(true);
    expect(isTextureFile("tex.tga")).toBe(true);
    expect(isTextureFile("tex.webp")).toBe(true);
    expect(isTextureFile("tex.ktx2")).toBe(true);
  });

  it("rejects non-texture files", () => {
    expect(isTextureFile("model.blend")).toBe(false);
    expect(isTextureFile("material.mtlx")).toBe(false);
    expect(isTextureFile("readme.txt")).toBe(false);
    expect(isTextureFile("scene.usdc")).toBe(false);
  });
});

// ── detectChannel: ambientCG naming ────────────────────────────────

describe("detectChannel — ambientCG", () => {
  it("detects Color → base_color", () => {
    const result = detectChannel("Onyx006_2K-JPG_Color.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("base_color");
    expect(result!.colorspace).toBe("srgb");
    expect(result!.resolution).toBe("2K");
    expect(result!.confidence).toBe("exact");
  });

  it("detects Roughness → specular_roughness", () => {
    const result = detectChannel("Wood066_2K-JPG_Roughness.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("specular_roughness");
    expect(result!.colorspace).toBe("linear");
  });

  it("detects NormalGL → normal (gl)", () => {
    const result = detectChannel("Wood052_2K-JPG_NormalGL.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("normal");
    expect(result!.normalConvention).toBe("gl");
    expect(result!.colorspace).toBe("linear");
  });

  it("detects NormalDX → normal (dx)", () => {
    const result = detectChannel("Wood052_2K-JPG_NormalDX.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("normal");
    expect(result!.normalConvention).toBe("dx");
  });

  it("detects Displacement → displacement", () => {
    const result = detectChannel("Onyx006_2K-JPG_Displacement.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("displacement");
  });
});

// ── detectChannel: Polyhaven naming ────────────────────────────────

describe("detectChannel — Polyhaven", () => {
  it("detects diff → base_color", () => {
    const result = detectChannel("rosewood_veneer1_diff_2k.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("base_color");
    expect(result!.resolution).toBe("2K");
  });

  it("detects rough → specular_roughness", () => {
    const result = detectChannel("rosewood_veneer1_rough_2k.exr");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("specular_roughness");
    expect(result!.colorspace).toBe("linear"); // EXR always linear
  });

  it("detects nor_gl → normal (gl)", () => {
    const result = detectChannel("rosewood_veneer1_nor_gl_2k.exr");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("normal");
    expect(result!.normalConvention).toBe("gl");
  });

  it("detects ao → ambient_occlusion", () => {
    const result = detectChannel("rosewood_veneer1_ao_2k.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("ambient_occlusion");
  });

  it("detects disp → displacement", () => {
    const result = detectChannel("rosewood_veneer1_disp_2k.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("displacement");
  });
});

// ── detectChannel: FreePBR / custom naming ─────────────────────────

describe("detectChannel — FreePBR / custom", () => {
  it("detects albedo → base_color", () => {
    const result = detectChannel("gray-granite-flecks-albedo.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("base_color");
  });

  it("detects Metallic → metalness", () => {
    const result = detectChannel("gray-granite-flecks-Metallic.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("metalness");
  });

  it("detects Normal-ogl → normal (gl)", () => {
    const result = detectChannel("gray-granite-flecks-Normal-ogl.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("normal");
    expect(result!.normalConvention).toBe("gl");
  });

  it("detects ao → ambient_occlusion", () => {
    const result = detectChannel("gray-granite-flecks-ao.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("ambient_occlusion");
  });

  it("detects Roughness → specular_roughness", () => {
    const result = detectChannel("gray-granite-flecks-Roughness.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("specular_roughness");
  });
});

// ── detectChannel: packed textures ─────────────────────────────────

describe("detectChannel — packed textures", () => {
  it("detects ARM packed texture", () => {
    const result = detectChannel("metal_arm_2k.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("packed");
    expect(result!.packing).toEqual({
      r: "ambient_occlusion",
      g: "specular_roughness",
      b: "metalness",
    });
    expect(result!.colorspace).toBe("linear");
    expect(result!.resolution).toBe("2K");
  });

  it("detects ORM packed texture", () => {
    const result = detectChannel("brick_wall_orm_4k.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("packed");
    expect(result!.packing).toEqual({
      r: "ambient_occlusion",
      g: "specular_roughness",
      b: "metalness",
    });
    expect(result!.resolution).toBe("4K");
  });
});

// ── detectChannel: HDR/EXR colorspace ──────────────────────────────

describe("detectChannel — colorspace inference", () => {
  it("EXR color texture → linear (not srgb)", () => {
    const result = detectChannel("material_color_2k.exr");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("base_color");
    expect(result!.colorspace).toBe("linear"); // EXR exception
  });

  it("JPG color texture → srgb", () => {
    const result = detectChannel("material_color_2k.jpg");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("base_color");
    expect(result!.colorspace).toBe("srgb");
  });

  it("HDR emission → linear", () => {
    const result = detectChannel("env_emissive.hdr");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("emission");
    expect(result!.colorspace).toBe("linear");
  });

  it("PNG emission → srgb", () => {
    const result = detectChannel("material_emission.png");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("emission");
    expect(result!.colorspace).toBe("srgb");
  });

  it("roughness is always linear regardless of format", () => {
    expect(detectChannel("rough.jpg")!.colorspace).toBe("linear");
    expect(detectChannel("rough.exr")!.colorspace).toBe("linear");
  });
});

// ── detectChannel: edge cases ──────────────────────────────────────

describe("detectChannel — edge cases", () => {
  it("returns null for non-texture files", () => {
    expect(detectChannel("material.mtlx")).toBeNull();
    expect(detectChannel("readme.txt")).toBeNull();
  });

  it("skips preview/thumbnail images", () => {
    expect(detectChannel("Onyx006_preview.jpg")).toBeNull();
    expect(detectChannel("material_thumb.png")).toBeNull();
  });

  it("detects opacity / alpha", () => {
    const result = detectChannel("material_opacity.png");
    expect(result!.channel).toBe("opacity");

    const result2 = detectChannel("leaf_alpha.png");
    expect(result2!.channel).toBe("opacity");
  });

  it("detects height as displacement", () => {
    const result = detectChannel("terrain_height_4k.png");
    expect(result!.channel).toBe("displacement");
    expect(result!.resolution).toBe("4K");
  });

  it("detects bump as displacement", () => {
    const result = detectChannel("wall_bump.jpg");
    expect(result!.channel).toBe("displacement");
  });
});
