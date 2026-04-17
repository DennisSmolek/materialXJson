# @materialxjs

TypeScript monorepo for converting between MaterialX XML (`.mtlx`) and JSON formats. Supports two structured interchange targets:

- **materialxjson** — lossless 1:1 mirror of the XML tree (compatible with [kwokcb/materialxjson](https://github.com/kwokcb/materialxjson))
- **glTF KHR_texture_procedurals** — Khronos standard flat-array format with index-based node references

Works in both Node.js and the browser. Includes a smart CLI for batch conversion.

## Packages

| Package | Description | Runtime |
|---------|-------------|---------|
| [`@materialxjs/json`](packages/json/) | Core XML ↔ materialxjson ↔ procedural glTF conversions | Node + browser |
| [`@materialxjs/texture-map`](packages/texture-map/) | Detect PBR channels from texture filenames (pure logic) | Node + browser |
| [`@materialxjs/ingest`](packages/ingest/) | Ingest PBR materials from folders, zips, or `.mtlx` files | Node |
| [`@materialxjs/gltf-pack`](packages/gltf-pack/) | Pack `MtlxDocument` + textures into `.glb` (optional KTX2) | Node |
| [`@materialxjs/cli`](packages/cli/) | `materialxjs` CLI — `convert`, `inspect`, `create`, `pack` | Node |

## Installation

```bash
# Core library (browser + Node)
npm install @materialxjs/json

# Pipeline libraries (Node)
npm install @materialxjs/texture-map @materialxjs/ingest @materialxjs/gltf-pack

# CLI (global)
npm install -g @materialxjs/cli
```

## Quick Start

```typescript
import {
  parseMtlx,
  documentToJson,
  documentToProceduralGltf,
  toJsonString,
} from "@materialxjs/json";

const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="MyShader" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.2, 0.1" />
    <input name="specular_roughness" type="float" value="0.4" />
  </standard_surface>
  <surfacematerial name="MyMaterial" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="MyShader" />
  </surfacematerial>
</materialx>`;

// Parse XML into the internal model
const doc = parseMtlx(xml);

// Convert to materialxjson format
const json = documentToJson(doc);
console.log(toJsonString(json));

// Convert to glTF KHR_texture_procedurals format
const gltf = documentToProceduralGltf(doc);
console.log(toJsonString(gltf));
```

## CLI Usage

The CLI uses explicit subcommands:

```bash
# Show top-level help
npx materialxjs --help

# Convert between MaterialX XML and JSON formats
npx materialxjs convert material.mtlx          # → material.json
npx materialxjs convert material.json          # → material.mtlx

# Convert to a standard glTF asset
npx materialxjs convert material.mtlx --gltf   # → material.gltf + resources

# Embed the procedural extension in a standard glTF asset
npx materialxjs convert material.mtlx --gltf --procedural   # → material.gltf + KHR_texture_procedurals

# Keep the standalone procedural JSON payload explicit
npx materialxjs convert material.mtlx --json --procedural   # → material.gltf.json

# Batch convert a directory
npx materialxjs convert ./materials/

# Inspect a material source
npx materialxjs inspect ./materials/wood/

# Create a material from textures or archives
npx materialxjs create ./materials/wood/

# Pack a material source into .glb + meta.json
npx materialxjs pack ./materials/wood/
```

### Format Flags

Within `convert`, use `--mtlx`, `--json`, `--gltf`, and `--procedural` when auto-detection isn't enough. Priority: flag > `-o` extension > default.

| Flag | Output format |
|------|--------------|
| `--mtlx` | MaterialX XML |
| `--json` | materialxjson |
| `--gltf` | Standard glTF asset (`.gltf`) |
| `--json --procedural` | Standalone KHR_texture_procedurals payload (`.gltf.json`) |
| `--gltf --procedural` | Standard glTF asset with embedded `KHR_texture_procedurals` extension |
| `--indent <n>` | JSON indentation (default: 2) |

## API Reference

### XML Parsing & Serialization

#### `parseMtlx(xml: string): MtlxDocument`

Parse a MaterialX XML string into the internal document model.

```typescript
import { parseMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
console.log(doc.version);       // "1.39"
console.log(doc.children.length); // number of top-level elements
```

#### `serializeMtlx(doc: MtlxDocument, indent?: number): string`

Serialize an internal document model back to MaterialX XML.

```typescript
import { parseMtlx, serializeMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
// ... modify doc ...
const xml = serializeMtlx(doc);
```

### materialxjson Format

#### `documentToJson(doc: MtlxDocument, options?: JsonWriteOptions): MtlxJsonDocument`

Convert an internal document to materialxjson format.

```typescript
import { parseMtlx, documentToJson } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
const json = documentToJson(doc);
// json.mimetype === "application/mtlx+json"
// json.materialx.children[0].category === "standard_surface"
```

#### `mtlxToJson(xml: string, options?: JsonWriteOptions): MtlxJsonDocument`

Convenience function: parse XML and convert to materialxjson in one step.

```typescript
import { mtlxToJson } from "@materialxjs/json";

const json = mtlxToJson(xmlString);
```

#### `documentFromJson(json: MtlxJsonDocument, options?: JsonReadOptions): MtlxDocument`

Convert materialxjson back to the internal document model.

```typescript
import { documentFromJson, serializeMtlx } from "@materialxjs/json";

const doc = documentFromJson(jsonDocument);
const xml = serializeMtlx(doc);
```

#### `jsonToMtlx(json: MtlxJsonDocument, options?: JsonReadOptions): string`

Convenience function: convert materialxjson directly to XML string.

```typescript
import { jsonToMtlx } from "@materialxjs/json";

const xml = jsonToMtlx(jsonDocument);
```

### glTF KHR_texture_procedurals Format

#### `documentToProceduralGltf(doc: MtlxDocument, options?: GltfWriteOptions): GltfProceduralDocument`

Convert an internal document to glTF KHR_texture_procedurals format. Loose nodes are automatically wrapped into nodegraph procedurals, and name-based references are converted to index-based references.

```typescript
import { parseMtlx, documentToProceduralGltf } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
const gltf = documentToProceduralGltf(doc);
// gltf.procedurals[0].nodes[0].inputs.base_color.node === 2
```

#### `documentFromProceduralGltf(gltf: GltfProceduralDocument): MtlxDocument`

Convert glTF KHR_texture_procedurals back to the internal document model. Index-based references are resolved back to name-based references.

```typescript
import { documentFromProceduralGltf, serializeMtlx } from "@materialxjs/json";

const doc = documentFromProceduralGltf(gltfDocument);
const xml = serializeMtlx(doc);
```

### Node.js File Helpers

Import from `materialx-json/node` to get file I/O utilities alongside the core API:

```typescript
import {
  readMtlxFile,
  writeMtlxFile,
  readJsonFile,
  writeJsonFile,
  // All core exports are also available:
  documentToJson,
  documentToProceduralGltf,
} from "@materialxjs/json/node";

// Read and parse a .mtlx file
const doc = await readMtlxFile("./material.mtlx");

// Convert and write JSON
const json = documentToJson(doc);
await writeJsonFile("./material.json", json);

// Read JSON back
const json2 = await readJsonFile("./material.json");
```

### Options

#### `JsonWriteOptions`

```typescript
interface JsonWriteOptions {
  indent?: number;                                  // JSON indentation (default: 2)
  skipLibraryElements?: boolean;                    // Skip library elements (default: true)
  elementPredicate?: (element: MtlxElement) => boolean; // Custom filter
}
```

**Filtering example** — exclude displacement nodes:

```typescript
const json = documentToJson(doc, {
  elementPredicate: (el) => el.category !== "displacement",
});
```

#### `JsonReadOptions`

```typescript
interface JsonReadOptions {
  upgradeVersion?: boolean; // Upgrade document version (default: true)
}
```

#### `GltfWriteOptions`

```typescript
interface GltfWriteOptions {
  includeUiMetadata?: boolean; // Preserve xpos/ypos as extras (default: false)
}
```

## Internal Document Model

All parsers and serializers share a common in-memory representation:

```typescript
interface MtlxDocument {
  version: string;
  fileprefix?: string;
  attributes: Record<string, string>; // colorspace, namespace, etc.
  children: MtlxElement[];
}

interface MtlxElement {
  category: string;                   // XML tag: "surfacematerial", "tiledimage", etc.
  name: string;
  type?: string;                      // "material", "color3", "float", etc.
  attributes: Record<string, string>; // xpos, ypos, colorspace, etc.
  inputs: MtlxInput[];
  outputs: MtlxOutput[];
  children: MtlxElement[];            // Nested elements (e.g. nodegraph children)
}

interface MtlxInput {
  name: string;
  type: string;
  value?: string;                     // Literal value
  nodename?: string;                  // Connection to another node by name
  output?: string;                    // Specific output port on connected node
  attributes: Record<string, string>; // colorspace, etc.
}

interface MtlxOutput {
  name: string;
  type: string;
  nodename?: string;
  output?: string;
  attributes: Record<string, string>;
}
```

### Working with the Model Directly

```typescript
import { parseMtlx, serializeMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// Find all tiledimage nodes
const textureNodes = doc.children.filter(c => c.category === "tiledimage");

// Get texture file paths
const texturePaths = textureNodes.map(node => {
  const fileInput = node.inputs.find(i => i.name === "file");
  return fileInput?.value;
});

// Modify a value
const shader = doc.children.find(c => c.category === "standard_surface");
const roughness = shader?.inputs.find(i => i.name === "specular_roughness");
if (roughness) roughness.value = "0.6";

// Serialize back to XML
const modifiedXml = serializeMtlx(doc);
```

## JSON Format Examples

### materialxjson Format

A lossless tree representation mirroring the XML structure:

```json
{
  "mimetype": "application/mtlx+json",
  "materialx": {
    "version": "1.39",
    "fileprefix": "./",
    "children": [
      {
        "name": "Onyx006_2K_JPG_OpenPbrSurface",
        "category": "open_pbr_surface",
        "type": "surfaceshader",
        "ypos": "-1.879310",
        "xpos": "6.159420",
        "inputs": [
          {
            "name": "base_color",
            "type": "color3",
            "nodename": "Onyx006_2K_JPG_Color"
          }
        ]
      },
      {
        "name": "Onyx006_2K_JPG_Color",
        "category": "tiledimage",
        "type": "color3",
        "inputs": [
          {
            "name": "file",
            "type": "filename",
            "value": "Onyx006_2K-JPG_Color.jpg",
            "colorspace": "srgb_texture"
          },
          {
            "name": "uvtiling",
            "type": "vector2",
            "value": "1.0, 1.0"
          }
        ]
      }
    ]
  }
}
```

Key characteristics:
- `mimetype: "application/mtlx+json"` identifies the format
- Connections use name-based references (`nodename`)
- Values are always strings (matching XML attribute values)
- All XML attributes preserved (including UI metadata like `xpos`, `ypos`)

### glTF KHR_texture_procedurals Format

A flat-array representation with index-based references, following the [Khronos spec](https://github.com/KhronosGroup/glTF/tree/KHR_texture_procedurals/extensions/2.0/Khronos/KHR_texture_procedurals):

```json
{
  "procedurals": [
    {
      "nodetype": "nodegraph",
      "type": "material",
      "nodes": [
        {
          "nodetype": "open_pbr_surface",
          "type": "surfaceshader",
          "name": "Onyx006_2K_JPG_OpenPbrSurface",
          "inputs": {
            "base_color": {
              "type": "color3",
              "node": 2
            }
          }
        },
        {
          "nodetype": "tiledimage",
          "type": "color3",
          "name": "Onyx006_2K_JPG_Color",
          "inputs": {
            "file": {
              "type": "filename",
              "value": "Onyx006_2K-JPG_Color.jpg"
            },
            "uvtiling": {
              "type": "vector2",
              "value": [1, 1]
            }
          }
        }
      ]
    }
  ]
}
```

Key characteristics:
- Connections use index-based references (`"node": 2` refers to `nodes[2]`)
- Inputs/outputs are objects keyed by name (not arrays)
- Values are typed (numbers, arrays) instead of raw strings
- All nodes wrapped in `nodegraph` procedurals

## Architecture

```
                          +--- [materialxjson Serializer] <-> materialxjson JSON (lossless)
XML <-> [XML Layer] <-> MtlxDocument
                          +--- [glTF Serializer] <-> KHR_texture_procedurals JSON (standards)
```

Both JSON formats share the same internal `MtlxDocument` model. Round-trip through materialxjson is lossless. Round-trip through glTF may lose UI metadata (`xpos`/`ypos`) and wraps loose nodes into nodegraphs.

## Browser Usage

The main entry point (`@materialxjs/json`) has no Node.js dependencies and works in browsers:

```typescript
// Browser — no Node.js polyfills needed
import { parseMtlx, documentToJson, documentToProceduralGltf } from "@materialxjs/json";

const response = await fetch("/materials/wood.mtlx");
const xml = await response.text();
const doc = parseMtlx(xml);
const json = documentToJson(doc);
const procedural = documentToProceduralGltf(doc);
```

File I/O helpers are available only through the `@materialxjs/json/node` entry point.

## Development

```bash
pnpm install      # Install dependencies
pnpm build        # Build all packages
pnpm test         # Run tests
```

## References

- [MaterialX Specification](https://materialx.org/)
- [materialxjson (Python)](https://github.com/kwokcb/materialxjson) — reference implementation
- [KHR_texture_procedurals](https://github.com/KhronosGroup/glTF/tree/KHR_texture_procedurals/extensions/2.0/Khronos/KHR_texture_procedurals) — glTF extension spec

## License

MIT
