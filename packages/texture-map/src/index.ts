/**
 * @materialxjs/texture-map
 *
 * Pure-logic library for detecting PBR material channels from texture filenames.
 * No file I/O — operates on filename strings only. Browser-safe.
 *
 * @example
 * ```typescript
 * import { mapTextures, detectChannel } from "@materialxjs/texture-map";
 *
 * // Single file detection
 * const result = detectChannel("Wood066_2K-JPG_Color.jpg");
 * // { channel: "base_color", colorspace: "srgb", confidence: "exact", ... }
 *
 * // Batch detection with conflict resolution
 * const batch = mapTextures([
 *   "Wood066_2K-JPG_Color.jpg",
 *   "Wood066_2K-JPG_Roughness.jpg",
 *   "Wood066_2K-JPG_NormalGL.jpg",
 * ]);
 * ```
 *
 * @packageDocumentation
 */

export type {
  PbrChannel,
  NormalConvention,
  MatchConfidence,
  PackedChannels,
  TextureMapping,
  TextureConflict,
  MapResult,
  TextureOverride,
} from "./types.js";

export { detectChannel, isTextureFile, tokenize } from "./detect.js";
export { mapTextures } from "./map.js";
