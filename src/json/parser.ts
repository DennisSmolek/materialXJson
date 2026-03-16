import type {
  MtlxDocument,
  MtlxElement,
  MtlxInput,
  MtlxOutput,
  MtlxJsonDocument,
  MtlxJsonElement,
  JsonReadOptions,
} from "../types.js";
import { serializeMtlx } from "../xml/serializer.js";

/**
 * Convert a materialxjson document to an MtlxDocument.
 */
export function documentFromJson(
  jsonDoc: MtlxJsonDocument,
  _options?: JsonReadOptions,
): MtlxDocument {
  if (jsonDoc.mimetype !== "application/mtlx+json") {
    throw new Error("Invalid materialxjson document: wrong or missing mimetype");
  }
  if (!jsonDoc.materialx) {
    throw new Error("Invalid materialxjson document: missing materialx root");
  }

  const root = jsonDoc.materialx;

  // Extract known root properties
  const version = String(root.version ?? "1.38");
  const fileprefix = root.fileprefix != null ? String(root.fileprefix) : undefined;

  // Collect other root-level attributes
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(root)) {
    if (typeof value === "string" && !["name", "category", "version", "fileprefix"].includes(key)) {
      attributes[key] = value;
    }
  }

  // Parse children
  const children = (root.children ?? []).map((child) => elementFromJson(child));

  return {
    version,
    ...(fileprefix != null ? { fileprefix } : {}),
    attributes,
    children,
  };
}

/**
 * Convenience: parse materialxjson and convert directly to MaterialX XML string.
 */
export function jsonToMtlx(
  json: MtlxJsonDocument,
  options?: JsonReadOptions,
): string {
  const doc = documentFromJson(json, options);
  return serializeMtlx(doc);
}

/**
 * Convert a materialxjson element to an MtlxElement.
 */
function elementFromJson(jsonElem: MtlxJsonElement): MtlxElement {
  const name = String(jsonElem.name ?? "");
  const category = String(jsonElem.category ?? "");
  const type = jsonElem.type != null ? String(jsonElem.type) : undefined;

  // Collect generic attributes (string values that aren't reserved keys)
  const reservedKeys = new Set(["name", "category", "type", "inputs", "outputs", "children"]);
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(jsonElem)) {
    if (!reservedKeys.has(key) && typeof value === "string") {
      attributes[key] = value;
    }
  }

  // Parse inputs — items in the "inputs" array have implicit category "input"
  const inputs: MtlxInput[] = (jsonElem.inputs ?? []).map((item) => inputFromJson(item));

  // Parse outputs — items in the "outputs" array have implicit category "output"
  const outputs: MtlxOutput[] = (jsonElem.outputs ?? []).map((item) => outputFromJson(item));

  // Parse nested children — they carry their own category
  const children: MtlxElement[] = (jsonElem.children ?? []).map((child) => elementFromJson(child));

  return { category, name, type, attributes, inputs, outputs, children };
}

function inputFromJson(jsonElem: MtlxJsonElement): MtlxInput {
  const name = String(jsonElem.name ?? "");
  const type = String(jsonElem.type ?? "");
  const value = jsonElem.value != null ? String(jsonElem.value) : undefined;
  const nodename = jsonElem.nodename != null ? String(jsonElem.nodename) : undefined;
  const output = jsonElem.output != null ? String(jsonElem.output) : undefined;

  const reservedKeys = new Set(["name", "category", "type", "value", "nodename", "output"]);
  const attributes: Record<string, string> = {};
  for (const [key, val] of Object.entries(jsonElem)) {
    if (!reservedKeys.has(key) && typeof val === "string") {
      attributes[key] = val;
    }
  }

  return { name, type, value, nodename, output, attributes };
}

function outputFromJson(jsonElem: MtlxJsonElement): MtlxOutput {
  const name = String(jsonElem.name ?? "");
  const type = String(jsonElem.type ?? "");
  const nodename = jsonElem.nodename != null ? String(jsonElem.nodename) : undefined;
  const output = jsonElem.output != null ? String(jsonElem.output) : undefined;

  const reservedKeys = new Set(["name", "category", "type", "nodename", "output"]);
  const attributes: Record<string, string> = {};
  for (const [key, val] of Object.entries(jsonElem)) {
    if (!reservedKeys.has(key) && typeof val === "string") {
      attributes[key] = val;
    }
  }

  return { name, type, nodename, output, attributes };
}
