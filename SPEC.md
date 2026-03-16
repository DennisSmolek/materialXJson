# @materialxjs Ecosystem Spec

## Goal

Build a set of composable libraries and a CLI for ingesting PBR materials from any source (texture folders, zips, .mtlx files), normalizing them into a standard internal model, and outputting them as MaterialX XML, JSON, GLB, or Three.js TSL nodes.

The end-state CLI command:

```bash
materialxjs create Wood066_2K.zip --glb
# → Wood066_2K.glb + meta.json
```

---

## Sources & Formats

Materials come from diverse sources with different structures:

| Source | What you get | Has .mtlx? |
|--------|-------------|-------------|
| ambientCG | ZIP with textures + .mtlx | Yes (Standard Surface) |
| Polyhaven | ZIP with textures + .mtlx | Yes (Standard Surface) |
| FreePBR | Folder/ZIP of loose textures | No |
| Custom/game assets | Folder of textures, unpredictable names | No |

### Shading Models

- **Standard Surface** (`standard_surface`) — current standard, used by ambientCG/Polyhaven, supported by Three.js MaterialXLoader
- **OpenPBR Surface** (`open_pbr_surface`) — successor, introduced in MaterialX 1.39, default in Maya 2025.3+, not yet widely adopted by material libraries or Three.js
- **glTF PBR** (`gltf_pbr`) — simplified model matching glTF 2.0 core PBR

When ingesting from textures (no .mtlx), we generate **OpenPBR Surface** by default — it is the current MaterialX standard (1.39+) and maps well to Three.js `MeshPhysicalNodeMaterial` via our own TSL layer. The shading model is configurable via `--shader` for consumers that need Standard Surface or glTF PBR. When ingesting an existing .mtlx, we preserve whatever model it uses.

### Shading Model Compatibility Matrix

Downstream packages don't support all shading models equally. This matrix defines what each package can do:

| | `open_pbr_surface` | `standard_surface` | `gltf_pbr` |
|---|---|---|---|
| **@materialxjs/json** | Full | Full | Full |
| **@materialxjs/ingest** (generate) | Full (default) | Full | Full |
| **@materialxjs/ingest** (passthrough) | Full | Full | Full |
| **@materialxjs/gltf-pack** | Lossy (approximated to glTF PBR core) | Lossy (approximated to glTF PBR core) | Full |
| **@materialxjs/tsl** | Full (primary target, maps to MeshPhysicalNodeMaterial) | Full (compatibility path) | Full |

We do **not** use or depend on Three.js's built-in `MaterialXLoader`. Our `@materialxjs/tsl` package handles all shading model → TSL translation directly, giving us control over OpenPBR support and update cadence.

**Degradation policy:** When a downstream package encounters an unsupported or partially-supported shading model:
- **Full** — all inputs preserved and mapped correctly
- **Lossy** — best-effort approximation, emit warning listing which inputs were approximated or dropped
- **Partial** — core PBR inputs work, advanced inputs fall back to defaults with warning listing every dropped/defaulted input
- **Unsupported** — return error, do not silently produce broken output

---

## Package Architecture

```
ZIP / folder of textures              .mtlx from ambientCG/polyhaven
        │                                        │
        ▼                                        ▼
┌────────────────┐                        ┌──────────────┐
│ @materialxjs/   │                        │ @materialxjs/  │
│ texture-map     │── channel detection ──▶│ json          │ (exists)
│                 │                        │               │
└────────────────┘                        └──────┬────────┘
        │                                        │
        ▼                                        │
┌────────────────┐                               │
│ @materialxjs/   │◀── textures + mappings ──────┘
│ ingest          │── builds MtlxDocument
│                 │
└───────┬────────┘
        │ MtlxDocument + texture files
        ▼
┌────────────────┐
│ @materialxjs/   │──▶ .glb + meta.json
│ gltf-pack       │
└───────┬────────┘
        │
   KTX2 pipeline
   (external toktx)


┌────────────────┐
│ @materialxjs/   │   MtlxDocument (via glTF procedurals JSON)
│ tsl             │──▶ Three.js TSL node material (runtime)
└────────────────┘
```

