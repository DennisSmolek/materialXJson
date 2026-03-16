import type { MtlxDocument } from "@materialxjs/json";
import type {
  PbrChannel,
  TextureMapping,
  TextureOverride,
} from "@materialxjs/texture-map";

/**
 * Safety limits for zip extraction.
 */
export interface ZipSafetyOptions {
  /** Max total uncompressed size in bytes. Default: 500 MB */
  maxUncompressedSize?: number;
  /** Max number of entries in the archive. Default: 1000 */
  maxFileCount?: number;
}

/**
 * Options for the {@link ingest} function.
 */
export interface IngestOptions {
  /** Shading model for generated materials. Default: "open_pbr_surface" */
  shader?: "open_pbr_surface" | "standard_surface" | "gltf_pbr";
  /** Per-file overrides passed to @materialxjs/texture-map */
  overrides?: Record<string, TextureOverride>;
  /** Material name. Default: inferred from input path */
  name?: string;
  /** Zip extraction safety limits */
  zip?: ZipSafetyOptions;
}

/**
 * Result of ingesting a material source.
 *
 * The `cleanup()` function must be called in a `finally` block when the
 * source is a zip file, to remove the temporary extraction directory.
 * For folder and .mtlx inputs, `cleanup()` is a no-op.
 */
export interface IngestResult {
  /** The assembled MaterialX document */
  document: MtlxDocument;
  /** Texture mappings detected/used */
  textures: TextureMapping[];
  /** Absolute path to the folder containing texture files */
  textureDir: string;
  /** Pipeline-level warnings (DX normal skipped, shader approximations, etc.) */
  warnings: string[];
  /**
   * Remove temporary extraction directory (zip sources).
   * No-op for folder/file inputs. Safe to call multiple times.
   * Caller MUST call in a finally block when source is zip to prevent temp dir leaks.
   */
  cleanup: () => Promise<void>;
}

/** Shader input name mapping per shading model. */
export type ShaderModel = "open_pbr_surface" | "standard_surface" | "gltf_pbr";

/** Maps PBR channels to shader input names for each shading model. */
export const SHADER_INPUT_MAP: Record<ShaderModel, Record<PbrChannel, string | null>> = {
  open_pbr_surface: {
    base_color: "base_color",
    specular_roughness: "specular_roughness",
    metalness: "metalness",
    normal: "geometry_normal",
    displacement: "geometry_displacement",
    ambient_occlusion: null, // handled via multiply into base
    opacity: "geometry_opacity",
    emission: "emission_color",
  },
  standard_surface: {
    base_color: "base_color",
    specular_roughness: "specular_roughness",
    metalness: "metalness",
    normal: "normal",
    displacement: "displacement",
    ambient_occlusion: null, // handled via multiply into base
    opacity: "opacity",
    emission: "emission_color",
  },
  gltf_pbr: {
    base_color: "base_color",
    specular_roughness: "roughness",
    metalness: "metallic",
    normal: "normal",
    displacement: null, // glTF PBR has no displacement
    ambient_occlusion: "occlusion",
    opacity: "alpha",
    emission: "emissive",
  },
};
