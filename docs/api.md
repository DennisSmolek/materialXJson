# API Reference

Complete reference for all exported functions and types.

## Core Conversion Functions

### `parseMtlx(xml: string): MtlxDocument`

Parse a MaterialX XML string into the internal document model. Handles any valid MaterialX element generically — not limited to specific node types.

**Parameters:**
- `xml` — a valid MaterialX XML string (must have a `<materialx>` root element)

**Returns:** `MtlxDocument`

**Throws:** `Error` if the XML is missing a `<materialx>` root element.

```typescript
import { parseMtlx } from "@materialxjs/json";

const doc = parseMtlx(`<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_default" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.8, 0.8" />
  </standard_surface>
</materialx>`);

doc.version        // "1.39"
doc.attributes     // { colorspace: "lin_rec709" }
doc.children[0]    // MtlxElement for "SR_default"
```

---

### `serializeMtlx(doc: MtlxDocument, indent?: number): string`

Serialize an `MtlxDocument` to a MaterialX XML string.

**Parameters:**
- `doc` — the document to serialize
- `indent` — spaces per indent level (default: `2`)

**Returns:** XML string with `<?xml version="1.0"?>` declaration.

```typescript
import { parseMtlx, serializeMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
const xml = serializeMtlx(doc);
// <?xml version="1.0"?>
// <materialx version="1.39">
//   <standard_surface name="SR_default" type="surfaceshader">
//     ...
```

---

### `documentToJson(doc: MtlxDocument, options?: JsonWriteOptions): MtlxJsonDocument`

Convert an `MtlxDocument` to the materialxjson JSON format. This is a lossless conversion — all XML attributes, UI metadata, and connections are preserved.

**Parameters:**
- `doc` — the document to convert
- `options` — optional `JsonWriteOptions`

**Returns:** `MtlxJsonDocument` with `mimetype: "application/mtlx+json"`.

```typescript
import { parseMtlx, documentToJson } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
const json = documentToJson(doc);

// Access the result
json.mimetype                          // "application/mtlx+json"
json.materialx.version                 // "1.39"
json.materialx.children[0].name        // "SR_default"
json.materialx.children[0].inputs[0]   // { name: "base_color", type: "color3", value: "0.8, 0.8, 0.8" }
```

---

### `mtlxToJson(xml: string, options?: JsonWriteOptions): MtlxJsonDocument`

Convenience function combining `parseMtlx` + `documentToJson`.

```typescript
import { mtlxToJson } from "@materialxjs/json";

const json = mtlxToJson(xmlString);
```

---

### `documentFromJson(json: MtlxJsonDocument, options?: JsonReadOptions): MtlxDocument`

Convert a materialxjson document back to the internal `MtlxDocument` model.

**Parameters:**
- `json` — a valid `MtlxJsonDocument` (must have `mimetype: "application/mtlx+json"`)
- `options` — optional `JsonReadOptions`

**Returns:** `MtlxDocument`

**Throws:** `Error` if the mimetype is wrong or the `materialx` root is missing.

```typescript
import { documentFromJson, serializeMtlx } from "@materialxjs/json";

const json = {
  mimetype: "application/mtlx+json",
  materialx: {
    version: "1.39",
    children: [
      {
        name: "MyShader",
        category: "standard_surface",
        type: "surfaceshader",
        inputs: [
          { name: "base_color", type: "color3", value: "0.8, 0.2, 0.1" }
        ]
      }
    ]
  }
};

const doc = documentFromJson(json);
const xml = serializeMtlx(doc);
```

---

### `jsonToMtlx(json: MtlxJsonDocument, options?: JsonReadOptions): string`

Convenience function combining `documentFromJson` + `serializeMtlx`.

```typescript
import { jsonToMtlx } from "@materialxjs/json";

const xml = jsonToMtlx(jsonDocument);
```

---

