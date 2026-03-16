import type {
  PbrChannel,
  TextureMapping,
  TextureConflict,
  TextureOverride,
  MapResult,
  MatchConfidence,
} from "./types.js";
import { RESOLUTION_TOKENS } from "./tokens.js";
import { detectChannel, isTextureFile } from "./detect.js";

/**
 * Map a set of texture filenames to PBR channels.
 *
 * Processes all filenames through channel detection, resolves conflicts
 * (duplicate channels, DX vs GL normals, packed vs individual), and
 * returns a structured result.
 *
 * Every input file appears in exactly one of: `mapped`, `unmapped`, or
 * referenced in `conflicts`. No file is silently dropped.
 *
 * @param files - Array of texture filenames (basenames, no directory paths)
 * @param overrides - Optional per-file overrides, applied before auto-detection
 * @returns Structured result with mapped textures, unmapped files, and conflicts
 *
 * @example
 * const result = mapTextures([
 *   "Wood066_2K-JPG_Color.jpg",
 *   "Wood066_2K-JPG_Roughness.jpg",
 *   "Wood066_2K-JPG_NormalGL.jpg",
 *   "Wood066_2K-JPG_NormalDX.jpg",
 * ]);
 * // result.mapped: [Color→base_color, Roughness→specular_roughness, NormalGL→normal]
 * // result.conflicts: [{ channel: "normal", files: ["NormalGL", "NormalDX"], ... }]
 */
export function mapTextures(
  files: string[],
  overrides?: Record<string, TextureOverride>,
): MapResult {
  const detections: TextureMapping[] = [];
  const unmapped: string[] = [];

  for (const file of files) {
    // Try override first
    if (overrides && file in overrides) {
      const mapping = applyOverride(file, overrides[file]);
      detections.push(mapping);
      continue;
    }

    // Auto-detect
    const result = detectChannel(file);
    if (result) {
      detections.push(result);
    } else if (isTextureFile(file)) {
      unmapped.push(file);
    } else {
      // Non-texture files (e.g. .blend, .usdc, .mtlx) — silently skip
      unmapped.push(file);
    }
  }

  // Group by channel and resolve conflicts
  return resolveConflicts(detections, unmapped);
}

/**
 * Build a TextureMapping from a user-provided override.
 */
function applyOverride(
  file: string,
  override: TextureOverride,
): TextureMapping {
  if (typeof override === "string") {
    // Simple channel override
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    return {
      file,
      channel: override,
      colorspace: override === "base_color" || override === "emission"
        ? "srgb"
        : "linear",
      confidence: "override",
      ...(override === "normal" ? { normalConvention: "gl" as const } : {}),
    };
  }

  // Rich override
  return {
    file,
    channel: override.channel,
    colorspace: override.colorspace ?? "linear",
    confidence: "override",
    ...(override.packing ? { packing: override.packing } : {}),
    ...(override.normalConvention
      ? { normalConvention: override.normalConvention }
      : {}),
  };
}

/**
 * Resolve conflicts when multiple textures map to the same channel.
 *
 * Rules:
 * 1. Normal maps: prefer GL over DX
 * 2. Packed vs individual: prefer individual textures
 * 3. Duplicate channels: prefer higher confidence, then higher resolution
 */
function resolveConflicts(
  detections: TextureMapping[],
  unmapped: string[],
): MapResult {
  const conflicts: TextureConflict[] = [];

  // Separate packed and unpacked detections
  const packed = detections.filter((d) => d.channel === "packed");
  const unpacked = detections.filter((d) => d.channel !== "packed");

  // Group unpacked by channel
  const byChannel = new Map<PbrChannel, TextureMapping[]>();
  for (const d of unpacked) {
    const ch = d.channel as PbrChannel;
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch)!.push(d);
  }

  const mapped: TextureMapping[] = [];

  // Resolve each channel
  for (const [channel, candidates] of byChannel) {
    if (channel === "normal" && candidates.length > 1) {
      // Normal map conflict: prefer GL
      const resolved = resolveNormalConflict(candidates);
      mapped.push(resolved.winner);
      if (resolved.conflict) conflicts.push(resolved.conflict);
    } else if (candidates.length > 1) {
      // Generic duplicate: pick best confidence, then highest resolution
      const resolved = resolveDuplicateConflict(channel, candidates);
      mapped.push(resolved.winner);
      conflicts.push(resolved.conflict);
    } else {
      mapped.push(candidates[0]);
    }
  }

  // Handle packed textures
  if (packed.length > 0) {
    // Check if individual textures already cover the packed channels
    const packedResult = resolvePackedConflict(packed, byChannel);
    mapped.push(...packedResult.kept);
    conflicts.push(...packedResult.conflicts);
  }

  // Sort mapped by channel name for deterministic output
  mapped.sort((a, b) => {
    if (a.channel === "packed" && b.channel === "packed") return a.file.localeCompare(b.file);
    if (a.channel === "packed") return 1;
    if (b.channel === "packed") return -1;
    return a.channel.localeCompare(b.channel);
  });

  return { mapped, unmapped, conflicts };
}