### Package Summary

| Package | Purpose | I/O? | Browser-safe? |
|---------|---------|------|---------------|
| `@materialxjs/json` | XML ↔ JSON conversion (exists) | No (core), Yes (/node) | Core: yes |
| `@materialxjs/texture-map` | Filename → PBR channel detection | No | Yes |
| `@materialxjs/ingest` | Textures/zip/.mtlx → MtlxDocument | Yes (fs, zip) | No |
| `@materialxjs/gltf-pack` | MtlxDocument + textures → .glb | Yes | No |
| `@materialxjs/tsl` | glTF procedurals → Three.js TSL | No | Yes |
| `@materialxjs/cli` | CLI entry point for all commands (exists) | Yes | No |

---

## Package 1: @materialxjs/texture-map

Pure-logic library. No file I/O — operates on filename strings. Browser-safe.

### Problem

Texture filenames encode PBR channel info but with wildly inconsistent naming:

```
Wood066_2K-JPG_Color.jpg           → base_color
T_Rock_Roughness_4K.png            → specular_roughness
metal_arm_2k.jpg                   → ARM packed (AO + Roughness + Metalness)
brick_wall_nor_gl_1k.exr           → normal (OpenGL)
Fabric_Normal_DX.png               → normal (DirectX)
concrete_Displacement.png          → displacement
ground_ao.jpg                      → ambient_occlusion
leather_opacity.png                → opacity
env_emissive_hdr.exr               → emission
```

### Approach

**Token-based matching with ranked precedence.** Split filename by separators (`_`, `-`, `.`, case transitions), normalize to lowercase, match against a known dictionary of channel tokens.

Match precedence (highest to lowest):
1. **User override** — explicit `filename → channel` mapping, always wins
2. **Exact alias** — full token matches a known alias exactly (`"roughness"`, `"basecolor"`)
3. **Known vendor pattern** — recognized source-specific naming (ambientCG `_Color`, Polyhaven `_rough_`, FreePBR conventions)
4. **Fuzzy/partial** — substring or abbreviated match (`"rgh"`, `"nrm"`)

When multiple channels match at the same precedence level, the result is a conflict (not a silent pick).

```typescript
// Channel token dictionary (subset)
const CHANNEL_TOKENS: Record<PbrChannel, string[]> = {
  base_color:         ["color", "basecolor", "base_color", "diffuse", "diff", "albedo", "col"],
  specular_roughness: ["roughness", "rough", "rgh"],
  metalness:          ["metalness", "metallic", "metal", "met"],
  normal:             ["normal", "nor", "nrm", "norm", "nml"],
  displacement:       ["displacement", "disp", "height", "bump"],
  ambient_occlusion:  ["ao", "ambientocclusion", "occlusion", "occ"],
  opacity:            ["opacity", "alpha", "transparency"],
  emission:           ["emission", "emissive", "emit"],
};
```

**Variant detection** (post-channel-match):

| Variant | Tokens | Behavior |
|---------|--------|----------|
| Normal convention | `gl`, `opengl`, `dx`, `directx` | Default: assume GL. If only DX exists, flag for Y-flip |
| Packed textures | `arm`, `orm` | Keep packed — annotate which sub-channels are present |
| Resolution | `1k`, `2k`, `4k`, `8k` | Extract as metadata |

### Colorspace Rules

Colorspace is inferred from channel type **and** file format:

| Channel | Default colorspace | Exception |
|---------|-------------------|-----------|
| base_color | `srgb` | EXR/HDR files → `linear` (assumed linear-authored) |
| emission | `srgb` | EXR/HDR files → `linear` |
| All others (roughness, normal, AO, etc.) | `linear` | — |

