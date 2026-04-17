// Types
export type {
  MtlxDocument,
  MtlxElement,
  MtlxInput,
  MtlxOutput,
  MtlxJsonDocument,
  MtlxJsonElement,
  GltfProceduralDocument,
  GltfProceduralExtensionDocument,
  GltfProcedural,
  GltfProceduralExtension,
  GltfNode,
  GltfProceduralExtensionNode,
  GltfInput,
  GltfOutput,
  JsonWriteOptions,
  JsonReadOptions,
  GltfWriteOptions,
} from "./types.js";

// XML ↔ Internal model
export { parseMtlx } from "./xml/parser.js";
export { serializeMtlx } from "./xml/serializer.js";

// Internal model ↔ materialxjson
export { documentToJson, mtlxToJson, toJsonString } from "./json/serializer.js";
export { documentFromJson, jsonToMtlx } from "./json/parser.js";

// Internal model ↔ glTF KHR_texture_procedurals
export { documentToGltf } from "./gltf/serializer.js";
export { documentFromGltf } from "./gltf/parser.js";
export {
  documentToGltf as documentToProceduralGltf,
} from "./gltf/serializer.js";
export {
  documentFromGltf as documentFromProceduralGltf,
} from "./gltf/parser.js";
