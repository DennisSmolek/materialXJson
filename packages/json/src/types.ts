// ============================================================================
// Internal Model — shared by all parsers and serializers
// ============================================================================

/** Root MaterialX document */
export interface MtlxDocument {
  version: string;
  fileprefix?: string;
  /** Any other root-level <materialx> attributes (e.g. namespace, colorspace) */
  attributes: Record<string, string>;
  children: MtlxElement[];
}

/** A MaterialX element (node, material, nodegraph, shader, etc.) */
export interface MtlxElement {
  /** XML tag name: "surfacematerial", "tiledimage", "open_pbr_surface", "nodegraph", etc. */
  category: string;
  name: string;
  /** Output type: "material", "color3", "float", "surfaceshader", etc. */
  type?: string;
  /** All other attributes (xpos, ypos, colorspace, nodegroup, etc.) */
  attributes: Record<string, string>;
  inputs: MtlxInput[];
  outputs: MtlxOutput[];
  /** Nested child elements (e.g. nodes inside a nodegraph) */
  children: MtlxElement[];
}

/** An input port — either a literal value or a connection */
export interface MtlxInput {
  name: string;
  type: string;
  /** Literal value as string (e.g. "1.0, 1.0", "texture.jpg") */
  value?: string;
  /** Connection to another node by name */
  nodename?: string;
  /** Specific output port on the connected node */
  output?: string;
  /** Additional attributes (colorspace, uiname, etc.) */
  attributes: Record<string, string>;
}

/** An output port */
export interface MtlxOutput {
  name: string;
  type: string;
  nodename?: string;
  output?: string;
  attributes: Record<string, string>;
}

// ============================================================================
// materialxjson format types
// ============================================================================

/** Top-level materialxjson document */
export interface MtlxJsonDocument {
  mimetype: "application/mtlx+json";
  materialx: MtlxJsonElement;
}

/** An element in materialxjson format */
export interface MtlxJsonElement {
  name: string;
  category: string;
  [key: string]: unknown; // type, version, and all other attributes as top-level keys
  inputs?: MtlxJsonElement[];
  outputs?: MtlxJsonElement[];
  children?: MtlxJsonElement[];
}

// ============================================================================
// glTF KHR_texture_procedurals format types
// ============================================================================

/** Top-level glTF procedurals extension object */
export interface GltfProceduralDocument {
  procedurals: GltfProcedural[];
}

/** Explicit alias for the KHR_texture_procedurals document payload */
export type GltfProceduralExtensionDocument = GltfProceduralDocument;

/** A procedural graph (nodegraph) */
export interface GltfProcedural {
  nodetype: "nodegraph";
  type: string;
  name?: string;
  inputs?: Record<string, GltfInput>;
  outputs?: Record<string, GltfOutput>;
  nodes?: GltfNode[];
}

/** Explicit alias for a KHR_texture_procedurals nodegraph payload */
export type GltfProceduralExtension = GltfProcedural;

/** A node within a procedural graph */
export interface GltfNode {
  nodetype: string;
  type: string;
  name?: string;
  inputs?: Record<string, GltfInput>;
  outputs?: Record<string, GltfOutput>;
}

/** Explicit alias for a node inside a KHR_texture_procedurals payload */
export type GltfProceduralExtensionNode = GltfNode;

/** An input in glTF format */
export interface GltfInput {
  nodetype?: "input";
  type?: string;
  value?: unknown;
  /** Reference to a node by array index */
  node?: number;
  /** Reference to a graph input by name */
  input?: string;
  /** Output port name on the referenced node */
  output?: string;
}

/** An output in glTF format */
export interface GltfOutput {
  nodetype?: "output";
  type?: string;
  /** Reference to upstream node by array index */
  node?: number;
  /** Output port name */
  output?: string;
}

// ============================================================================
// Options
// ============================================================================

export interface JsonWriteOptions {
  /** JSON indentation (default: 2) */
  indent?: number;
  /** Skip elements with non-empty source URIs (default: true) */
  skipLibraryElements?: boolean;
  /** Custom filter predicate */
  elementPredicate?: (element: MtlxElement) => boolean;
}

export interface JsonReadOptions {
  /** Upgrade document version to latest (default: true) */
  upgradeVersion?: boolean;
}

export interface GltfWriteOptions {
  /** Preserve xpos/ypos as extras metadata (default: false) */
  includeUiMetadata?: boolean;
}