Rationale: EXR and HDR formats are typically authored in linear space even for color data. JPEG/PNG color textures are almost always sRGB. This heuristic covers the common case. Users can override via the material model or custom tooling if needed.

### API

```typescript
type PbrChannel =
  | "base_color"
  | "specular_roughness"
  | "metalness"
  | "normal"
  | "displacement"
  | "ambient_occlusion"
  | "opacity"
  | "emission";

type NormalConvention = "gl" | "dx";

interface PackedChannels {
  r: PbrChannel;  // e.g. ambient_occlusion
  g: PbrChannel;  // e.g. specular_roughness
  b: PbrChannel;  // e.g. metalness
}

interface TextureMapping {
  file: string;                       // original filename
  channel: PbrChannel | "packed";     // detected channel
  packing?: PackedChannels;           // for ARM/ORM textures
  normalConvention?: NormalConvention; // for normal maps
  resolution?: string;                // "2K", "4K", etc.
  colorspace: "srgb" | "linear";     // inferred from channel + format
  confidence: "override" | "exact" | "vendor" | "fuzzy";  // match quality
}

interface TextureConflict {
  channel: PbrChannel;
  files: string[];
  reason: string;  // "multiple normal maps: GL and DX variants found"
}

interface MapResult {
  mapped: TextureMapping[];
  unmapped: string[];           // files that couldn't be identified
  conflicts: TextureConflict[]; // ambiguities for the caller to resolve
}

// Per-file override — channel is required, everything else is optional refinement
type TextureOverride = PbrChannel | {
  channel: PbrChannel | "packed";
  colorspace?: "srgb" | "linear";
  normalConvention?: NormalConvention;
  packing?: PackedChannels;
};

// Core function — operates on filenames only
function mapTextures(files: string[], overrides?: Record<string, TextureOverride>): MapResult;

// Single file helper
function detectChannel(filename: string): TextureMapping | null;
```

### Override Support

Optional `overrides` parameter: a map of `filename → channel` (or richer object) for edge cases. Applied before token matching — if a file matches an override, skip detection. Marked with `confidence: "override"`.

```typescript
// Simple: just the channel
const result = mapTextures(files, {
  "weird_texture_A.png": "base_color",
  "weird_texture_B.png": "normal",
});

// Rich: channel + colorspace/convention/packing overrides
const result = mapTextures(files, {
  "hdr_albedo.exr": { channel: "base_color", colorspace: "srgb" },  // override EXR→linear default
  "custom_packed.png": { channel: "packed", packing: { r: "ambient_occlusion", g: "specular_roughness", b: "metalness" } },
});
```

### Conflict Resolution Rules

1. **Normal maps:** Prefer GL. If both GL and DX exist, use GL, report DX in conflicts
2. **Duplicate channels:** If two files match the same channel (non-packed), report as conflict, pick the higher resolution one. If same resolution, pick higher confidence match
3. **Packed vs individual:** If ARM is found alongside separate roughness/metalness/AO, prefer the individual textures, report ARM in conflicts

**Invariant:** No channel is silently dropped. Every detected texture either appears in `mapped`, `unmapped`, or `conflicts`. The caller always knows what happened.

---

## Package 2: @materialxjs/ingest

Assembles materials from any source into a normalized `MtlxDocument`. Handles file I/O, zip extraction, and .mtlx parsing. Node.js only.

### Input Sources

| Input | Detection | Behavior |
|-------|-----------|----------|
| `.mtlx` file | Extension | Parse with `@materialxjs/json`, return as-is |
| `.zip` file | Extension | Extract to temp dir, then process as folder |
| Directory | `stat.isDirectory()` | Scan for textures, run through `texture-map` |
| Directory with `.mtlx` | `.mtlx` found inside | Parse the .mtlx, resolve texture paths |

### Zip Safety

Zip extraction enforces these constraints to prevent zip-slip and zip-bomb attacks:

