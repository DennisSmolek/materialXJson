import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { Document, Format, NodeIO } from "@gltf-transform/core";
import type { JSONDocument, Texture, Material } from "@gltf-transform/core";
import { documentToProceduralGltf } from "@materialxjs/json";
import type { TextureMapping, PbrChannel } from "@materialxjs/texture-map";
import type {
  PackInput,
  PackOptions,
  PackResult,
  PackGltfResult,
  MetaJson,
  WriteGltfResult,
} from "./types.js";
import { createPreviewMesh } from "./geometry.js";

const VERSION = "0.1.0";
const SUPPORTED_SHADER_CATEGORIES = [
  "open_pbr_surface",
  "standard_surface",
  "gltf_pbr",
] as const;

type ResolvedPackOptions = {
  textures: "embed" | "reference";
  assetMode: "standard" | "procedural";
  geometry: "plane" | "sphere" | "cube" | "none";
  meta: Record<string, unknown>;
  embedMaterialX: boolean;
};

/**
 * Pack an ingested material into a .glb binary.
 *
 * Creates a glTF document with:
 * - A PBR metallic-roughness material with textures mapped from the source
 * - Optional preview geometry (plane, sphere, or cube)
 * - Optional MtlxDocument embedded in glTF extras
 *
 * @param input - Ingest result containing document, textures, and texture directory
 * @param options - Pack options
 * @returns GLB binary and metadata
 *
 * @example
 * ```typescript
 * const result = await ingest("./Wood066_2K/");
 * const { glb, meta } = await packGlb(result);
 * await writeFile("Wood066_2K.glb", glb);
 * ```
 */
export async function packGlb(
  input: PackInput,
  options?: PackOptions,
): Promise<PackResult> {
  const opts = resolvePackOptions(options, { textures: "embed" });
  const { doc, meta } = await createAssetBundle(input, opts);
  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  return { glb, meta };
}

/**
 * Pack an ingested material into a standard .gltf JSON document.
 */
export async function packGltf(
  input: PackInput,
  options?: PackOptions,
): Promise<PackGltfResult> {
  const opts = resolvePackOptions(options, { textures: "reference" });
  return createGltfJsonPackage(input, opts, inferName(input));
}

/**
 * Pack and write a material to disk as .glb + meta.json.
 */
export async function writePackage(
  input: PackInput,
  outputPath: string,
  options?: PackOptions,
): Promise<{ glbPath: string; metaPath: string }> {
  const { glb, meta } = await packGlb(input, options);

  const glbPath = outputPath.endsWith(".glb")
    ? outputPath
    : `${outputPath}.glb`;
  const metaPath = glbPath.replace(/\.glb$/, ".meta.json");

  await mkdir(dirname(glbPath), { recursive: true });
  await writeFile(glbPath, glb);
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  return { glbPath, metaPath };
}

/**
 * Pack and write a material to disk as .gltf + resources + meta.json.
 */