/**
 * Resolve normal map conflicts: prefer GL over DX.
 */
function resolveNormalConflict(candidates: TextureMapping[]): {
  winner: TextureMapping;
  conflict?: TextureConflict;
} {
  const gl = candidates.filter((c) => c.normalConvention === "gl");
  const dx = candidates.filter((c) => c.normalConvention === "dx");

  if (gl.length > 0 && dx.length > 0) {
    // Prefer GL, report conflict
    const winner = pickBest(gl);
    return {
      winner,
      conflict: {
        channel: "normal",
        files: candidates.map((c) => c.file),
        reason: "Multiple normal maps: GL and DX variants found. GL preferred.",
      },
    };
  }

  if (candidates.length > 1) {
    // Multiple normals but same convention
    return resolveDuplicateConflict("normal", candidates);
  }

  return { winner: candidates[0] };
}

/**
 * Resolve packed texture conflicts against individual textures.
 *
 * If individual textures already cover the channels in a packed texture,
 * prefer the individual textures and report the packed texture as a conflict.
 */
function resolvePackedConflict(
  packed: TextureMapping[],
  existingChannels: Map<PbrChannel, TextureMapping[]>,
): {
  kept: TextureMapping[];
  conflicts: TextureConflict[];
} {
  const kept: TextureMapping[] = [];
  const conflicts: TextureConflict[] = [];

  for (const p of packed) {
    if (!p.packing) {
      kept.push(p);
      continue;
    }

    // Check if individual textures cover any of the packed channels
    const coveredChannels = [p.packing.r, p.packing.g, p.packing.b].filter(
      (ch) => existingChannels.has(ch),
    );

    if (coveredChannels.length > 0) {
      // Individual textures exist for some packed channels — skip packed, report conflict
      conflicts.push({
        channel: p.packing.r, // report under first packed channel
        files: [
          p.file,
          ...coveredChannels.flatMap(
            (ch) => existingChannels.get(ch)?.map((t) => t.file) ?? [],
          ),
        ],
        reason: `Packed texture ${p.file} overlaps with individual textures for ${coveredChannels.join(", ")}. Individual textures preferred.`,
      });
    } else {
      // No overlap — keep the packed texture
      kept.push(p);
    }
  }

  return { kept, conflicts };
}

/**
 * Generic duplicate resolution: higher confidence wins, then higher resolution.
 */
function resolveDuplicateConflict(
  channel: PbrChannel,
  candidates: TextureMapping[],
): {
  winner: TextureMapping;
  conflict: TextureConflict;
} {
  const winner = pickBest(candidates);
  return {
    winner,
    conflict: {
      channel,
      files: candidates.map((c) => c.file),
      reason: `Multiple textures detected for ${channel}. Picked ${winner.file}.`,
    },
  };
}

/** Confidence level ordering (higher index = higher priority). */
const CONFIDENCE_ORDER: MatchConfidence[] = [
  "fuzzy",
  "vendor",
  "exact",
  "override",
];

/** Resolution ordering (higher index = higher resolution). */
const RESOLUTION_ORDER = Object.values(RESOLUTION_TOKENS);

/**
 * Pick the best candidate from a list based on confidence then resolution.
 */
function pickBest(candidates: TextureMapping[]): TextureMapping {
  return candidates.reduce((best, current) => {
    const bestConf = CONFIDENCE_ORDER.indexOf(best.confidence);
    const currConf = CONFIDENCE_ORDER.indexOf(current.confidence);
    if (currConf > bestConf) return current;
    if (currConf < bestConf) return best;

    // Same confidence — compare resolution
    const bestRes = best.resolution
      ? RESOLUTION_ORDER.indexOf(best.resolution)
      : -1;
    const currRes = current.resolution
      ? RESOLUTION_ORDER.indexOf(current.resolution)
      : -1;
    return currRes > bestRes ? current : best;
  });
}
