# @materialxjs/texture-map

Detect PBR material channels from texture filenames. Pure logic — no file I/O, no dependencies, browser-safe.

## Usage

```typescript
import { detectChannel, mapTextures } from "@materialxjs/texture-map";

// Single file
const result = detectChannel("Wood066_2K-JPG_Color.jpg");
// { channel: "base_color", colorspace: "srgb", confidence: "exact", resolution: "2K" }

// Batch with conflict resolution
const batch = mapTextures([
  "Wood066_2K-JPG_Color.jpg",
  "Wood066_2K-JPG_Roughness.jpg",
  "Wood066_2K-JPG_NormalGL.jpg",
  "Wood066_2K-JPG_NormalDX.jpg",
]);
// batch.mapped: [Color→base_color, Roughness→specular_roughness, NormalGL→normal]
// batch.conflicts: [{ channel: "normal", reason: "GL and DX variants found" }]
```

## Supported Channels

| Channel | Recognized tokens |
|---------|------------------|
| `base_color` | color, basecolor, diffuse, diff, albedo, col |
| `specular_roughness` | roughness, rough, rgh |
| `metalness` | metalness, metallic, metal, met |
| `normal` | normal, nor, nrm, norm, nml |
| `displacement` | displacement, disp, height, bump |
| `ambient_occlusion` | ao, ambientocclusion, occlusion, occ |
| `opacity` | opacity, alpha, transparency |
| `emission` | emission, emissive, emit |

Packed textures (`arm`, `orm`) are detected as `channel: "packed"` with per-RGB-channel metadata.

## Overrides

```typescript
// Simple: filename → channel
mapTextures(files, { "weird_tex.png": "base_color" });

// Rich: with colorspace/convention/packing
mapTextures(files, {
  "hdr_albedo.exr": { channel: "base_color", colorspace: "srgb" },
});
```

## Conflict Resolution

1. **Normal maps:** GL preferred over DX
2. **Duplicates:** Higher confidence wins, then higher resolution
3. **Packed vs individual:** Individual textures preferred when channels overlap

## Colorspace Rules

- `base_color` and `emission` → `srgb` (except EXR/HDR → `linear`)
- All other channels → `linear` regardless of format

## Architecture

```
src/
├── index.ts     — Public API exports
├── types.ts     — TypeScript interfaces (PbrChannel, TextureMapping, MapResult, etc.)
├── tokens.ts    — Channel token dictionary, resolution tokens, format rules
├── detect.ts    — detectChannel() + tokenizer + single-file detection
└── map.ts       — mapTextures() + conflict resolution + override handling
```