export async function writeGltfPackage(
  input: PackInput,
  outputPath: string,
  options?: PackOptions,
): Promise<WriteGltfResult> {
  const gltfPath = outputPath.endsWith(".gltf")
    ? outputPath
    : `${outputPath}.gltf`;
  const metaPath = gltfPath.replace(/\.gltf$/, ".meta.json");
  const baseName = basename(gltfPath, ".gltf");
  const outDir = dirname(gltfPath);
  const opts = resolvePackOptions(options, { textures: "reference" });
  const { jsonDoc, meta } = await createGltfJsonPackage(input, opts, baseName);
  const resourcePaths: string[] = [];

  await mkdir(outDir, { recursive: true });
  await writeFile(gltfPath, JSON.stringify(jsonDoc.json, null, 2), "utf-8");

  for (const [uri, data] of Object.entries(jsonDoc.resources)) {
    const resourcePath = join(outDir, uri);
    await mkdir(dirname(resourcePath), { recursive: true });
    await writeFile(resourcePath, data);
    resourcePaths.push(resourcePath);
  }

  if (opts.textures === "reference") {
    const copied = new Set<string>();
    for (const texture of input.textures) {
      if (copied.has(texture.file)) continue;
      copied.add(texture.file);

      const sourcePath = join(input.textureDir, texture.file);
      const targetPath = join(outDir, texture.file);
      const image = await readFile(sourcePath);

      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, image);
      resourcePaths.push(targetPath);
    }
  }

  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  return {
    gltfPath,
    resourcePaths: [...new Set(resourcePaths)],
    metaPath,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

function resolvePackOptions(
  options: PackOptions | undefined,
  defaults: { textures: "embed" | "reference" },
): ResolvedPackOptions {
  return {
    textures: options?.textures ?? defaults.textures,
    assetMode: options?.assetMode ?? "standard",
    geometry: options?.geometry ?? "plane",
    embedMaterialX: options?.embedMaterialX ?? false,
    meta: options?.meta ?? {},
  };
}

async function createAssetBundle(
  input: PackInput,
  options: ResolvedPackOptions,
): Promise<{ doc: Document; meta: MetaJson }> {
  const doc = new Document();
  doc.createBuffer();

  const shaderModel = detectShaderModel(input);
  const material = await createMaterial(doc, input, options.textures);
  applyMaterialExtras(material, input, shaderModel);

  if (options.geometry !== "none") {
    const mesh = createPreviewMesh(doc, options.geometry);
    mesh.listPrimitives().forEach((primitive) => primitive.setMaterial(material));

    const scene = doc.createScene("Scene");
    const node = doc.createNode("PreviewNode").setMesh(mesh);
    scene.addChild(node);
  }

  if (options.embedMaterialX) {
    const root = doc.getRoot();
    const extras = toExtras(root.getExtras());
    extras.materialx = input.document;
    root.setExtras(extras);
  }

  return {
    doc,
    meta: buildMeta(input, shaderModel, options.meta),
  };
}

async function createGltfJsonPackage(
  input: PackInput,
  options: ResolvedPackOptions,
  basenameHint: string,
): Promise<PackGltfResult> {
  const { doc, meta } = await createAssetBundle(input, options);
  const io = new NodeIO();
  const jsonDoc = await io.writeJSON(doc, {
    format: Format.GLTF,
    basename: basenameHint,
  });

  if (options.assetMode === "procedural") {
    attachProceduralExtension(jsonDoc, input);
  }

  return { jsonDoc, meta };
}

/**
 * Detect the shader model from the MtlxDocument children.
 */
function detectShaderModel(input: PackInput): string {
  const shader = input.document.children.find((c) =>
    SUPPORTED_SHADER_CATEGORIES.includes(
      c.category as (typeof SUPPORTED_SHADER_CATEGORIES)[number],
    ),
  );
  return shader?.category ?? "unknown";
}

/**
 * Infer a material name from the input.
 */
function inferName(input: PackInput): string {
  // Try the surfacematerial node name
  const mat = input.document.children.find(
    (c) => c.category === "surfacematerial",
  );
  if (mat) return mat.name;

  // Try the shader node name
  const shader = input.document.children.find((c) =>
    ["open_pbr_surface", "standard_surface", "gltf_pbr"].includes(c.category),
  );
  if (shader) return shader.name;

  // Fall back to textureDir basename
  return basename(input.textureDir);
}

/**
 * Create a glTF PBR material with textures mapped from MaterialX channels.
 */
async function createMaterial(
  doc: Document,
  input: PackInput,
  textureMode: "embed" | "reference",
): Promise<Material> {
  const material = doc.createMaterial("Material")
    .setDoubleSided(true)
    .setRoughnessFactor(1)
    .setMetallicFactor(0);

  // Build a channel → texture mapping
  const channelTextures = new Map<PbrChannel, TextureMapping>();
  for (const tex of input.textures) {
    if (tex.channel === "packed" && tex.packing) {
      // For packed textures, map each sub-channel
      channelTextures.set(tex.packing.r, tex);
      channelTextures.set(tex.packing.g, tex);
      channelTextures.set(tex.packing.b, tex);
    } else if (tex.channel !== "packed") {
      channelTextures.set(tex.channel, tex);
    }
  }

  // Load and assign textures
  const loadedTextures = new Map<string, Texture>();

  async function getOrLoadTexture(mapping: TextureMapping): Promise<Texture> {
    if (loadedTextures.has(mapping.file)) {
      return loadedTextures.get(mapping.file)!;
    }

    const tex = doc.createTexture(mapping.file);
    const ext = mapping.file.toLowerCase().split(".").pop();

    if (textureMode === "embed" || textureMode === "reference") {
      const filePath = join(input.textureDir, mapping.file);
      const data = await readFile(filePath);
      tex.setImage(new Uint8Array(data));

      // Set MIME type based on extension
      if (ext === "png") tex.setMimeType("image/png");
      else if (ext === "jpg" || ext === "jpeg") tex.setMimeType("image/jpeg");
      else if (ext === "webp") tex.setMimeType("image/webp");
    }

    if (textureMode === "reference") {
      tex.setURI(mapping.file);
    }

    loadedTextures.set(mapping.file, tex);
    return tex;
  }

  // Map each PBR channel to the glTF material
  // base_color → baseColorTexture
  const baseColor = channelTextures.get("base_color");
  if (baseColor) {
    const tex = await getOrLoadTexture(baseColor);
    material.setBaseColorTexture(tex);
    material.setBaseColorFactor([1, 1, 1, 1]);
  }

  // normal → normalTexture
  const normal = channelTextures.get("normal");
  if (normal) {
    const tex = await getOrLoadTexture(normal);
    material.setNormalTexture(tex);
  }

  // For metallic-roughness, glTF uses a combined texture:
  // - Blue channel: metalness
  // - Green channel: roughness
  // If we have a packed ARM/ORM texture, use it directly.
  // Otherwise, we assign individual textures (glTF will sample them separately).
  const roughness = channelTextures.get("specular_roughness");
  const metalness = channelTextures.get("metalness");

  if (roughness && metalness && roughness.file === metalness.file) {
    // Same packed texture for both — set as metallicRoughnessTexture
    const tex = await getOrLoadTexture(roughness);
    material.setMetallicRoughnessTexture(tex);
    material.setRoughnessFactor(1);
    material.setMetallicFactor(1);
  } else {
    // Individual textures — glTF expects a combined metallicRoughness texture
    // but we can still set individual ones and they'll work in most viewers
    if (roughness) {
      const tex = await getOrLoadTexture(roughness);
      material.setMetallicRoughnessTexture(tex);
      material.setRoughnessFactor(1);
    }
    if (metalness) {
      // If we have a separate metalness, set it on the same slot
      // Note: glTF merges metallic (B) and roughness (G) into one texture
      // For separate textures, roughness takes the slot; metalness sets the factor
      if (!roughness) {
        const tex = await getOrLoadTexture(metalness);
        material.setMetallicRoughnessTexture(tex);
      }
      material.setMetallicFactor(1);
    }
  }

  // ambient_occlusion → occlusionTexture
  const ao = channelTextures.get("ambient_occlusion");
  if (ao) {
    const tex = await getOrLoadTexture(ao);
    material.setOcclusionTexture(tex);
  }

  // emission → emissiveTexture
  const emission = channelTextures.get("emission");
  if (emission) {
    const tex = await getOrLoadTexture(emission);
    material.setEmissiveTexture(tex);
    material.setEmissiveFactor([1, 1, 1]);
  }

  // opacity → alphaMode + baseColorTexture alpha
  const opacity = channelTextures.get("opacity");
  if (opacity) {
    material.setAlphaMode("BLEND");
  }

  // displacement is not supported in glTF — skipped

  return material;
}

function buildMeta(
  input: PackInput,
  shaderModel: string,
  extraMeta: Record<string, unknown>,
): MetaJson {
  const channels = input.textures
    .map((texture) => texture.channel)
    .filter((channel): channel is PbrChannel => channel !== "packed");

  for (const texture of input.textures) {
    if (texture.channel !== "packed" || !texture.packing) continue;

    if (!channels.includes(texture.packing.r)) channels.push(texture.packing.r);
    if (!channels.includes(texture.packing.g)) channels.push(texture.packing.g);
    if (!channels.includes(texture.packing.b)) channels.push(texture.packing.b);
  }

  return {
    name: inferName(input),
    version: VERSION,
    shader: shaderModel,
    textures: input.textures,
    channels: [...new Set(channels)].sort(),
    ...extraMeta,
  };
}

function applyMaterialExtras(
  material: Material,
  input: PackInput,
  shaderModel: string,
): void {
  const unsupported = collectUnsupportedFeatures(input);

  if (Object.keys(unsupported).length === 0 && shaderModel === "gltf_pbr") return;

  const extras = toExtras(material.getExtras());
  extras.materialx = {
    sourceShader: shaderModel,
    unsupported,
  };
  material.setExtras(extras);
}

function collectUnsupportedFeatures(input: PackInput): Record<string, unknown> {
  const materialNode = input.document.children.find(
    (child) => child.category === "surfacematerial",
  );
  const shaderNode = input.document.children.find((child) =>
    SUPPORTED_SHADER_CATEGORIES.includes(
      child.category as (typeof SUPPORTED_SHADER_CATEGORIES)[number],
    ),
  );
  const unsupported: Record<string, unknown> = {};
  const tangent = shaderNode?.inputs.find((entry) => entry.name === "tangent");
  const displacement = materialNode?.inputs.find(
    (entry) => entry.name === "displacementshader",
  );

  if (tangent) unsupported.tangent = serializeInput(tangent);
  if (displacement) unsupported.displacement = serializeInput(displacement);

  return unsupported;
}

function serializeInput(input: PackInput["document"]["children"][number]["inputs"][number]) {
  return {
    name: input.name,
    type: input.type,
    ...(input.value != null ? { value: input.value } : {}),
    ...(input.nodename != null ? { nodename: input.nodename } : {}),
    ...(input.output != null ? { output: input.output } : {}),
    ...(Object.keys(input.attributes).length > 0 ? { attributes: input.attributes } : {}),
  };
}

function attachProceduralExtension(
  jsonDoc: JSONDocument,
  input: PackInput,
): void {
  const root = jsonDoc.json as unknown as Record<string, unknown>;
  const extensions = toExtras(root.extensions);
  const extensionsUsed = new Set<string>(
    Array.isArray(root.extensionsUsed) ? (root.extensionsUsed as string[]) : [],
  );

  extensions.KHR_texture_procedurals = documentToProceduralGltf(input.document);
  extensionsUsed.add("KHR_texture_procedurals");

  root.extensions = extensions;
  root.extensionsUsed = [...extensionsUsed].sort();
}

function toExtras(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}