### `documentToGltf(doc: MtlxDocument, options?: GltfWriteOptions): GltfProceduralDocument`

Convert an `MtlxDocument` to glTF KHR_texture_procedurals format.

Loose (non-nodegraph) elements are automatically wrapped into a synthetic `nodegraph` procedural. Name-based references (`nodename`) are resolved to index-based references (`node: <index>`). Scalar and vector values are parsed from strings into typed JSON values.

**Parameters:**
- `doc` — the document to convert
- `options` — optional `GltfWriteOptions`

**Returns:** `GltfProceduralDocument`

```typescript
import { parseMtlx, documentToGltf } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
const gltf = documentToGltf(doc);

gltf.procedurals[0].nodetype    // "nodegraph"
gltf.procedurals[0].nodes[0]    // { nodetype: "open_pbr_surface", inputs: { base_color: { node: 2 } } }
```

---

### `documentFromGltf(gltf: GltfProceduralDocument): MtlxDocument`

Convert a glTF KHR_texture_procedurals document back to the internal model. Index-based references are resolved back to name-based references.

**Parameters:**
- `gltf` — a valid `GltfProceduralDocument`

**Returns:** `MtlxDocument` (version defaults to `"1.39"`)

```typescript
import { documentFromGltf, serializeMtlx } from "@materialxjs/json";

const doc = documentFromGltf(gltfDocument);
const xml = serializeMtlx(doc);
```

---

## Node.js File Helpers

Available from `@materialxjs/json/node`. This entry point re-exports all core functions plus file I/O utilities.

### `readMtlxFile(path: string): Promise<MtlxDocument>`

Read and parse a `.mtlx` file from disk.

```typescript
import { readMtlxFile } from "@materialxjs/json/node";

const doc = await readMtlxFile("./materials/Wood052.mtlx");
```

### `writeMtlxFile(path: string, doc: MtlxDocument): Promise<void>`

Serialize and write an `MtlxDocument` to a `.mtlx` file.

```typescript
import { readMtlxFile, writeMtlxFile } from "@materialxjs/json/node";

const doc = await readMtlxFile("./input.mtlx");
// modify doc...
await writeMtlxFile("./output.mtlx", doc);
```

### `readJsonFile(path: string): Promise<MtlxJsonDocument>`

Read and parse a materialxjson `.json` file.

```typescript
import { readJsonFile } from "@materialxjs/json/node";

const json = await readJsonFile("./material.json");
```

### `writeJsonFile(path: string, doc: MtlxJsonDocument, options?: JsonWriteOptions): Promise<void>`

Write a materialxjson document to a `.json` file.

```typescript
import { readMtlxFile, documentToJson, writeJsonFile } from "@materialxjs/json/node";

const doc = await readMtlxFile("./material.mtlx");
const json = documentToJson(doc);
await writeJsonFile("./material.json", json);
```

---

## Options

### `JsonWriteOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `indent` | `number` | `2` | JSON indentation spaces |
| `skipLibraryElements` | `boolean` | `true` | Skip elements with non-empty source URIs |
| `elementPredicate` | `(el: MtlxElement) => boolean` | — | Custom filter function |

### `JsonReadOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `upgradeVersion` | `boolean` | `true` | Upgrade document to latest MaterialX version |

### `GltfWriteOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `includeUiMetadata` | `boolean` | `false` | Preserve xpos/ypos as extras |

---

## Types

All types are exported from the main `@materialxjs/json` entry point:

```typescript
import type {
  // Internal model
  MtlxDocument,
  MtlxElement,
  MtlxInput,
  MtlxOutput,

  // materialxjson format
  MtlxJsonDocument,
  MtlxJsonElement,

  // glTF format
  GltfProceduralDocument,
  GltfProcedural,
  GltfNode,
  GltfInput,
  GltfOutput,

  // Options
  JsonWriteOptions,
  JsonReadOptions,
  GltfWriteOptions,
} from "@materialxjs/json";
```
