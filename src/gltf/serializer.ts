import type {
  MtlxDocument,
  MtlxElement,
  MtlxInput,
  GltfProceduralDocument,
  GltfProcedural,
  GltfNode,
  GltfInput,
  GltfOutput,
  GltfWriteOptions,
} from "../types.js";

/**
 * Convert an MtlxDocument to glTF KHR_texture_procedurals format.
 *
 * MaterialX documents may have loose nodes at the root (not wrapped in nodegraphs).
 * The glTF format requires everything to be inside nodegraph procedurals.
 * Loose nodes that form a connected graph are wrapped into a synthetic nodegraph.
 */
export function documentToGltf(
  doc: MtlxDocument,
  options?: GltfWriteOptions,
): GltfProceduralDocument {
  const procedurals: GltfProcedural[] = [];

  // Separate existing nodegraphs from loose nodes
  const nodegraphs = doc.children.filter((c) => c.category === "nodegraph");
  const looseNodes = doc.children.filter((c) => c.category !== "nodegraph");

  // Convert explicit nodegraphs
  for (const ng of nodegraphs) {
    procedurals.push(convertNodegraph(ng, options));
  }

  // Wrap loose nodes into a synthetic procedural if any exist
  if (looseNodes.length > 0) {
    procedurals.push(wrapLooseNodes(looseNodes, options));
  }

  return { procedurals };
}

/**
 * Convert an explicit <nodegraph> element to a GltfProcedural.
 */
function convertNodegraph(
  ng: MtlxElement,
  options?: GltfWriteOptions,
): GltfProcedural {
  // Build name→index map for child nodes (non-input, non-output children)
  const childNodes = ng.children;
  const nameToIndex = new Map<string, number>();
  childNodes.forEach((node, i) => nameToIndex.set(node.name, i));

  // Convert inputs
  const inputs: Record<string, GltfInput> = {};
  for (const input of ng.inputs) {
    inputs[input.name] = convertInputValue(input);
  }

  // Convert outputs
  const outputs: Record<string, GltfOutput> = {};
  for (const output of ng.outputs) {
    const gltfOut: GltfOutput = { nodetype: "output" };
    if (output.type) gltfOut.type = output.type;
    if (output.nodename != null) {
      const idx = nameToIndex.get(output.nodename);
      if (idx != null) gltfOut.node = idx;
    }
    if (output.output != null) gltfOut.output = output.output;
    outputs[output.name] = gltfOut;
  }

  // Convert child nodes
  const nodes: GltfNode[] = childNodes.map((child) =>
    convertNode(child, nameToIndex, ng.inputs, options),
  );

  // Determine output type
  const outputTypes = ng.outputs.map((o) => o.type).filter(Boolean);
  const type = ng.type ?? (outputTypes.length === 1 ? outputTypes[0] : "multioutput");

  const procedural: GltfProcedural = {
    nodetype: "nodegraph",
    type,
  };
  if (ng.name) procedural.name = ng.name;
  if (Object.keys(inputs).length > 0) procedural.inputs = inputs;
  if (Object.keys(outputs).length > 0) procedural.outputs = outputs;
  if (nodes.length > 0) procedural.nodes = nodes;

  return procedural;
}

/**
 * Wrap loose (non-nodegraph) elements into a synthetic procedural.
 * Material and shader nodes reference each other by name — we need to
 * flatten them into a node array with index-based references.
 */
function wrapLooseNodes(
  elements: MtlxElement[],
  options?: GltfWriteOptions,
): GltfProcedural {
  // Build name→index mapping
  const nameToIndex = new Map<string, number>();
  elements.forEach((el, i) => nameToIndex.set(el.name, i));

  const nodes: GltfNode[] = elements.map((el) =>
    convertNode(el, nameToIndex, [], options),
  );

  // Determine type from the material or last node
  const material = elements.find((e) => e.category === "surfacematerial");
  const type = material?.type ?? "multioutput";

  const procedural: GltfProcedural = {
    nodetype: "nodegraph",
    type,
  };
  if (nodes.length > 0) procedural.nodes = nodes;

  return procedural;
}

/**
 * Convert a single MtlxElement to a GltfNode.
 */
function convertNode(
  element: MtlxElement,
  nameToIndex: Map<string, number>,
  graphInputs: MtlxInput[],
  options?: GltfWriteOptions,
): GltfNode {
  const graphInputNames = new Set(graphInputs.map((i) => i.name));

  const node: GltfNode = {
    nodetype: element.category,
    type: element.type ?? "unknown",
  };
  if (element.name) node.name = element.name;

  // Convert inputs
  if (element.inputs.length > 0) {
    const inputs: Record<string, GltfInput> = {};
    for (const input of element.inputs) {
      inputs[input.name] = convertInputRef(input, nameToIndex, graphInputNames);
    }
    node.inputs = inputs;
  }

  // Convert outputs
  if (element.outputs.length > 0) {
    const outputs: Record<string, GltfOutput> = {};
    for (const output of element.outputs) {
      const gltfOut: GltfOutput = { nodetype: "output" };
      if (output.type) gltfOut.type = output.type;
      outputs[output.name] = gltfOut;
    }
    node.outputs = outputs;
  }

  return node;
}

/**
 * Convert an MtlxInput to a GltfInput, resolving name-based refs to index-based.
 */
function convertInputRef(
  input: MtlxInput,
  nameToIndex: Map<string, number>,
  graphInputNames: Set<string>,
): GltfInput {
  const gltfInput: GltfInput = {};

  if (input.type) gltfInput.type = input.type;

  if (input.nodename != null) {
    // Check if this references a graph input
    if (graphInputNames.has(input.nodename)) {
      gltfInput.input = input.nodename;
    } else {
      const idx = nameToIndex.get(input.nodename);
      if (idx != null) {
        gltfInput.node = idx;
      }
    }
    if (input.output != null) {
      gltfInput.output = input.output;
    }
  } else if (input.value != null) {
    gltfInput.value = parseValue(input.value, input.type);
  }

  return gltfInput;
}

/**
 * Convert an MtlxInput value to a GltfInput (for graph-level inputs).
 */
function convertInputValue(input: MtlxInput): GltfInput {
  const gltfInput: GltfInput = { nodetype: "input" };
  if (input.type) gltfInput.type = input.type;
  if (input.value != null) {
    gltfInput.value = parseValue(input.value, input.type);
  }
  return gltfInput;
}

/**
 * Parse a MaterialX value string into a typed JSON value.
 * MaterialX stores values as strings like "1.0, 2.0, 3.0" for vectors.
 */
function parseValue(value: string, type: string): unknown {
  switch (type) {
    case "float":
      return parseFloat(value);
    case "integer":
      return parseInt(value, 10);
    case "boolean":
      return value === "true";
    case "color3":
    case "color4":
    case "vector2":
    case "vector3":
    case "vector4":
    case "integer2":
    case "integer3":
    case "integer4":
      return value.split(",").map((s) => parseFloat(s.trim()));
    case "matrix3x3":
    case "matrix4x4":
      return value.split(",").map((s) => parseFloat(s.trim()));
    case "string":
    case "filename":
    default:
      return value;
  }
}
