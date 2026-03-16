import type {
  PbrChannel,
  NormalConvention,
  MatchConfidence,
  TextureMapping,
} from "./types.js";
import {
  CHANNEL_TOKENS,
  NORMAL_CONVENTION_TOKENS,
  PACKED_TOKENS,
  RESOLUTION_TOKENS,
  TEXTURE_EXTENSIONS,
  LINEAR_FORMAT_EXTENSIONS,
  SRGB_CHANNELS,
  SKIP_TOKENS,
} from "./tokens.js";

/**
 * Tokenize a filename into normalized lowercase segments.
 *
 * Splits on `_`, `-`, `.`, and camelCase boundaries, then lowercases.
 * The file extension is excluded from tokens but returned separately.
 *
 * @example
 * tokenize("Wood066_2K-JPG_NormalGL.jpg")
 * // { tokens: ["wood066", "2k", "jpg", "normalgl"], ext: ".jpg" }
 *
 * @example
 * tokenize("gray-granite-flecks-Normal-ogl.png")
 * // { tokens: ["gray", "granite", "flecks", "normal", "ogl"], ext: ".png" }
 */
export function tokenize(filename: string): {
  tokens: string[];
  ext: string;
} {
  // Extract extension
  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base = lastDot >= 0 ? filename.slice(0, lastDot) : filename;

  // Split on separators and camelCase boundaries
  const segments = base
    // Insert separator before uppercase runs: "NormalGL" → "Normal_GL"
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    // Insert separator between uppercase run and lowercase: "GLNormal" → "GL_Normal"
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    // Split on common separators
    .split(/[_\-.\s]+/)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 0);

  return { tokens: segments, ext };
}

/**
 * Check if a file extension belongs to a known texture format.
 */
export function isTextureFile(filename: string): boolean {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return false;
  return TEXTURE_EXTENSIONS.has(filename.slice(lastDot).toLowerCase());
}

/**
 * Detect the PBR channel for a single texture filename.
 *
 * Returns a {@link TextureMapping} if the filename can be identified,
 * or `null` if no channel match is found.
 *
 * Detection precedence: exact alias > vendor pattern > fuzzy match.
 * Use {@link mapTextures} for batch detection with override support.
 *
 * @param filename - Texture filename (basename only, no directory path)
 * @returns Mapping result or null if unrecognized
 *
 * @example
 * detectChannel("Wood066_2K-JPG_Color.jpg")
 * // { file: "Wood066_2K-JPG_Color.jpg", channel: "base_color",
 * //   colorspace: "srgb", confidence: "exact", resolution: "2K" }
 *
 * @example
 * detectChannel("readme.txt")
 * // null (not a texture file)
 */
export function detectChannel(filename: string): TextureMapping | null {
  if (!isTextureFile(filename)) return null;

  const { tokens, ext } = tokenize(filename);

  // Skip preview/thumbnail images
  if (tokens.some((t) => SKIP_TOKENS.has(t))) return null;

  // Try packed texture detection first (ARM, ORM)
  const packed = detectPacked(tokens, ext, filename);
  if (packed) return packed;

  // Try channel detection with exact tokens
  const result = detectChannelFromTokens(tokens, ext, filename);
  return result;
}

/**
 * Detect packed texture format (ARM, ORM, etc.)
 */
function detectPacked(
  tokens: string[],
  ext: string,
  filename: string,
): TextureMapping | null {
  for (const token of tokens) {
    if (token in PACKED_TOKENS) {
      return {
        file: filename,
        channel: "packed",
        packing: PACKED_TOKENS[token],
        resolution: extractResolution(tokens),
        colorspace: "linear", // packed data channels are always linear
        confidence: "exact",
      };
    }
  }
  return null;
}

/**
 * Match tokens against the channel dictionary.
 * Returns the first match found, prioritized by confidence level.
 */
function detectChannelFromTokens(
  tokens: string[],
  ext: string,
  filename: string,
): TextureMapping | null {
  // Pass 1: exact full-token match
  for (const token of tokens) {
    for (const [channel, aliases] of Object.entries(CHANNEL_TOKENS)) {
      if (aliases.includes(token)) {
        return buildMapping(
          filename,
          channel as PbrChannel,
          tokens,
          ext,
          "exact",
        );
      }
    }
  }

  // Pass 2: compound token match (e.g. "basecolor" in "MyMat_basecolor_2k")
  // Already covered since we split tokens. Try joining adjacent pairs
  // for cases like "base" + "color" → "basecolor"
  for (let i = 0; i < tokens.length - 1; i++) {
    const compound = tokens[i] + tokens[i + 1];
    for (const [channel, aliases] of Object.entries(CHANNEL_TOKENS)) {
      if (aliases.includes(compound)) {
        return buildMapping(
          filename,
          channel as PbrChannel,
          tokens,
          ext,
          "exact",
        );
      }
    }
    // Also try with underscore: "base_color"
    const compoundUnderscore = tokens[i] + "_" + tokens[i + 1];
    for (const [channel, aliases] of Object.entries(CHANNEL_TOKENS)) {
      if (aliases.includes(compoundUnderscore)) {
        return buildMapping(
          filename,
          channel as PbrChannel,
          tokens,
          ext,
          "exact",
        );
      }
    }
  }

  return null;
}

/**
 * Build a TextureMapping result with normal convention and colorspace inference.
 */
function buildMapping(
  filename: string,
  channel: PbrChannel,
  tokens: string[],
  ext: string,
  confidence: MatchConfidence,
): TextureMapping {
  const mapping: TextureMapping = {
    file: filename,
    channel,
    resolution: extractResolution(tokens),
    colorspace: inferColorspace(channel, ext),
    confidence,
  };

  // Detect normal map convention
  if (channel === "normal") {
    mapping.normalConvention = detectNormalConvention(tokens);
  }

  return mapping;
}

/**
 * Detect normal map GL/DX convention from tokens.
 * Defaults to "gl" if no convention token is found.
 */
function detectNormalConvention(tokens: string[]): NormalConvention {
  for (const token of tokens) {
    if (NORMAL_CONVENTION_TOKENS.gl.includes(token)) return "gl";
    if (NORMAL_CONVENTION_TOKENS.dx.includes(token)) return "dx";
  }
  // Check compound tokens: "normalgl" → contains "gl" suffix
  for (const token of tokens) {
    for (const glToken of NORMAL_CONVENTION_TOKENS.gl) {
      if (token.endsWith(glToken)) return "gl";
    }
    for (const dxToken of NORMAL_CONVENTION_TOKENS.dx) {
      if (token.endsWith(dxToken)) return "dx";
    }
  }
  return "gl"; // default assumption
}

/**
 * Extract resolution from tokens (e.g. "2k" → "2K").
 */
function extractResolution(tokens: string[]): string | undefined {
  for (const token of tokens) {
    if (token in RESOLUTION_TOKENS) {
      return RESOLUTION_TOKENS[token];
    }
  }
  return undefined;
}

/**
 * Infer colorspace from the PBR channel and file format.
 *
 * Rules:
 * - EXR/HDR files are always linear (even for color channels)
 * - base_color and emission are sRGB for standard formats (JPEG/PNG/etc.)
 * - All other channels (roughness, normal, AO, etc.) are linear
 */
function inferColorspace(
  channel: PbrChannel | "packed",
  ext: string,
): "srgb" | "linear" {
  if (LINEAR_FORMAT_EXTENSIONS.has(ext)) return "linear";
  return SRGB_CHANNELS.has(channel) ? "srgb" : "linear";
}
