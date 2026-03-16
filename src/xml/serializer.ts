import type { MtlxDocument, MtlxElement, MtlxInput, MtlxOutput } from "../types.js";

/**
 * Serialize an MtlxDocument back to a MaterialX XML string.
 */
export function serializeMtlx(doc: MtlxDocument, indent = 2): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0"?>');

  // Build root <materialx> attributes
  const rootAttrs: [string, string][] = [["version", doc.version]];
  if (doc.fileprefix != null) {
    rootAttrs.push(["fileprefix", doc.fileprefix]);
  }
  for (const [key, value] of Object.entries(doc.attributes)) {
    rootAttrs.push([key, value]);
  }

  const rootAttrStr = rootAttrs.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ");
  lines.push(`<materialx ${rootAttrStr}>`);

  for (const child of doc.children) {
    serializeElement(child, lines, indent, 1);
  }

  lines.push("</materialx>");
  return lines.join("\n");
}

function serializeElement(
  element: MtlxElement,
  lines: string[],
  indent: number,
  depth: number,
): void {
  const pad = " ".repeat(indent * depth);
  const attrs = buildElementAttributes(element);
  const attrStr = attrs.length > 0 ? " " + attrs.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ") : "";

  const hasChildren = element.inputs.length > 0 || element.outputs.length > 0 || element.children.length > 0;

  if (!hasChildren) {
    lines.push(`${pad}<${element.category}${attrStr} />`);
    return;
  }

  lines.push(`${pad}<${element.category}${attrStr}>`);

  for (const input of element.inputs) {
    serializeInput(input, lines, indent, depth + 1);
  }
  for (const output of element.outputs) {
    serializeOutput(output, lines, indent, depth + 1);
  }
  for (const child of element.children) {
    serializeElement(child, lines, indent, depth + 1);
  }

  lines.push(`${pad}</${element.category}>`);
}

function buildElementAttributes(element: MtlxElement): [string, string][] {
  const attrs: [string, string][] = [];
  attrs.push(["name", element.name]);
  if (element.type != null) {
    attrs.push(["type", element.type]);
  }
  for (const [key, value] of Object.entries(element.attributes)) {
    attrs.push([key, value]);
  }
  return attrs;
}

function serializeInput(
  input: MtlxInput,
  lines: string[],
  indent: number,
  depth: number,
): void {
  const pad = " ".repeat(indent * depth);
  const attrs: [string, string][] = [["name", input.name], ["type", input.type]];

  if (input.value != null) {
    attrs.push(["value", input.value]);
  }
  if (input.nodename != null) {
    attrs.push(["nodename", input.nodename]);
  }
  if (input.output != null) {
    attrs.push(["output", input.output]);
  }
  for (const [key, value] of Object.entries(input.attributes)) {
    attrs.push([key, value]);
  }

  const attrStr = attrs.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ");
  lines.push(`${pad}<input ${attrStr} />`);
}

function serializeOutput(
  output: MtlxOutput,
  lines: string[],
  indent: number,
  depth: number,
): void {
  const pad = " ".repeat(indent * depth);
  const attrs: [string, string][] = [["name", output.name], ["type", output.type]];

  if (output.nodename != null) {
    attrs.push(["nodename", output.nodename]);
  }
  if (output.output != null) {
    attrs.push(["output", output.output]);
  }
  for (const [key, value] of Object.entries(output.attributes)) {
    attrs.push([key, value]);
  }

  const attrStr = attrs.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ");
  lines.push(`${pad}<output ${attrStr} />`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
