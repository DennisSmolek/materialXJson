# Usage Examples

Practical examples for common workflows.

## Table of Contents

- [Basic Conversion](#basic-conversion)
- [Working with the Document Model](#working-with-the-document-model)
- [Server-Side Workflows](#server-side-workflows)
- [Browser / Frontend Workflows](#browser--frontend-workflows)
- [Filtering and Transformation](#filtering-and-transformation)
- [Cross-Format Conversion](#cross-format-conversion)
- [Programmatic Material Creation](#programmatic-material-creation)

---

## Basic Conversion

### XML to materialxjson

```typescript
import { mtlxToJson, toJsonString } from "@materialxjs/json";

const xml = `<?xml version="1.0"?>
<materialx version="1.39" fileprefix="./">
  <open_pbr_surface name="MyShader" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.2, 0.1" />
    <input name="specular_roughness" type="float" value="0.4" />
  </open_pbr_surface>
  <surfacematerial name="MyMaterial" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="MyShader" />
  </surfacematerial>
</materialx>`;

const json = mtlxToJson(xml);
console.log(toJsonString(json));
```

Output:
```json
{
  "mimetype": "application/mtlx+json",
  "materialx": {
    "version": "1.39",
    "fileprefix": "./",
    "children": [
      {
        "name": "MyShader",
        "category": "open_pbr_surface",
        "type": "surfaceshader",
        "inputs": [
          { "name": "base_color", "type": "color3", "value": "0.8, 0.2, 0.1" },
          { "name": "specular_roughness", "type": "float", "value": "0.4" }
        ]
      },
      {
        "name": "MyMaterial",
        "category": "surfacematerial",
        "type": "material",
        "inputs": [
          { "name": "surfaceshader", "type": "surfaceshader", "nodename": "MyShader" }
        ]
      }
    ]
  }
}
```

### materialxjson to XML

```typescript
import { jsonToMtlx } from "@materialxjs/json";

const json = {
  mimetype: "application/mtlx+json" as const,
  materialx: {
    name: "",
    category: "",
    version: "1.39",
    children: [
      {
        name: "RedPlastic",
        category: "standard_surface",
        type: "surfaceshader",
        inputs: [
          { name: "base_color", category: "", type: "color3", value: "0.8, 0.1, 0.1" },
          { name: "specular_roughness", category: "", type: "float", value: "0.3" },
        ],
      },
    ],
  },
};

const xml = jsonToMtlx(json);
console.log(xml);
```

### XML to glTF Procedurals

```typescript
import { parseMtlx, documentToGltf } from "@materialxjs/json";

const doc = parseMtlx(xmlString);
const gltf = documentToGltf(doc);

// Node connections are now index-based
const shader = gltf.procedurals[0].nodes[0];
console.log(shader.inputs.base_color);
// { type: "color3", node: 2 }  <-- refers to nodes[2]
```

---

## Working with the Document Model

### Inspecting Material Structure

```typescript
import { parseMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// List all top-level elements
for (const child of doc.children) {
  console.log(`${child.category} "${child.name}" (${child.type})`);
}
// open_pbr_surface "MyShader" (surfaceshader)
// surfacematerial "MyMaterial" (material)
// tiledimage "BaseColor_Tex" (color3)
// ...
```

### Finding Specific Nodes

```typescript
import { parseMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// Find the material
const material = doc.children.find(c => c.category === "surfacematerial");

// Find all texture nodes
const textures = doc.children.filter(c => c.category === "tiledimage");

// Get all texture file paths
const filePaths = textures.map(tex => {
  const fileInput = tex.inputs.find(i => i.name === "file");
  return { name: tex.name, path: fileInput?.value };
});
console.log(filePaths);
// [
//   { name: "BaseColor_Tex", path: "Wood052_2K-JPG_Color.jpg" },
//   { name: "Roughness_Tex", path: "Wood052_2K-JPG_Roughness.jpg" },
//   ...
// ]
```

### Tracing Node Connections

```typescript
import { parseMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// Build a name lookup map
const nodeMap = new Map(doc.children.map(c => [c.name, c]));

// Trace what the shader's base_color is connected to
const shader = doc.children.find(c => c.category === "open_pbr_surface");
for (const input of shader.inputs) {
  if (input.nodename) {
    const upstream = nodeMap.get(input.nodename);
    console.log(`${input.name} <- ${upstream?.category} "${upstream?.name}"`);
  } else {
    console.log(`${input.name} = ${input.value}`);
  }
}
// base_color <- tiledimage "Wood052_2K_JPG_Color"
// geometry_normal <- normalmap "NormalMap"
// specular_roughness <- tiledimage "Wood052_2K_JPG_Roughness"
```

### Modifying Values

```typescript
import { parseMtlx, serializeMtlx } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// Change roughness value
const shader = doc.children.find(c => c.category === "standard_surface");
const roughness = shader?.inputs.find(i => i.name === "specular_roughness");
if (roughness) {
  roughness.value = "0.7";
}

// Change a texture path
const colorTex = doc.children.find(c => c.name === "BaseColor_Tex");
const fileInput = colorTex?.inputs.find(i => i.name === "file");
if (fileInput) {
  fileInput.value = "new_texture_4K.jpg";
}

// Write back to XML
const modifiedXml = serializeMtlx(doc);
```

### Adding New Nodes

```typescript
import { parseMtlx, serializeMtlx } from "@materialxjs/json";
import type { MtlxElement } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// Add a new texture node
const newTexture: MtlxElement = {
  category: "tiledimage",
  name: "Metalness_Tex",
  type: "float",
  attributes: {},
  inputs: [
    { name: "file", type: "filename", value: "metalness.jpg", attributes: {} },
    { name: "uvtiling", type: "vector2", value: "1.0, 1.0", attributes: {} },
  ],
  outputs: [],
  children: [],
};

doc.children.push(newTexture);

// Connect it to the shader
const shader = doc.children.find(c => c.category === "standard_surface");
shader?.inputs.push({
  name: "metalness",
  type: "float",
  nodename: "Metalness_Tex",
  attributes: {},
});

const xml = serializeMtlx(doc);
```

---

## Server-Side Workflows

### Express API Endpoint

```typescript
import express from "express";
import { readMtlxFile, documentToJson, documentToGltf } from "@materialxjs/json/node";

const app = express();

// Serve material as materialxjson
app.get("/api/materials/:name/json", async (req, res) => {
  const doc = await readMtlxFile(`./materials/${req.params.name}.mtlx`);
  const json = documentToJson(doc);
  res.json(json);
});

// Serve material as glTF procedural
app.get("/api/materials/:name/gltf", async (req, res) => {
  const doc = await readMtlxFile(`./materials/${req.params.name}.mtlx`);
  const gltf = documentToGltf(doc);
  res.json(gltf);
});

// Accept JSON, return XML
app.post("/api/materials/to-xml", express.json(), (req, res) => {
  const { jsonToMtlx } = require("@materialxjs/json");
  const xml = jsonToMtlx(req.body);
  res.type("application/xml").send(xml);
});
```

### Batch File Conversion Script

```typescript
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  readMtlxFile,
  documentToJson,
  writeJsonFile,
} from "@materialxjs/json/node";

async function convertDirectory(inputDir: string, outputDir: string) {
  const files = await readdir(inputDir);
  const mtlxFiles = files.filter(f => f.endsWith(".mtlx"));

  for (const file of mtlxFiles) {
    const doc = await readMtlxFile(join(inputDir, file));
    const json = documentToJson(doc);
    const outName = file.replace(".mtlx", ".json");
    await writeJsonFile(join(outputDir, outName), json);
    console.log(`Converted: ${file} -> ${outName}`);
  }
}

convertDirectory("./materials", "./output");
```

---

## Browser / Frontend Workflows

### Fetch and Display Material Properties

```typescript
import { parseMtlx } from "@materialxjs/json";

async function loadMaterial(url: string) {
  const response = await fetch(url);
  const xml = await response.text();
  const doc = parseMtlx(xml);

  // Extract material info for UI
  const material = doc.children.find(c => c.category === "surfacematerial");
  const shader = doc.children.find(c =>
    c.category === "standard_surface" || c.category === "open_pbr_surface"
  );

  return {
    name: material?.name,
    shaderType: shader?.category,
    inputs: shader?.inputs.map(i => ({
      name: i.name,
      type: i.type,
      value: i.value,
      connected: !!i.nodename,
    })),
  };
}
```

### Material Editor State Management

```typescript
import { parseMtlx, documentToJson, documentFromJson, serializeMtlx } from "@materialxjs/json";
import type { MtlxDocument, MtlxJsonDocument } from "@materialxjs/json";

class MaterialEditor {
  private doc: MtlxDocument;

  constructor(xml: string) {
    this.doc = parseMtlx(xml);
  }

  // Get JSON representation for the UI
  toJson(): MtlxJsonDocument {
    return documentToJson(this.doc);
  }

  // Load from saved JSON state
  static fromJson(json: MtlxJsonDocument): MaterialEditor {
    const doc = documentFromJson(json);
    const editor = new MaterialEditor(serializeMtlx(doc));
    return editor;
  }

  // Export to XML for saving
  toXml(): string {
    return serializeMtlx(this.doc);
  }

  // Update an input value
  setInputValue(nodeName: string, inputName: string, value: string) {
    const node = this.doc.children.find(c => c.name === nodeName);
    const input = node?.inputs.find(i => i.name === inputName);
    if (input) {
      input.value = value;
      input.nodename = undefined; // Disconnect if setting a value
    }
  }
}
```

### Three.js Integration with KHR_texture_procedurals

```typescript
import { parseMtlx, documentToGltf } from "@materialxjs/json";
import type { GltfProceduralDocument, GltfNode } from "@materialxjs/json";

// Convert MaterialX to the format Three.js GLTFLoader expects
async function materialToThreeJsFormat(mtlxUrl: string) {
  const response = await fetch(mtlxUrl);
  const xml = await response.text();
  const doc = parseMtlx(xml);
  const gltf = documentToGltf(doc);

  // The procedurals can be embedded in a glTF file's extensions
  return {
    extensions: {
      KHR_texture_procedurals: gltf,
    },
  };
}
```

---

## Filtering and Transformation

### Skip Certain Element Types

```typescript
import { parseMtlx, documentToJson } from "@materialxjs/json";

const doc = parseMtlx(xmlString);

// Exclude displacement nodes from JSON output
const json = documentToJson(doc, {
  elementPredicate: (el) => el.category !== "displacement",
});
```

### Extract Only Texture Information

```typescript
import { parseMtlx } from "@materialxjs/json";

function extractTextures(xml: string) {
  const doc = parseMtlx(xml);

  return doc.children
    .filter(c => c.category === "tiledimage" || c.category === "image")
    .map(tex => {
      const file = tex.inputs.find(i => i.name === "file");
      const tiling = tex.inputs.find(i => i.name === "uvtiling");
      return {
        name: tex.name,
        type: tex.type,
        filePath: file?.value,
        colorspace: file?.attributes.colorspace,
        tiling: tiling?.value,
      };
    });
}
```

### Transform Texture Paths

```typescript
import { parseMtlx, serializeMtlx } from "@materialxjs/json";

function rebaseTexturePaths(xml: string, newPrefix: string): string {
  const doc = parseMtlx(xml);

  for (const child of doc.children) {
    if (child.category === "tiledimage" || child.category === "image") {
      const fileInput = child.inputs.find(i => i.name === "file");
      if (fileInput?.value) {
        fileInput.value = newPrefix + fileInput.value;
      }
    }
  }

  doc.fileprefix = undefined; // Remove fileprefix since paths are now absolute
  return serializeMtlx(doc);
}

const updated = rebaseTexturePaths(xml, "https://cdn.example.com/textures/");
```

---

## Cross-Format Conversion

### materialxjson to glTF (via internal model)

```typescript
import { documentFromJson, documentToGltf } from "@materialxjs/json";
import type { MtlxJsonDocument } from "@materialxjs/json";

function materialxJsonToGltf(json: MtlxJsonDocument) {
  const doc = documentFromJson(json);
  return documentToGltf(doc);
}
```

### glTF to materialxjson (via internal model)

```typescript
import { documentFromGltf, documentToJson } from "@materialxjs/json";
import type { GltfProceduralDocument } from "@materialxjs/json";

function gltfToMaterialxJson(gltf: GltfProceduralDocument) {
  const doc = documentFromGltf(gltf);
  return documentToJson(doc);
}
```

### Full Format Pipeline

```typescript
import {
  parseMtlx,
  serializeMtlx,
  documentToJson,
  documentFromJson,
  documentToGltf,
  documentFromGltf,
} from "@materialxjs/json";

// Start with XML
const doc = parseMtlx(xmlString);

// Convert to all formats
const materialxJson = documentToJson(doc);      // materialxjson format
const gltfJson = documentToGltf(doc);           // glTF format
const xmlOutput = serializeMtlx(doc);           // Back to XML

// Any format can be converted back to the internal model
const fromMxJson = documentFromJson(materialxJson);
const fromGltf = documentFromGltf(gltfJson);
```

---

## Programmatic Material Creation

### Build a Material from Scratch

```typescript
import { serializeMtlx, documentToJson } from "@materialxjs/json";
import type { MtlxDocument } from "@materialxjs/json";

const doc: MtlxDocument = {
  version: "1.39",
  fileprefix: "./",
  attributes: {},
  children: [
    {
      category: "tiledimage",
      name: "BaseColor",
      type: "color3",
      attributes: {},
      inputs: [
        { name: "file", type: "filename", value: "base_color.jpg", attributes: { colorspace: "srgb_texture" } },
        { name: "uvtiling", type: "vector2", value: "1.0, 1.0", attributes: {} },
      ],
      outputs: [],
      children: [],
    },
    {
      category: "tiledimage",
      name: "Roughness",
      type: "float",
      attributes: {},
      inputs: [
        { name: "file", type: "filename", value: "roughness.jpg", attributes: {} },
        { name: "uvtiling", type: "vector2", value: "1.0, 1.0", attributes: {} },
      ],
      outputs: [],
      children: [],
    },
    {
      category: "open_pbr_surface",
      name: "PBRShader",
      type: "surfaceshader",
      attributes: {},
      inputs: [
        { name: "base_color", type: "color3", nodename: "BaseColor", attributes: {} },
        { name: "specular_roughness", type: "float", nodename: "Roughness", attributes: {} },
      ],
      outputs: [],
      children: [],
    },
    {
      category: "surfacematerial",
      name: "Material",
      type: "material",
      attributes: {},
      inputs: [
        { name: "surfaceshader", type: "surfaceshader", nodename: "PBRShader", attributes: {} },
      ],
      outputs: [],
      children: [],
    },
  ],
};

// Output as XML
console.log(serializeMtlx(doc));

// Or as JSON
console.log(toJsonString(documentToJson(doc)));
```

Output XML:
```xml
<?xml version="1.0"?>
<materialx version="1.39" fileprefix="./">
  <tiledimage name="BaseColor" type="color3">
    <input name="file" type="filename" value="base_color.jpg" colorspace="srgb_texture" />
    <input name="uvtiling" type="vector2" value="1.0, 1.0" />
  </tiledimage>
  <tiledimage name="Roughness" type="float">
    <input name="file" type="filename" value="roughness.jpg" />
    <input name="uvtiling" type="vector2" value="1.0, 1.0" />
  </tiledimage>
  <open_pbr_surface name="PBRShader" type="surfaceshader">
    <input name="base_color" type="color3" nodename="BaseColor" />
    <input name="specular_roughness" type="float" nodename="Roughness" />
  </open_pbr_surface>
  <surfacematerial name="Material" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="PBRShader" />
  </surfacematerial>
</materialx>
```
