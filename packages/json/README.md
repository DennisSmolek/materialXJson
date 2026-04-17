# @materialxjs/json

Core library for MaterialX XML ↔ JSON conversion. Supports two interchange targets — the lossless **materialxjson** tree format and the flat-array **glTF KHR_texture_procedurals** format. Works in Node.js and the browser.

## Install

```bash
npm install @materialxjs/json
```

## Usage

```typescript
import {
  parseMtlx,
  documentToJson,
  documentToProceduralGltf,
  toJsonString,
} from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// materialxjson — lossless mirror of the XML tree
const json = documentToJson(doc);

// glTF KHR_texture_procedurals — flat, index-based, Khronos-standard
const gltf = documentToProceduralGltf(doc);

console.log(toJsonString(json));
```

Round-trip back to XML:

```typescript
import { documentFromJson, serializeMtlx } from "@materialxjs/json";

const doc = documentFromJson(jsonDocument);
const xml = serializeMtlx(doc);
```

## API

| Export | Purpose |
|--------|---------|
| `parseMtlx(xml)` | XML → internal `MtlxDocument` |
| `serializeMtlx(doc)` | internal model → XML |
| `documentToJson(doc, opts?)` / `mtlxToJson(xml, opts?)` | → materialxjson |
| `documentFromJson(json)` / `jsonToMtlx(json)` | materialxjson → internal / XML |
| `documentToProceduralGltf(doc, opts?)` | → glTF KHR_texture_procedurals |
| `documentFromProceduralGltf(gltf)` | glTF procedural → internal |
| `toJsonString(obj, indent?)` | deterministic JSON stringify |

Types: `MtlxDocument`, `MtlxElement`, `MtlxInput`, `MtlxOutput`, `MtlxJsonDocument`, `GltfProceduralDocument`, `JsonWriteOptions`, `JsonReadOptions`, `GltfWriteOptions`.

## Node.js File Helpers

The `./node` subpath adds `readMtlxFile`, `writeMtlxFile`, `readJsonFile`, `writeJsonFile` — thin wrappers over `node:fs/promises`. Use when you want a one-liner for file I/O; otherwise stick with the main entry so your code stays browser-compatible.

```typescript
import { readMtlxFile, writeJsonFile, documentToJson } from "@materialxjs/json/node";

const doc = await readMtlxFile("./material.mtlx");
await writeJsonFile("./material.json", documentToJson(doc));
```

## Browser

The main entry has zero Node.js dependencies:

```typescript
import { parseMtlx, documentToJson } from "@materialxjs/json";

const xml = await (await fetch("/materials/wood.mtlx")).text();
const json = documentToJson(parseMtlx(xml));
```

## More

- Full API reference and examples: see the [repository README](https://github.com/DennisSmolek/materialXJson#readme)
- Format details: [docs/json-formats.md](https://github.com/DennisSmolek/materialXJson/blob/main/docs/json-formats.md)
- [MaterialX spec](https://materialx.org/) · [KHR_texture_procedurals](https://github.com/KhronosGroup/glTF/tree/KHR_texture_procedurals/extensions/2.0/Khronos/KHR_texture_procedurals)
