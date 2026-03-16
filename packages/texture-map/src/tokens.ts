import type { PbrChannel, PackedChannels } from "./types.js";

/**
 * Channel detection tokens organized by PBR channel.
 *
 * Each entry is a list of lowercase tokens that indicate a specific channel.
 * Tokens are matched against normalized filename segments.
 * Order within each list does not affect precedence — all are treated as
 * exact-confidence aliases.
 */
export const CHANNEL_TOKENS: Record<PbrChannel, string[]> = {
  base_color: [
    "color",
    "basecolor",
    "base_color",
    "diffuse",
    "diff",
    "albedo",
    "col",
  ],
  specular_roughness: ["roughness", "rough", "rgh"],
  metalness: ["metalness", "metallic", "metal", "met"],
  normal: ["normal", "nor", "nrm", "norm", "nml"],
  displacement: ["displacement", "disp", "height", "bump"],
  ambient_occlusion: [
    "ao",
    "ambientocclusion",
    "ambient_occlusion",
    "occlusion",
    "occ",
  ],
  opacity: ["opacity", "alpha", "transparency"],
  emission: ["emission", "emissive", "emit"],
};

/**
 * Tokens that indicate normal map coordinate convention.
 * Checked after a normal channel is detected.
 */
export const NORMAL_CONVENTION_TOKENS = {
  gl: ["gl", "opengl", "ogl"],
  dx: ["dx", "directx"],
} as const;

/**
 * Known packed texture formats.
 * Token → channel layout per RGB channel.
 */
export const PACKED_TOKENS: Record<string, PackedChannels> = {
  arm: {
    r: "ambient_occlusion",
    g: "specular_roughness",
    b: "metalness",
  },
  orm: {
    r: "ambient_occlusion",
    g: "specular_roughness",
    b: "metalness",
  },
};

/**
 * Resolution tokens matched case-insensitively.
 * Values are the canonical uppercase form stored in TextureMapping.resolution.
 */
export const RESOLUTION_TOKENS: Record<string, string> = {
  "1k": "1K",
  "2k": "2K",
  "4k": "4K",
  "8k": "8K",
  "16k": "16K",
};

/**
 * File extensions considered image textures.
 * Used to filter non-texture files from input lists.
 */
export const TEXTURE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".exr",
  ".hdr",
  ".tga",
  ".tif",
  ".tiff",
  ".bmp",
  ".webp",
  ".ktx2",
]);

/**
 * File extensions where color data is typically authored in linear space,
 * even for channels that would normally be sRGB (like base_color).
 */
export const LINEAR_FORMAT_EXTENSIONS = new Set([".exr", ".hdr"]);

/**
 * Channels whose texture data is in sRGB colorspace (for non-HDR formats).
 * All other channels are linear.
 */
export const SRGB_CHANNELS: Set<PbrChannel | "packed"> = new Set([
  "base_color",
  "emission",
]);

/**
 * Filename patterns to skip — these are not PBR channel textures.
 */
export const SKIP_TOKENS = new Set(["preview", "thumb", "thumbnail", "icon"]);
