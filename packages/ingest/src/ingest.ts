import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import {
  parseMtlx,
  type MtlxDocument,
  type MtlxElement,
  type MtlxInput,
} from "@materialxjs/json";
import { detectChannel, mapTextures, isTextureFile } from "@materialxjs/texture-map";
import type { TextureMapping } from "@materialxjs/texture-map";
import type { IngestOptions, IngestResult, ShaderModel } from "./types.js";
import { SHADER_INPUT_MAP } from "./types.js";
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
  const textures = extractTexturesFromDocument(document);
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

//* Existing MaterialX Texture Extraction ============================

const SHADER_CATEGORIES = [
  "open_pbr_surface",
  "standard_surface",
  "gltf_pbr",
] as const;

function extractTexturesFromDocument(document: MtlxDocument): TextureMapping[] {
  const textures = new Map<string, TextureMapping>();
  const shaderNode = document.children.find((child) =>
    SHADER_CATEGORIES.includes(
      child.category as (typeof SHADER_CATEGORIES)[number],
    ),
  );
  const materialNode = document.children.find(
    (child) => child.category === "surfacematerial",
  );

  if (!shaderNode) return [];

  const shaderModel = shaderNode.category as ShaderModel;
  const inputToChannel = new Map<string, keyof typeof SHADER_INPUT_MAP[ShaderModel]>();

  for (const [channel, inputName] of Object.entries(SHADER_INPUT_MAP[shaderModel])) {
    if (!inputName) continue;
    inputToChannel.set(inputName, channel as keyof typeof SHADER_INPUT_MAP[ShaderModel]);
  }

  for (const shaderInput of shaderNode.inputs) {
    const channel = inputToChannel.get(shaderInput.name);
    if (!channel) continue;

    const fileInput = resolveTextureFileInput(document, shaderInput);
    const mapping = fileInput
      ? createTextureMappingFromInput(fileInput, channel)
      : null;
    if (mapping) textures.set(mapping.file, mapping);
  }

  const displacementInput = materialNode?.inputs.find(
    (input) => input.name === "displacementshader",
  );
  const displacementFile = displacementInput
    ? resolveTextureFileInput(document, displacementInput)
    : null;
  const displacementMapping = displacementFile
    ? createTextureMappingFromInput(displacementFile, "displacement")
    : null;
  if (displacementMapping) textures.set(displacementMapping.file, displacementMapping);

  return [...textures.values()];
}

function resolveTextureFileInput(
  document: MtlxDocument,
  reference: MtlxInput,
  currentNodegraph?: string,
  visited: Set<string> = new Set(),
): MtlxInput | null {
  const nodegraphName = reference.attributes.nodegraph ?? currentNodegraph;

  if (nodegraphName && reference.output) {
    const nodegraph = document.children.find(
      (child) => child.category === "nodegraph" && child.name === nodegraphName,
    );
    const graphOutput = nodegraph?.outputs.find(
      (output) => output.name === reference.output,
    );

    if (graphOutput) {
      return resolveTextureFileInput(
        document,
        {
          name: graphOutput.name,
          type: graphOutput.type,
          nodename: graphOutput.nodename,
          output: graphOutput.output,
          attributes: graphOutput.attributes,
        },
        nodegraphName,
        visited,
      );
    }
  }

  const target = reference.nodename
    ? findElementByName(document, reference.nodename, nodegraphName)
    : null;
  if (!target) return null;

  const visitKey = `${nodegraphName ?? "root"}:${target.name}`;
  if (visited.has(visitKey)) return null;
  visited.add(visitKey);

  const directFile = target.inputs.find(
    (input) => input.name === "file" && input.value != null,
  );
  if (directFile) return directFile;

  for (const input of target.inputs) {
    if (!input.nodename && !input.attributes.nodegraph && !input.output) continue;

    const nested = resolveTextureFileInput(
      document,
      input,
      nodegraphName,
      visited,
    );
    if (nested) return nested;
  }

  return null;
}

function findElementByName(
  document: MtlxDocument,
  name: string,
  nodegraphName?: string,
): MtlxElement | undefined {
  if (nodegraphName) {
    const nodegraph = document.children.find(
      (child) => child.category === "nodegraph" && child.name === nodegraphName,
    );
    const child = nodegraph?.children.find((entry) => entry.name === name);
    if (child) return child;
  }

  return document.children.find((child) => child.name === name);
}

function createTextureMappingFromInput(
  fileInput: MtlxInput,
  fallbackChannel: TextureMapping["channel"],
): TextureMapping | null {
  if (!fileInput.value) return null;

  const file = fileInput.value;
  const filename = basename(file);
  const detected = detectChannel(filename);
  const colorspace = fileInput.attributes.colorspace?.includes("srgb")
    ? "srgb"
    : detected?.colorspace ?? "linear";

  if (detected?.channel === "packed") {
    return {
      ...detected,
      file,
      colorspace,
    };
  }

  return {
    file,
    channel: detected?.channel ?? fallbackChannel,
    colorspace,
    confidence: detected?.confidence ?? "override",
    ...(detected?.normalConvention
      ? { normalConvention: detected.normalConvention }
      : {}),
    ...(detected?.resolution ? { resolution: detected.resolution } : {}),
  };
}