- **Path traversal protection:** All extracted paths are resolved and verified to be within the target directory. Entries containing `..` or absolute paths are rejected
- **Size limit:** Total uncompressed size capped at 500 MB (configurable via `maxUncompressedSize`)
- **File count limit:** Max 1000 entries (configurable via `maxFileCount`)
- **Filename sanitization:** Strip leading `/`, reject entries with null bytes
- **Extraction target:** Always a fresh temp directory under `os.tmpdir()`. Caller owns cleanup — `IngestResult` includes a `cleanup()` function that removes the temp directory when the caller is done (after gltf-pack, etc.)

```typescript
interface ZipSafetyOptions {
  maxUncompressedSize?: number;  // bytes, default: 500 * 1024 * 1024 (500 MB)
  maxFileCount?: number;         // default: 1000
}
```

### API

```typescript
interface IngestOptions {
  shader?: "open_pbr_surface" | "standard_surface" | "gltf_pbr";  // default: "open_pbr_surface"
  overrides?: Record<string, TextureOverride>;  // passed to texture-map
  name?: string;                           // material name (default: inferred from input path)
  zip?: ZipSafetyOptions;                  // zip extraction limits
}

interface IngestResult {
  document: MtlxDocument;
  textures: TextureMapping[];   // what was detected/used
  textureDir: string;           // absolute path to folder containing textures
  warnings: string[];           // "DX normal found, only GL variant will be used", etc.
  cleanup: () => Promise<void>; // removes temp dir (zip sources). No-op for folder/file inputs.
                                // Caller MUST call in a finally block when source is zip to prevent temp dir leaks.
}

// Main entry point — accepts file, zip, or directory
function ingest(input: string, options?: IngestOptions): Promise<IngestResult>;
```

### Material Assembly (from textures)

When building from loose textures, the ingest step creates:

1. One `tiledimage` node per texture (with file path, colorspace, uvtiling)
2. One shader node (`standard_surface` by default) with inputs connected to the tiledimage nodes
3. One `surfacematerial` node connected to the shader

### Packed Texture Wiring

For packed textures (ARM/ORM), the handling differs per output target:

**In the MtlxDocument (ingest output):**
A single `tiledimage` node is created for the packed texture. Individual shader inputs reference it via `extract` nodes that select the appropriate channel:

```xml
<!-- ARM packed: R=AO, G=Roughness, B=Metalness -->
<tiledimage name="ARM_Tex" type="color3">
  <input name="file" type="filename" value="metal_arm_2k.jpg" />
</tiledimage>
<extract name="AO_Extract" type="float">
  <input name="in" type="color3" nodename="ARM_Tex" />
  <input name="index" type="integer" value="0" />  <!-- R channel -->
</extract>
<extract name="Roughness_Extract" type="float">
  <input name="in" type="color3" nodename="ARM_Tex" />
  <input name="index" type="integer" value="1" />  <!-- G channel -->
</extract>
<extract name="Metalness_Extract" type="float">
  <input name="in" type="color3" nodename="ARM_Tex" />
  <input name="index" type="integer" value="2" />  <!-- B channel -->
</extract>
```

**In glTF-pack (GLB output):**
glTF natively supports `occlusionRoughnessMetallic` packed textures. When the packing matches ORM order, the texture is used directly without extraction. When it doesn't match (e.g., ARM), the pack step re-maps channels.

**In TSL (Three.js output):**
The TSL package reads the extract nodes from the glTF procedurals and generates the equivalent TSL channel swizzles.

### Channel → Shader Input Mapping

| PbrChannel | OpenPBR input (default) | Standard Surface input | glTF PBR input |
|------------|------------------------|----------------------|----------------|
| base_color | `base_color` | `base_color` | `base_color` |
| specular_roughness | `specular_roughness` | `specular_roughness` | `roughness` |
| metalness | `metalness` | `metalness` | `metallic` |
| normal | `geometry_normal` | `normal` | `normal` |
| displacement | `geometry_displacement` | `displacement` | — |
| ambient_occlusion | `base` (multiplied) | `base` (multiplied) | `occlusion` |
| opacity | `geometry_opacity` | `opacity` | `alpha` |
| emission | `emission_color` | `emission_color` | `emissive` |

