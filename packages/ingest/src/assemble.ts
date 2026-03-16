import type { MtlxDocument, MtlxElement, MtlxInput } from "@materialxjs/json";
import type { TextureMapping, PbrChannel } from "@materialxjs/texture-map";
import type { ShaderModel } from "./types.js";
import { SHADER_INPUT_MAP } from "./types.js";

/**
 * Assemble a MaterialX document from detected texture mappings.
 *
 * Creates:
 * 1. One `tiledimage` node per texture (with file path, colorspace, uvtiling)
 * 2. `extract` nodes for packed textures (R/G/B channel reads)
 * 3. One shader node with inputs connected to the texture/extract nodes
 * 4. One `surfacematerial` node connected to the shader
 *
 * @param textures - Texture mappings from @materialxjs/texture-map
 * @param shader - Shading model to use
 * @param name - Material name
 * @returns Assembled MtlxDocument and any warnings
 */
export function assembleMaterial(
  textures: TextureMapping[],
  shader: ShaderModel,
  name: string,
): { document: MtlxDocument; warnings: string[] } {
  const warnings: string[] = [];
  const children: MtlxElement[] = [];
  const inputMap = SHADER_INPUT_MAP[shader];

  // Track node names for shader wiring
  const channelNodeMap = new Map<PbrChannel, string>();

  // Create tiledimage nodes for each texture
  for (const tex of textures) {
    if (tex.channel === "packed" && tex.packing) {
      // Packed texture: create one tiledimage + extract nodes per sub-channel
      const texNodeName = `${name}_${tex.file.replace(/\.[^.]+$/, "")}_Tex`;
      children.push(createTiledImageNode(texNodeName, tex));

      const channelEntries: [PbrChannel, number][] = [
        [tex.packing.r, 0],
        [tex.packing.g, 1],
        [tex.packing.b, 2],
      ];

      for (const [channel, index] of channelEntries) {
        const extractName = `${name}_${channelLabel(channel)}_Extract`;
        children.push(createExtractNode(extractName, texNodeName, index));
        channelNodeMap.set(channel, extractName);
      }
    } else if (tex.channel !== "packed") {
      // Single-channel texture
      const channel = tex.channel as PbrChannel;
      const nodeName = `${name}_${channelLabel(channel)}_Tex`;
      children.push(createTiledImageNode(nodeName, tex));
      channelNodeMap.set(channel, nodeName);
    }
  }

  // Create shader node
  const shaderNodeName = `${name}_Shader`;
  const shaderInputs: MtlxInput[] = [];

  for (const [channel, nodeName] of channelNodeMap) {
    const inputName = inputMap[channel];
    if (!inputName) {
      warnings.push(
        `E_CHANNEL_DROPPED: ${channel} has no mapping in ${shader}`,
      );
      continue;
    }

    const inputType = channelType(channel);
    shaderInputs.push({
      name: inputName,
      type: inputType,
      nodename: nodeName,
      attributes: {},
    });
  }

  const shaderNode: MtlxElement = {
    category: shader,
    name: shaderNodeName,
    type: "surfaceshader",
    attributes: {},
    inputs: shaderInputs,
    outputs: [],
    children: [],
  };
  children.push(shaderNode);

  // Create surfacematerial node
  const materialNode: MtlxElement = {
    category: "surfacematerial",
    name: `${name}_Material`,
    type: "material",
    attributes: {},
    inputs: [
      {
        name: "surfaceshader",
        type: "surfaceshader",
        nodename: shaderNodeName,
        attributes: {},
      },
    ],
    outputs: [],
    children: [],
  };
  children.push(materialNode);

  const document: MtlxDocument = {
    version: "1.39",
    fileprefix: "./",
    attributes: {},
    children,
  };

  return { document, warnings };
}

/**
 * Create a tiledimage node for a texture.
 */
function createTiledImageNode(
  name: string,
  tex: TextureMapping,
): MtlxElement {
  const inputs: MtlxInput[] = [
    {
      name: "file",
      type: "filename",
      value: tex.file,
      attributes: tex.colorspace === "srgb"
        ? { colorspace: "srgb_texture" }
        : {},
    },
    {
      name: "uvtiling",
      type: "vector2",
      value: "1.0, 1.0",
      attributes: {},
    },
  ];

  // For normal maps, the type is vector3 (not the channel type like color3)
  // but tiledimage output type should match what the node produces
  const outputType = tex.channel === "packed" ? "color3" : channelType(tex.channel as PbrChannel);

  return {
    category: "tiledimage",
    name,
    type: outputType,
    attributes: {},
    inputs,
    outputs: [],
    children: [],
  };
}

/**
 * Create an extract node to pull a single channel from a color3 texture.
 *
 * @param name - Node name
 * @param sourceNode - Name of the tiledimage node to extract from
 * @param index - Channel index (0=R, 1=G, 2=B)
 */
function createExtractNode(
  name: string,
  sourceNode: string,
  index: number,
): MtlxElement {
  return {
    category: "extract",
    name,
    type: "float",
    attributes: {},
    inputs: [
      {
        name: "in",
        type: "color3",
        nodename: sourceNode,
        attributes: {},
      },
      {
        name: "index",
        type: "integer",
        value: String(index),
        attributes: {},
      },
    ],
    outputs: [],
    children: [],
  };
}

/**
 * Get the MaterialX type for a PBR channel.
 */
function channelType(channel: PbrChannel): string {
  switch (channel) {
    case "base_color":
    case "emission":
      return "color3";
    case "normal":
      return "vector3";
    default:
      return "float";
  }
}

/**
 * Get a human-readable label for a channel (used in node naming).
 */
function channelLabel(channel: PbrChannel): string {
  switch (channel) {
    case "base_color": return "BaseColor";
    case "specular_roughness": return "Roughness";
    case "metalness": return "Metalness";
    case "normal": return "Normal";
    case "displacement": return "Displacement";
    case "ambient_occlusion": return "AO";
    case "opacity": return "Opacity";
    case "emission": return "Emission";
  }
}
