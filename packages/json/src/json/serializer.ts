import type {
  MtlxDocument,
  MtlxElement,
  MtlxInput,
  MtlxOutput,
  MtlxJsonDocument,
  MtlxJsonElement,
  JsonWriteOptions,
} from "../types.js";
import { parseMtlx } from "../xml/parser.js";

/**
 * Convert an MtlxDocument to materialxjson format.
 */
export function documentToJson(
  doc: MtlxDocument,
  options?: JsonWriteOptions,
): MtlxJsonDocument {
  const documentRoot: Record<string, unknown> = {};

  // Add root-level attributes (version, colorspace, etc.)
  documentRoot.version = doc.version;
  if (doc.fileprefix != null) {
    documentRoot.fileprefix = doc.fileprefix;
  }
  for (const [key, value] of Object.entries(doc.attributes)) {
    documentRoot[key] = value;
  }

  // Serialize children
  const children: MtlxJsonElement[] = [];
  for (const child of doc.children) {
    const jsonElem = elementToJson(child, options);
    if (jsonElem) {
      children.push(jsonElem);
    }
  }
  documentRoot.children = children;

  return {
    mimetype: "application/mtlx+json",
    materialx: documentRoot as MtlxJsonElement,
  };
}

/**
 * Stringify any document (MtlxJsonDocument or GltfProceduralDocument) to a
 * pretty-printed JSON string. Defaults to 2-space indentation.
 */
export function toJsonString(doc: unknown, indent = 2): string {
  return JSON.stringify(doc, null, indent);
}

/**
 * Convenience: parse XML string and convert directly to materialxjson.
 */
export function mtlxToJson(
  xml: string,
  options?: JsonWriteOptions,
): MtlxJsonDocument {
  const doc = parseMtlx(xml);
  return documentToJson(doc, options);
}

/**
 * Convert a single MtlxElement to a materialxjson JSON element.
 */
function elementToJson(
  element: MtlxElement,
  options?: JsonWriteOptions,
): MtlxJsonElement | null {
  // Apply element predicate filter
  if (options?.elementPredicate && !options.elementPredicate(element)) {
    return null;
  }

  const jsonElem: Record<string, unknown> = {};
  jsonElem.name = element.name;
  jsonElem.category = element.category;

  // Add type and other attributes
  if (element.type != null) {
    jsonElem.type = element.type;
  }
  for (const [key, value] of Object.entries(element.attributes)) {
    jsonElem[key] = value;
  }

  // Serialize inputs
  const inputs: MtlxJsonElement[] = [];
  for (const input of element.inputs) {
    inputs.push(inputToJson(input));
  }

  // Serialize outputs
  const outputs: MtlxJsonElement[] = [];
  for (const output of element.outputs) {
    outputs.push(outputToJson(output));
  }

  // Serialize nested children
  const children: MtlxJsonElement[] = [];
  for (const child of element.children) {
    const jsonChild = elementToJson(child, options);
    if (jsonChild) {
      children.push(jsonChild);
    }
  }

  // Only include non-empty arrays (matching Python behavior)
  if (inputs.length > 0) jsonElem.inputs = inputs;
  if (children.length > 0) jsonElem.children = children;
  if (outputs.length > 0) jsonElem.outputs = outputs;

  return jsonElem as MtlxJsonElement;
}

function inputToJson(input: MtlxInput): MtlxJsonElement {
  const jsonElem: Record<string, unknown> = {};
  jsonElem.name = input.name;
  jsonElem.type = input.type;
  if (input.value != null) jsonElem.value = input.value;
  if (input.nodename != null) jsonElem.nodename = input.nodename;
  if (input.output != null) jsonElem.output = input.output;
  for (const [key, value] of Object.entries(input.attributes)) {
    jsonElem[key] = value;
  }
  return jsonElem as MtlxJsonElement;
}

function outputToJson(output: MtlxOutput): MtlxJsonElement {
  const jsonElem: Record<string, unknown> = {};
  jsonElem.name = output.name;
  jsonElem.type = output.type;
  if (output.nodename != null) jsonElem.nodename = output.nodename;
  if (output.output != null) jsonElem.output = output.output;
  for (const [key, value] of Object.entries(output.attributes)) {
    jsonElem[key] = value;
  }
  return jsonElem as MtlxJsonElement;
}