### Path Handling

All texture paths in generated MtlxDocuments use **relative paths only** — relative to the material file location or the `textureDir`. No absolute paths are ever written into outputs. The `fileprefix` attribute on the root `<materialx>` element is set to `"./"`.

---

## Package 3: @materialxjs/gltf-pack

Takes an `IngestResult` (MtlxDocument + texture files) and produces a .glb with an optional meta.json sidecar. Node.js only.

### API

```typescript
interface PackOptions {
  textures?: "embed" | "reference";   // default: "embed"
  compress?: {
    ktx2?: boolean;                   // run textures through KTX2 (default: false)
    resize?: number;                  // max texture dimension (default: no resize)
    quality?: number;                 // compression quality 1-100 (default: 75)
  };
  geometry?: "plane" | "sphere" | "cube" | "none";  // preview geo (default: "plane")
  meta?: Record<string, unknown>;     // extra fields for meta.json
  embedMaterialX?: boolean;           // store MtlxDocument in glTF extras (default: false)
}

interface PackResult {
  glb: Uint8Array;
  meta: MetaJson;
}

interface MetaJson {
  name: string;
  version: string;                    // @materialxjs/gltf-pack version
  shader: string;                     // "standard_surface", etc.
  textures: TextureMapping[];
  channels: PbrChannel[];             // which channels are present
  source?: string;                    // original input path
  [key: string]: unknown;             // user-provided meta fields
}

function packGlb(result: IngestResult, options?: PackOptions): Promise<PackResult>;

// Convenience: write .glb + meta.json to disk
function writePackage(
  result: IngestResult,
  outputPath: string,
  options?: PackOptions,
): Promise<{ glbPath: string; metaPath: string }>;
```

### KTX2 Pipeline

For KTX2 compression, shell out to external `toktx` (same approach as gltf-transform). The library checks for `toktx` on PATH and throws `E_TOOL_MISSING` with install instructions if missing. Colorspace-aware: sRGB textures get sRGB transfer function, linear textures get linear.

### GLB Structure

```
material.glb
├── scene
│   └── mesh (plane/sphere/cube with material applied)
├── material
│   └── KHR_materials_* extensions as needed
├── textures (embedded)
│   ├── base_color.ktx2
│   ├── normal.ktx2
│   └── ...
└── extras (opt-in via embedMaterialX)
    └── materialx (original MtlxDocument as JSON)
```

The `embedMaterialX` option (default: false) stores the full MtlxDocument in glTF `extras` for lossless round-trip back to .mtlx. This adds size overhead (typically 1-5 KB for the JSON) and may include texture path information. Opt-in only.

---

## Package 4: @materialxjs/tsl

Converts glTF KHR_texture_procedurals JSON into Three.js TSL (Three.js Shading Language) node materials. Browser-safe. This is the runtime renderer.

### Approach

We build our own shading model → TSL translation, independent of Three.js's `MaterialXLoader`. This gives us full OpenPBR support and control over the mapping.

The flow:

```
MtlxDocument
  → documentToGltf() (@materialxjs/json, already exists)
  → glTF procedurals JSON
  → @materialxjs/tsl
  → Three.js MeshPhysicalNodeMaterial
```

**Target material class:** `MeshPhysicalNodeMaterial` — it supports transmission, clearcoat, sheen, iridescence, and other properties that map to OpenPBR inputs. `MeshStandardNodeMaterial` is insufficient for OpenPBR's full input set.

**Shading model support:**
- **OpenPBR** — primary path, full mapping to Physical material properties
- **Standard Surface** — compatibility path, maps to the same Physical material (input names differ but the PBR concepts are the same)
- **glTF PBR** — direct 1:1 mapping to Physical material (this is what the material class was designed for)

### API (preliminary)

