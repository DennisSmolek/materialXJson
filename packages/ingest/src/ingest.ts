import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { parseMtlx } from "@materialxjs/json";
import { mapTextures, isTextureFile } from "@materialxjs/texture-map";
import type { TextureMapping } from "@materialxjs/texture-map";
import type { IngestOptions, IngestResult, ShaderModel } from "./types.js";
import { MaterialXError } from "./errors.js";
import { extractZip } from "./zip.js";
import { assembleMaterial } from "./assemble.js";

/**
 * Ingest a material from any supported source.
 *
 * Accepts:
 * - A `.mtlx` file — parsed and returned as-is (passthrough)
 * - A `.zip` file — extracted to a temp directory, then processed as a folder
 * - A directory — scanned for textures, assembled into a new MtlxDocument
 * - A directory containing a `.mtlx` — parsed from the .mtlx file
 *
 * When building from loose textures, generates an OpenPBR Surface material
 * by default (configurable via `options.shader`).
 *
 * @param input - Path to a .mtlx file, .zip file, or directory
 * @param options - Ingest options (shader model, overrides, name, zip limits)
 * @returns Ingest result with document, textures, and cleanup function
 *
 * @throws {MaterialXError} `E_INPUT_NOT_FOUND` if the input path doesn't exist
 * @throws {MaterialXError} `E_INPUT_UNSUPPORTED` if the input type isn't recognized
 * @throws {MaterialXError} `E_ZIP_UNSAFE` for unsafe zip contents
 * @throws {MaterialXError} `E_PARSE_FAILED` for invalid .mtlx content
 *
 * @example
 * ```typescript
 * const result = await ingest("./Wood066_2K/");
 * console.log(result.document.children.length); // shader + textures + material
 * console.log(result.textures); // detected channel mappings
 * ```
 *
 * @example
 * ```typescript
 * // Zip source — always use try/finally for cleanup
 * const result = await ingest("./Wood066_2K.zip");
 * try {
 *   // use result.document, result.textureDir...
 * } finally {
 *   await result.cleanup();
 * }
 * ```
 */
export async function ingest(
  input: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  const absInput = resolve(input);

  // Check existence
  let inputStat;
  try {
    inputStat = await stat(absInput);
  } catch {
    throw new MaterialXError(
      "E_INPUT_NOT_FOUND",
      "fatal",
      `Input not found: ${input}`,
    );
  }

  // Route by type
  if (inputStat.isDirectory()) {
    return ingestDirectory(absInput, options);
  }

  if (absInput.endsWith(".mtlx")) {
    return ingestMtlx(absInput, options);
  }

  if (absInput.endsWith(".zip")) {
    return ingestZip(absInput, options);
  }

  throw new MaterialXError(
    "E_INPUT_UNSUPPORTED",
    "fatal",
    `Unsupported input type: ${input}`,
    "Expected a .mtlx file, .zip file, or directory",
  );
}

/**
 * Ingest a .mtlx file — parse and return as-is.
 */
async function ingestMtlx(
  mtlxPath: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  let content: string;
  try {
    content = await readFile(mtlxPath, "utf-8");
  } catch {
    throw new MaterialXError(
      "E_PARSE_FAILED",
      "fatal",
      `Failed to read .mtlx file: ${mtlxPath}`,
    );
  }

  let document;
  try {
    document = parseMtlx(content);
  } catch (err) {
    throw new MaterialXError(
      "E_PARSE_FAILED",
      "fatal",
      `Failed to parse .mtlx: ${mtlxPath}: ${err instanceof Error ? err.message : err}`,
    );
  }

  // Extract texture info from the existing document
  const textures: TextureMapping[] = [];
  const textureDir = join(mtlxPath, "..");

  const noop = async () => {};

  return {
    document,
    textures,
    textureDir,
    warnings: [],
    cleanup: noop,
  };
}

/**
 * Ingest a zip file — extract and process.
 */
async function ingestZip(
  zipPath: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  const { dir, cleanup } = await extractZip(zipPath, options?.zip);

  try {
    const result = await ingestDirectory(dir, options);
    // Transfer cleanup ownership to the result
    return { ...result, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/**
 * Ingest a directory — check for .mtlx, otherwise scan for textures.
 */
async function ingestDirectory(
  dirPath: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  const entries = await readdir(dirPath);

  // Check for .mtlx file inside the directory
  const mtlxFile = entries.find((e) => e.endsWith(".mtlx"));
  if (mtlxFile) {
    const result = await ingestMtlx(join(dirPath, mtlxFile), options);
    return { ...result, textureDir: dirPath };
  }

  // Check for subdirectory (some zips have a single top-level folder)
  // e.g., Wood066_2K.zip → Wood066_2K/ → textures inside
  if (entries.length === 1) {
    const singleEntry = join(dirPath, entries[0]);
    try {
      const s = await stat(singleEntry);
      if (s.isDirectory()) {
        return ingestDirectory(singleEntry, options);
      }
    } catch {
      // Not a directory, continue with current dir
    }
  }

  // Scan for textures
  const allFiles = await collectTextureFiles(dirPath);
  if (allFiles.length === 0) {
    throw new MaterialXError(
      "E_INPUT_UNSUPPORTED",
      "fatal",
      `No texture files found in: ${dirPath}`,
      "Expected a directory containing image files (.jpg, .png, .exr, etc.)",
    );
  }

  // Map textures to channels
  const basenames = allFiles.map((f) => basename(f));
  const mapResult = mapTextures(basenames, options?.overrides);

  // Build warnings from conflicts and unmapped files
  const warnings: string[] = [];
  for (const conflict of mapResult.conflicts) {
    warnings.push(`E_TEXTURE_CONFLICT: ${conflict.reason}`);
  }
  for (const file of mapResult.unmapped) {
    if (isTextureFile(file)) {
      warnings.push(`E_TEXTURE_UNMAPPED: Could not detect channel for ${file}`);
    }
  }

  // Assemble material
  const shader: ShaderModel = options?.shader ?? "open_pbr_surface";
  const materialName =
    options?.name ?? basename(dirPath).replace(/[^a-zA-Z0-9]/g, "_");

  const { document, warnings: assemblyWarnings } = assembleMaterial(
    mapResult.mapped,
    shader,
    materialName,
  );

  warnings.push(...assemblyWarnings);

  const noop = async () => {};

  return {
    document,
    textures: mapResult.mapped,
    textureDir: dirPath,
    warnings,
    cleanup: noop,
  };
}

/**
 * Recursively collect texture files from a directory (one level deep).
 */
async function collectTextureFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath);
  const textures: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    if (isTextureFile(entry)) {
      textures.push(fullPath);
    }
  }

  return textures;
}
