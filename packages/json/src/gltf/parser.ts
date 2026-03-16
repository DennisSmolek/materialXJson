import type {
  MtlxDocument,
  MtlxElement,
  MtlxInput,
  MtlxOutput,
  GltfProceduralDocument,
  GltfProcedural,
  GltfNode,
  GltfInput,
  GltfOutput,
} from "../types.js";

/**
 * Convert a glTF KHR_texture_procedurals document to an MtlxDocument.
 * Each procedural becomes either a <nodegraph> or loose top-level nodes.
 */
export function documentFromGltf(gltfDoc: GltfProceduralDocument): MtlxDocument {
  const children: MtlxElement[] = [];

  for (const procedural of gltfDoc.procedurals) {
    children.push(convertProcedural(procedural));
  }

  return {
    version: "1.39",
    attributes: {},
    children,
  };
}

/**
 * Convert a GltfProcedural to an MtlxElement (nodegraph).
 */
function convertProcedural(procedural: GltfProcedural): MtlxElement {
  const nodes = procedural.nodes ?? [];

  // Build index→name map (use existing name or generate one)
  const indexToName = new Map<number, string>();
  nodes.forEach((node, i) => {
    indexToName.set(i, node.name ?? `node_${i}`);
  });

  // Build graph input names set
  const graphInputNames = new Set(Object.keys(procedural.inputs ?? {}));

  // Convert inputs to MtlxInputs
  const inputs: MtlxInput[] = [];
  for (const [name, gltfInput] of Object.entries(procedural.inputs ?? {})) {
    inputs.push(convertGltfInputToMtlxInput(name, gltfInput));
  }

  // Convert outputs to MtlxOutputs
  const outputs: MtlxOutput[] = [];
  for (const [name, gltfOutput] of Object.entries(procedural.outputs ?? {})) {
    const mtlxOutput: MtlxOutput = {
      name,
      type: gltfOutput.type ?? "",
      attributes: {},
    };
    if (gltfOutput.node != null) {
      mtlxOutput.nodename = indexToName.get(gltfOutput.node);
    }
    if (gltfOutput.output != null) {
      mtlxOutput.output = gltfOutput.output;
    }
    outputs.push(mtlxOutput);
  }

  // Convert child nodes
  const children: MtlxElement[] = nodes.map((node, i) =>
    convertGltfNode(node, i, indexToName, graphInputNames),
  );

  return {
    category: "nodegraph",
    name: procedural.name ?? "",
    type: procedural.type !== "multioutput" ? procedural.type : undefined,
    attributes: {},
    inputs,
    outputs,
    children,
  };
}

/**
 * Convert a GltfNode to an MtlxElement.
 */
function convertGltfNode(
  node: GltfNode,
  index: number,
  indexToName: Map<number, string>,
  graphInputNames: Set<string>,
): MtlxElement {
  const name = node.name ?? `node_${index}`;

  const inputs: MtlxInput[] = [];
  for (const [inputName, gltfInput] of Object.entries(node.inputs ?? {})) {
    inputs.push(
      convertGltfInputRef(inputName, gltfInput, indexToName, graphInputNames),
    );
  }

  const outputs: MtlxOutput[] = [];
  for (const [outputName, gltfOutput] of Object.entries(node.outputs ?? {})) {
    outputs.push({
      name: outputName,
      type: gltfOutput.type ?? "",
      attributes: {},
    });
  }

  return {
    category: node.nodetype,
    name,
    type: node.type !== "unknown" ? node.type : undefined,
    attributes: {},
    inputs,
    outputs,
    children: [],
  };
}

/**
 * Convert a GltfInput (node-level) to MtlxInput, resolving index→name refs.
 */
function convertGltfInputRef(
  name: string,
  gltfInput: GltfInput,
  indexToName: Map<number, string>,
  graphInputNames: Set<string>,
): MtlxInput {
  const mtlxInput: MtlxInput = {
    name,
    type: gltfInput.type ?? "",
    attributes: {},
  };

  if (gltfInput.node != null) {
    mtlxInput.nodename = indexToName.get(gltfInput.node);
    if (gltfInput.output != null) {
      mtlxInput.output = gltfInput.output;
    }
  } else if (gltfInput.input != null) {
    // Reference to a graph-level input
    mtlxInput.nodename = gltfInput.input;
  } else if (gltfInput.value !== undefined) {
    mtlxInput.value = stringifyValue(gltfInput.value);
  }

  return mtlxInput;
}

/**
 * Convert a GltfInput (graph-level) to MtlxInput.
 */
function convertGltfInputToMtlxInput(name: string, gltfInput: GltfInput): MtlxInput {
  const mtlxInput: MtlxInput = {
    name,
    type: gltfInput.type ?? "",
    attributes: {},
  };
  if (gltfInput.value !== undefined) {
    mtlxInput.value = stringifyValue(gltfInput.value);
  }
  return mtlxInput;
}

/**
 * Convert a typed JSON value back to a MaterialX value string.
 */
function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}
