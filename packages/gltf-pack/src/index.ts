/**
 * @materialxjs/gltf-pack
 *
 * Pack MtlxDocument + texture files into a .glb with an optional meta.json
 * sidecar. Creates a glTF PBR metallic-roughness material with textures
 * mapped from the source MaterialX channels.
 *
 * @example
 * ```typescript
 * import { ingest } from "@materialxjs/ingest";
 * import { packGlb, writePackage } from "@materialxjs/gltf-pack";
 *
 * const result = await ingest("./Wood066_2K/");
 * try {
 *   // Get GLB as Uint8Array
 *   const { glb, meta } = await packGlb(result);
 *
 *   // Or write to disk
 *   await writePackage(result, "./output/Wood066_2K.glb");
 * } finally {
 *   await result.cleanup();
 * }
 * ```
 *
 * @packageDocumentation
 */

export type {
  PackOptions,
  PackResult,
  MetaJson,
  PackInput,
} from "./types.js";

export { packGlb, writePackage } from "./pack.js";