```typescript
import type { Material, Texture } from "three";
import type { GltfProceduralDocument } from "@materialxjs/json";

interface TslOptions {
  textureLoader?: (path: string) => Promise<Texture>;  // async texture loading
  colorManagement?: boolean;                            // default: true
}

// Async — texture loading is inherently async
async function proceduralToMaterial(
  procedural: GltfProceduralDocument,
  options?: TslOptions,
): Promise<Material>;
```

Detailed design deferred until implementation — needs hands-on study of Three.js MaterialXLoader internals and TSL node API.

---

## CLI Evolution

The CLI (`@materialxjs/cli`) becomes the unified entry point. The current auto-detect behavior remains as the default/convert path.

### Commands

```bash
# ── Convert (existing, default behavior) ───────────────────────
materialxjs material.mtlx                        # → material.json (auto)
materialxjs material.mtlx --gltf                 # → material.gltf.json
materialxjs material.json                        # → material.mtlx (auto)

# ── Create (new: ingest → material) ───────────────────────────
materialxjs create ./Wood066_2K/                  # folder → Wood066_2K.mtlx
materialxjs create ./Wood066_2K/ --json           # folder → Wood066_2K.json
materialxjs create Wood066_2K.zip --glb           # zip → Wood066_2K.glb + meta.json
materialxjs create Wood066_2K.zip --glb --ktx2    # zip → .glb with KTX2 textures
materialxjs create ./textures/ --shader standard_surface  # use Standard Surface instead of OpenPBR

# ── Inspect (new: debug/preview) ──────────────────────────────
materialxjs inspect ./Wood066_2K/                 # show detected texture channels
materialxjs inspect material.mtlx                 # show material structure (nodes, connections)
materialxjs inspect Wood066_2K.zip                # extract + detect + report

# ── Pack (new: existing material → GLB) ───────────────────────
materialxjs pack material.mtlx --ktx2             # .mtlx + textures → .glb
materialxjs pack material.mtlx -o dist/mat.glb    # custom output path
```

### CLI Safety & Behavior

| Flag | Behavior |
|------|----------|
| `--force` | Overwrite existing output files without prompting |
| `--dry-run` | Show what would be created/overwritten, but don't write anything |
| `--json-log` | Output structured JSON to stdout instead of human-readable text (for automation/workers) |

**Default behavior (no flags):**
- If output file exists, **prompt for confirmation** (interactive) or **error** (non-interactive / piped)
- Exit codes: `0` success, `1` error, `2` partial failure (batch: some files succeeded, some failed)
- Non-interactive detection: `!process.stdin.isTTY || !process.stdout.isTTY || !!process.env.CI`

### Inspect Output Example

```
$ materialxjs inspect ./Wood066_2K/

  Detected textures:
    base_color          Wood066_2K-JPG_Color.jpg        (srgb, 2K, exact)
    specular_roughness  Wood066_2K-JPG_Roughness.jpg    (linear, 2K, exact)
    normal              Wood066_2K-JPG_NormalGL.jpg      (linear, 2K, GL, exact)
    ambient_occlusion   Wood066_2K-JPG_AO.jpg           (linear, 2K, exact)
    displacement        Wood066_2K-JPG_Displacement.jpg (linear, 2K, exact)

  Unmapped:
    Wood066_2K-JPG_NormalDX.jpg  (skipped: DX normal, GL variant preferred)

  Conflicts: none

  Ready: materialxjs create ./Wood066_2K/
```

---

## Error Taxonomy

Structured error codes used across all packages. Each error includes a severity, code, message, and remediation hint.

