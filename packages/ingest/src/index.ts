/**
 * @materialxjs/ingest
 *
 * Ingest PBR materials from texture folders, zip archives, or .mtlx files
 * into a normalized {@link MtlxDocument}. Node.js only.
 *
 * @example
 * ```typescript
 * import { ingest } from "@materialxjs/ingest";
 *
 * // From a texture folder
 * const result = await ingest("./Wood066_2K/");
 * console.log(result.document.children.length);
 *
 * // From a zip (always use try/finally for cleanup)
 * const zipResult = await ingest("./Wood066_2K.zip");
 * try {
 *   // process zipResult.document...
 * } finally {
 *   await zipResult.cleanup();
 * }
 * ```
 *
 * @packageDocumentation
 */

export type {
  IngestOptions,
  IngestResult,
  ZipSafetyOptions,
  ShaderModel,
} from "./types.js";

export { SHADER_INPUT_MAP } from "./types.js";
export { ingest } from "./ingest.js";
export { MaterialXError } from "./errors.js";
