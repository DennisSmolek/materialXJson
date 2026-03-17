import type { TextureMapping, PbrChannel } from "@materialxjs/texture-map";
import type { MtlxDocument } from "@materialxjs/json";

/**
 * Options for packing a material into a .glb file.
 */
export interface PackOptions {
  /** How to handle texture files. Default: "embed" */
  textures?: "embed" | "reference";
  /** Preview geometry to include. Default: "plane" */
  geometry?: "plane" | "sphere" | "cube" | "none";
  /** Extra fields to include in meta.json */
  meta?: Record<string, unknown>;
  /** Store the full MtlxDocument in glTF extras for lossless round-trip. Default: false */
  embedMaterialX?: boolean;
}

/**
 * Result of packing a material into a .glb.
 */
export interface PackResult {
  /** The GLB binary data */
  glb: Uint8Array;
  /** Metadata about the packed material */
  meta: MetaJson;
}

/**
 * Sidecar metadata for a packed .glb material.
 */
export interface MetaJson {
  /** Material name */
  name: string;
  /** @materialxjs/gltf-pack version */
  version: string;
  /** Shading model used in the source material */
  shader: string;
  /** Texture mappings included */
  textures: TextureMapping[];
  /** PBR channels present in the material */
  channels: PbrChannel[];
  /** Original input path, if available */
  source?: string;
  /** User-provided extra fields */
  [key: string]: unknown;
}

/**
 * Input to the pack functions. Matches the shape of IngestResult
 * but only requires the fields we actually need.
 */
export interface PackInput {
  /** The MaterialX document */
  document: MtlxDocument;
  /** Texture mappings */
  textures: TextureMapping[];
  /** Absolute path to the folder containing texture files */
  textureDir: string;
  /** Pipeline warnings from ingest */
  warnings: string[];
}