| Code | Severity | Package | Description |
|------|----------|---------|-------------|
| `E_INPUT_NOT_FOUND` | fatal | ingest, cli | Input file/directory does not exist |
| `E_INPUT_UNSUPPORTED` | fatal | ingest | Input is not a recognized format (.mtlx, .zip, or directory) |
| `E_ZIP_UNSAFE` | fatal | ingest | Zip contains path traversal, exceeds size/count limits |
| `E_ZIP_EXTRACT_FAILED` | fatal | ingest | Zip extraction failed (corrupt archive, permissions) |
| `E_TEXTURE_CONFLICT` | warning | texture-map | Multiple textures detected for the same channel |
| `E_TEXTURE_UNMAPPED` | warning | texture-map | Texture file could not be mapped to any channel |
| `E_CHANNEL_DROPPED` | warning | ingest, gltf-pack | A detected channel has no mapping in the target shader model |
| `E_SHADER_UNSUPPORTED` | error | gltf-pack, tsl | Shading model not supported by the target output |
| `E_SHADER_LOSSY` | warning | gltf-pack, tsl | Shading model partially supported, some inputs approximated |
| `E_TOOL_MISSING` | fatal | gltf-pack | External tool (toktx) not found on PATH |
| `E_OUTPUT_EXISTS` | error | cli | Output file exists and `--force` not specified |
| `E_PARSE_FAILED` | fatal | json, ingest | XML/JSON parsing failed |

**Warning routing:** `MapResult` is self-contained — texture-level issues live in its three structured arrays (`mapped`, `unmapped`, `conflicts`), not in a separate warnings list. `IngestResult.warnings` is for higher-level pipeline messages (shader approximations, DX normal skipping, format decisions). The `E_TEXTURE_*` error codes are used when the CLI or logging layer surfaces `MapResult` issues to the user — they are not a separate channel from the arrays.

Errors and fatals throw typed error objects:

```typescript
class MaterialXError extends Error {
  code: string;       // "E_ZIP_UNSAFE"
  severity: "warning" | "error" | "fatal";
  hint?: string;      // "Install toktx: brew install KhronosGroup/KTX-Software/ktx"
}
```

---

## Invariants

Non-negotiable rules that all packages must uphold:

1. **No silent channel drops.** Every detected texture appears in `mapped`, `unmapped`, or `conflicts`. If a channel can't be wired to the target shader, emit `E_CHANNEL_DROPPED` warning
2. **Deterministic output.** Same input set → semantically identical output. Texture ordering in the MtlxDocument is sorted alphabetically by channel name. JSON keys are ordered deterministically. For text formats (XML, JSON), this means byte-identical output. For GLB, semantic equivalence (glTF-Validator passes, same textures/materials/nodes) — binary-identical bytes are not guaranteed due to writer internals
3. **Relative paths only.** No absolute filesystem paths in any output file (MtlxDocument, meta.json, GLB). All paths are relative to the material/texture directory
4. **No silent quality degradation.** If colorspace, shading model, or texture format causes lossy conversion, emit a warning. The user should be able to see every approximation made

---

## Implementation Order

| Phase | Package | Delivers |
|-------|---------|----------|
| 1 | `@materialxjs/texture-map` | Channel detection from filenames |
| 2 | `@materialxjs/ingest` | Folder/zip/mtlx → MtlxDocument |
| 3 | CLI `inspect` + `create` | Wire ingest into CLI (output: .mtlx, .json) |
| 4 | `@materialxjs/gltf-pack` | MtlxDocument + textures → .glb |
| 5 | CLI `pack` + `create --glb` | Wire gltf-pack into CLI, KTX2 pipeline |
| 6 | `@materialxjs/tsl` | glTF procedurals → Three.js TSL (independent, parallel-able) |

