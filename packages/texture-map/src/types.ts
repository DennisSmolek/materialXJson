/**
 * PBR material channels that can be detected from texture filenames.
 */
export type PbrChannel =
  | "base_color"
  | "specular_roughness"
  | "metalness"
  | "normal"
  | "displacement"
  | "ambient_occlusion"
  | "opacity"
  | "emission";

/** Normal map coordinate convention. */
export type NormalConvention = "gl" | "dx";

/** How confident the detection is, from most to least authoritative. */
export type MatchConfidence = "override" | "exact" | "vendor" | "fuzzy";

/**
 * Channel assignment within a packed texture (e.g. ARM or ORM).
 * Each property maps an RGB channel to a PBR channel.
 */
export interface PackedChannels {
  /** Red channel content */
  r: PbrChannel;
  /** Green channel content */
  g: PbrChannel;
  /** Blue channel content */
  b: PbrChannel;
}

/**
 * A single texture file mapped to a PBR channel.
 */
export interface TextureMapping {
  /** Original filename (basename, no directory) */
  file: string;
  /** Detected PBR channel, or "packed" for multi-channel textures like ARM/ORM */
  channel: PbrChannel | "packed";
  /** For packed textures: which PBR channel lives in each RGB channel */
  packing?: PackedChannels;
  /** For normal maps: detected coordinate convention */
  normalConvention?: NormalConvention;
  /** Detected resolution token (e.g. "2K", "4K") */
  resolution?: string;
  /** Inferred colorspace based on channel type and file format */
  colorspace: "srgb" | "linear";
  /** How the match was made — higher confidence means more reliable */
  confidence: MatchConfidence;
}

/**
 * A conflict where multiple textures matched the same PBR channel.
 */
export interface TextureConflict {
  /** The channel that has multiple candidates */
  channel: PbrChannel;
  /** All filenames that matched this channel */
  files: string[];
  /** Human-readable explanation of the conflict */
  reason: string;
}

/**
 * Result of mapping a set of texture filenames to PBR channels.
 *
 * Every input file appears in exactly one of: `mapped`, `unmapped`, or
 * referenced in `conflicts`. No file is silently dropped.
 */
export interface MapResult {
  /** Textures successfully assigned to a channel (one per channel, conflicts resolved) */
  mapped: TextureMapping[];
  /** Filenames that could not be identified as any PBR channel */
  unmapped: string[];
  /** Channels with multiple candidates — the preferred pick is in `mapped`, alternatives here */
  conflicts: TextureConflict[];
}

/**
 * Override for a specific texture file. Can be a simple channel name
 * or a rich object with additional metadata.
 *
 * @example
 * // Simple override
 * const overrides = { "weird_tex.png": "base_color" };
 *
 * @example
 * // Rich override with colorspace
 * const overrides = {
 *   "hdr_albedo.exr": { channel: "base_color", colorspace: "srgb" },
 *   "custom_packed.png": {
 *     channel: "packed",
 *     packing: { r: "ambient_occlusion", g: "specular_roughness", b: "metalness" },
 *   },
 * };
 */
export type TextureOverride =
  | PbrChannel
  | {
      channel: PbrChannel | "packed";
      colorspace?: "srgb" | "linear";
      normalConvention?: NormalConvention;
      packing?: PackedChannels;
    };
