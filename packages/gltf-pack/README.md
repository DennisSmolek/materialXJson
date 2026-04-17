# @materialxjs/gltf-pack

Pack an `MtlxDocument` plus its textures into a single `.glb` — with an optional `meta.json` sidecar and preview geometry. Produces a standard glTF 2.0 PBR metallic-roughness material with channels wired up from the source MaterialX. Node.js only.

## Install

```bash
npm install @materialxjs/gltf-pack @materialxjs/ingest
```

## Usage

```typescript
import { ingest } from "@materialxjs/ingest";
import { packGlb, writePackage } from "@materialxjs/gltf-pack";

const result = await ingest("./Wood066_2K/");
try {
  // In-memory: get the .glb bytes and meta.json
  const { glb, meta } = await packGlb(result);

  // Or write .glb + meta.json to disk
  await writePackage(result, "./output/Wood066_2K.glb");
} finally {
  await result.cleanup();
}
```

For a plain `.gltf` asset (JSON + .bin + textures) instead of a binary `.glb`, use `packGltf` / `writeGltfPackage`.

## API

| Export | Purpose |
|--------|---------|
| `packGlb(input, opts?)` | Build an in-memory `.glb` (`Uint8Array`) + meta sidecar |
| `packGltf(input, opts?)` | Build an in-memory standard glTF asset |
| `writePackage(input, outPath, opts?)` | Write `.glb` + `meta.json` to disk |
| `writeGltfPackage(input, outPath, opts?)` | Write `.gltf` + `.bin` + textures to disk |

Types: `PackOptions`, `PackResult`, `PackGltfResult`, `MetaJson`, `PackInput`, `WriteGltfResult`.

## Options (highlights)

- **KTX2 compression** — opt-in; compresses textures to Basis Universal for smaller `.glb`s
- **Preview geometry** — embed a `plane`, `sphere`, or `cube` so the `.glb` renders immediately in any viewer
- **Embed MtlxDocument** — store the source `MtlxDocument` in glTF extras for lossless round-trip back to MaterialX

## More

- Examples: [docs/examples.md](https://github.com/DennisSmolek/materialXJson/blob/main/docs/examples.md)
- Project overview: [repository README](https://github.com/DennisSmolek/materialXJson#readme)