Phases 1-3 get us from "zip of textures" to usable .mtlx/.json files.
Phases 4-5 get us to .glb output.
Phase 6 is the browser runtime story.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default shader model | OpenPBR Surface | Current MaterialX standard (1.39+). Own TSL layer handles mapping to MeshPhysicalNodeMaterial. Standard Surface/glTF PBR available via `--shader` flag |
| Normal map convention | Assume GL | glTF standard. DX normals flagged, not auto-converted |
| Packed textures (ARM/ORM) | Keep packed, wire via extract nodes | Preserves original texture. Extract nodes give per-target flexibility |
| Colorspace inference | Channel + file format | EXR/HDR always linear, JPEG/PNG color channels sRGB, data channels linear |
| KTX2 tooling | External `toktx` | Same approach as gltf-transform. Avoids bundling native code |
| TSL input format | glTF procedurals JSON | Closer to Three.js node material mental model (flat graph, typed values, index refs) |
| TSL implementation | Own layer, not Three.js MaterialXLoader | Full OpenPBR support, independent update cadence, MeshPhysicalNodeMaterial target |
| TSL API | Async | Texture loading is inherently async; sync API would force awkward workarounds |
| Package boundaries | Separate packages | `texture-map` is browser-safe and reusable without I/O. `ingest` handles the fs/zip layer |
| Override support | Optional `overrides` map | Filename → channel for edge cases. Applied before auto-detection |
| GLB extras (MtlxDocument) | Opt-in (`embedMaterialX: false` default) | Useful for lossless round-trip but adds size and may leak path info |
| Output overwrite | Prompt (TTY) or error (non-TTY) by default | Safe default for CLI; `--force` for scripts/automation |
| Channel match ranking | override > exact > vendor > fuzzy | Deterministic resolution, no ambiguous silent picks |

---

## Dependencies (anticipated)

| Package | Key dependencies |
|---------|-----------------|
| `@materialxjs/texture-map` | None (pure logic) |
| `@materialxjs/ingest` | `@materialxjs/json`, `@materialxjs/texture-map`, `fflate` (zip extraction — small, fast, no native deps) |
| `@materialxjs/gltf-pack` | `@materialxjs/json`, `@gltf-transform/core` + `@gltf-transform/extensions` |
| `@materialxjs/tsl` | `@materialxjs/json`, `three` (peer dependency) |
| `@materialxjs/cli` | All of the above, `citty`, `consola` |

---

## Test Corpus

Real-world fixture sets required before each package ships:

### @materialxjs/texture-map (Phase 1)
- 5+ ambientCG texture sets (known naming: `_Color`, `_Roughness`, `_NormalGL`, etc.)
- 5+ Polyhaven texture sets (known naming: `_diff_`, `_rough_`, `_nor_gl_`, etc.)
- 3+ FreePBR / messy custom sets (inconsistent separators, abbreviations)
- 2+ sets with ARM/ORM packed textures
- 2+ sets with both DX and GL normals
- 1+ set with EXR/HDR textures (colorspace edge case)
- Golden tests: exact expected `MapResult` output for each fixture

### @materialxjs/ingest (Phase 2)
- All texture-map fixtures, run through full ingest pipeline
- 3+ ambientCG zips (with .mtlx inside)
- 1+ malicious zip fixtures (path traversal, oversized, too many files)
- Golden tests: expected MtlxDocument structure for each fixture

### @materialxjs/gltf-pack (Phase 4)
- Generated GLBs validated against glTF-Validator
- Visual parity spot-checks for 3-5 materials (manual, not automated)

### @materialxjs/tsl (Phase 6)
- Deferred — depends on Three.js MaterialXLoader study

---

## Open Questions

- **AO handling:** Standard Surface doesn't have a direct AO input. The common approach is to multiply AO into `base` or use a separate `multiply` node. Need to study what ambientCG .mtlx files do and match that pattern.
- **Displacement vs normal:** Some material sets have both. Current plan: include both in the generated material. Normal maps are used for real-time shading; displacement is metadata for offline renderers. glTF-pack can skip displacement since glTF doesn't support it natively.
- **gltf-transform version:** Need to evaluate whether gltf-transform's API is stable enough, or if we should write minimal glTF binary serialization. Leaning toward gltf-transform — it's well-maintained and handles KTX2 integration.
- **Three.js MaterialXLoader:** Need to study its source to decide how much of the TSL package can reuse vs rewrite. It may already handle most of the Standard Surface → node material mapping.
