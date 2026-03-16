# @materialxjs/ingest

Ingest PBR materials from texture folders, zip archives, or .mtlx files into a normalized `MtlxDocument`. Node.js only.

## Usage

```typescript
import { ingest } from "@materialxjs/ingest";

// From a texture folder
const result = await ingest("./Wood066_2K/");
console.log(result.document.children.length);
console.log(result.textures); // detected channel mappings

// From a zip — always use try/finally for cleanup
const zipResult = await ingest("./Wood066_2K.zip");
try {
  // process zipResult.document, zipResult.textureDir...
} finally {
  await zipResult.cleanup();
}

// From an existing .mtlx — passthrough, preserves original shading model
const mtlxResult = await ingest("./material.mtlx");
```

## Options

```typescript
await ingest("./textures/", {
  shader: "standard_surface",              // default: "open_pbr_surface"
  name: "MyWoodMaterial",                  // default: inferred from path
  overrides: { "weird_tex.png": "normal" }, // passed to @materialxjs/texture-map
  zip: { maxUncompressedSize: 1024 * 1024 * 100 }, // 100 MB limit
});
```

## Input Routing

| Input | Behavior |
|-------|----------|
| `.mtlx` file | Parse with @materialxjs/json, return as-is |
| `.zip` file | Extract to temp dir, process as folder |
| Directory | Scan for textures, assemble into MtlxDocument |
| Directory with `.mtlx` | Parse the .mtlx, use directory as textureDir |

## Generated Material Structure

When building from loose textures, the ingest step creates:

1. `tiledimage` nodes for each texture (with colorspace, uvtiling)
2. `extract` nodes for packed textures (ARM/ORM → per-channel reads)
3. Shader node (OpenPBR Surface by default) with inputs wired to textures
4. `surfacematerial` node connected to the shader

## Zip Safety

Zip extraction enforces:
- Path traversal protection (no `..`, no absolute paths, no null bytes)
- Size limit (default 500 MB) and file count limit (default 1000)
- Temp directory cleanup via `result.cleanup()`

## Error Codes

| Code | When |
|------|------|
| `E_INPUT_NOT_FOUND` | Input path doesn't exist |
| `E_INPUT_UNSUPPORTED` | Not a .mtlx, .zip, or directory / no textures found |
| `E_ZIP_UNSAFE` | Path traversal, size/count exceeded |
| `E_ZIP_EXTRACT_FAILED` | Corrupt or unreadable archive |
| `E_PARSE_FAILED` | Invalid .mtlx content |
| `E_TEXTURE_CONFLICT` | Multiple textures for same channel (warning) |
| `E_TEXTURE_UNMAPPED` | Texture couldn't be identified (warning) |
| `E_CHANNEL_DROPPED` | Channel has no mapping in target shader (warning) |

## Architecture

```
src/
├── index.ts     — Public API exports
├── types.ts     — IngestOptions, IngestResult, shader input mappings
├── errors.ts    — MaterialXError class
├── zip.ts       — Safe zip extraction with fflate
├── assemble.ts  — Texture mappings → MtlxDocument (shader wiring, extract nodes)
└── ingest.ts    — Main entry point, input routing
```
