import { XMLParser } from "fast-xml-parser";
import type { MtlxDocument, MtlxElement, MtlxInput, MtlxOutput } from "../types.js";

// Attributes we handle specially (not dumped into the generic attributes bag)
const RESERVED_ELEMENT_ATTRS = new Set(["name", "type"]);
const RESERVED_INPUT_ATTRS = new Set(["name", "type", "value", "nodename", "output"]);
const RESERVED_ROOT_ATTRS = new Set(["version", "fileprefix"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Preserve attribute order
  preserveOrder: false,
  // Always return arrays for child elements (but not attributes)
  isArray: (_name: string, jpath: string, _isLeafNode: boolean, isAttribute: boolean) => {
    if (isAttribute) return false;
    // Any element that can repeat should be treated as array
    return jpath !== "?xml" && jpath !== "materialx";
  },
  // Don't parse values — keep everything as strings
  parseTagValue: false,
  parseAttributeValue: false,
});

/**
 * Parse a MaterialX XML string into an MtlxDocument.
 */
export function parseMtlx(xml: string): MtlxDocument {
  const parsed = parser.parse(xml);

  const mtlxRoot = parsed.materialx;
  if (!mtlxRoot) {
    throw new Error("Invalid MaterialX document: missing <materialx> root element");
  }

  // Extract root attributes
  const version = mtlxRoot["@_version"] ?? "1.38";
  const fileprefix = mtlxRoot["@_fileprefix"];

  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(mtlxRoot)) {
    if (key.startsWith("@_")) {
      const attrName = key.slice(2);
      if (!RESERVED_ROOT_ATTRS.has(attrName)) {
        attributes[attrName] = String(value);
      }
    }
  }

  // Parse children
  const children = parseChildren(mtlxRoot);

  return {
    version,
    ...(fileprefix != null ? { fileprefix } : {}),
    attributes,
    children,
  };
}

/**
 * Parse all child elements of a parent XML object, returning MtlxElement[].
 * Handles the fact that fast-xml-parser groups children by tag name.
 */
function parseChildren(parentObj: Record<string, unknown>): MtlxElement[] {
  const elements: MtlxElement[] = [];

  for (const [key, value] of Object.entries(parentObj)) {
    // Skip attributes and xml declaration
    if (key.startsWith("@_") || key === "?xml") continue;
    // Skip input elements — they are handled by the parent
    if (key === "input" || key === "output") continue;

    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item == null || typeof item !== "object") continue;
      elements.push(parseElement(key, item as Record<string, unknown>));
    }
  }

  return elements;
}

/**
 * Parse a single XML element into an MtlxElement.
 */
function parseElement(category: string, obj: Record<string, unknown>): MtlxElement {
  const name = String(obj["@_name"] ?? "");
  const type = obj["@_type"] != null ? String(obj["@_type"]) : undefined;

  // Collect generic attributes
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("@_")) {
      const attrName = key.slice(2);
      if (!RESERVED_ELEMENT_ATTRS.has(attrName)) {
        attributes[attrName] = String(value);
      }
    }
  }

  // Parse inputs
  const inputs = parseInputs(obj);

  // Parse outputs
  const outputs = parseOutputs(obj);

  // Parse nested child elements (everything that isn't an attribute, input, or output)
  const children = parseChildren(obj);

  return { category, name, type, attributes, inputs, outputs, children };
}

/**
 * Parse <input> elements from a parent object.
 */
function parseInputs(parentObj: Record<string, unknown>): MtlxInput[] {
  const raw = parentObj["input"];
  if (!raw) return [];

  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => {
    const obj = item as Record<string, unknown>;
    const name = String(obj["@_name"] ?? "");
    const type = String(obj["@_type"] ?? "");
    const value = obj["@_value"] != null ? String(obj["@_value"]) : undefined;
    const nodename = obj["@_nodename"] != null ? String(obj["@_nodename"]) : undefined;
    const output = obj["@_output"] != null ? String(obj["@_output"]) : undefined;

    const attributes: Record<string, string> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith("@_")) {
        const attrName = key.slice(2);
        if (!RESERVED_INPUT_ATTRS.has(attrName)) {
          attributes[attrName] = String(val);
        }
      }
    }

    return { name, type, value, nodename, output, attributes };
  });
}

/**
 * Parse <output> elements from a parent object.
 */
function parseOutputs(parentObj: Record<string, unknown>): MtlxOutput[] {
  const raw = parentObj["output"];
  if (!raw) return [];

  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => {
    const obj = item as Record<string, unknown>;
    const name = String(obj["@_name"] ?? "");
    const type = String(obj["@_type"] ?? "");
    const nodename = obj["@_nodename"] != null ? String(obj["@_nodename"]) : undefined;
    const output = obj["@_output"] != null ? String(obj["@_output"]) : undefined;

    const attributes: Record<string, string> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith("@_")) {
        const attrName = key.slice(2);
        if (!RESERVED_INPUT_ATTRS.has(attrName)) {
          attributes[attrName] = String(val);
        }
      }
    }

    return { name, type, nodename, output, attributes };
  });
}
