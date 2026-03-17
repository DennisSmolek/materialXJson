import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import type { Texture, Material } from "@gltf-transform/core";
import type { TextureMapping, PbrChannel } from "@materialxjs/texture-map";
import type { PackInput, PackOptions, PackResult, MetaJson } from "./types.js";
import { createPreviewMesh } from "./geometry.js";

const VERSION = "0.1.0";

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
  const opts = {
    textures: options?.textures ?? "embed",
    geometry: options?.geometry ?? "plane",
    embedMaterialX: options?.embedMaterialX ?? false,
    meta: options?.meta ?? {},
  };

  const doc = new Document();
  doc.createBuffer();

  // Detect shader model from the MtlxDocument
  const shaderModel = detectShaderModel(input);

  // Create textures and material
  const material = await createMaterial(doc, input, opts.textures);

  // Add preview geometry if requested
  if (opts.geometry !== "none") {
    const mesh = createPreviewMesh(doc, opts.geometry);
    mesh.listPrimitives().forEach((prim) => prim.setMaterial(material));

    const scene = doc.createScene("Scene");
    const node = doc.createNode("PreviewNode").setMesh(mesh);
    scene.addChild(node);
  }

  // Embed MtlxDocument in extras if requested
  if (opts.embedMaterialX) {
    const root = doc.getRoot();
    const extras = root.getExtras() as Record<string, unknown>;
    extras.materialx = input.document;
    root.setExtras(extras);
  }

  // Write GLB
  const io = new NodeIO();
  const glb = await io.writeBinary(doc);

  // Build metadata
  const channels = input.textures
    .map((t) => t.channel)
    .filter((c): c is PbrChannel => c !== "packed");

  // Add packed sub-channels
  for (const t of input.textures) {
    if (t.channel === "packed" && t.packing) {
      if (!channels.includes(t.packing.r)) channels.push(t.packing.r);
      if (!channels.includes(t.packing.g)) channels.push(t.packing.g);
      if (!channels.includes(t.packing.b)) channels.push(t.packing.b);
    }
  }

  const meta: MetaJson = {
    name: inferName(input),
    version: VERSION,
    shader: shaderModel,
    textures: input.textures,
    channels: [...new Set(channels)].sort(),
    ...opts.meta,
  };

  return { glb, meta };
}

/**
 * Pack and write a material to disk as .glb + meta.json.
 *
 * @param input - Ingest result
 * @param outputPath - Path for the .glb file (meta.json written alongside)
 * @param options - Pack options
 * @returns Paths to the written files
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

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Detect the shader model from the MtlxDocument children.
 */
function detectShaderModel(input: PackInput): string {
  const shaderCategories = [
    "open_pbr_surface",
    "standard_surface",
    "gltf_pbr",
  ];
  const shader = input.document.children.find((c) =>
    shaderCategories.includes(c.category),
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

    if (textureMode === "embed") {
      const filePath = join(input.textureDir, mapping.file);
      const data = await readFile(filePath);
      tex.setImage(new Uint8Array(data));

      // Set MIME type based on extension
      const ext = mapping.file.toLowerCase().split(".").pop();
      if (ext === "png") tex.setMimeType("image/png");
      else if (ext === "jpg" || ext === "jpeg") tex.setMimeType("image/jpeg");
      else if (ext === "webp") tex.setMimeType("image/webp");
    } else {
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
