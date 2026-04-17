# @materialxjs/cli

The `materialxjs` CLI — convert, inspect, create, and pack MaterialX materials from any source (texture folder, `.mtlx`, or `.zip`).

## Install

```bash
# Global
npm install -g @materialxjs/cli

# Or run without installing
npx @materialxjs/cli --help
```

## Commands

| Command | Purpose |
|---------|---------|
| `convert` | Convert between MaterialX XML, materialxjson, and glTF outputs |
| `inspect` | Report detected channels and structure for a material source |
| `create`  | Build a MaterialX material from textures, `.mtlx`, or `.zip` |
| `pack`    | Pack a material source into `.glb` + `meta.json` |

## Examples

```bash
# Convert — auto-detects from extension
materialxjs convert material.mtlx            # → material.json (materialxjson)
materialxjs convert material.json            # → material.mtlx
materialxjs convert material.mtlx --gltf     # → material.gltf + resources
materialxjs convert material.mtlx --gltf --procedural
                                             # → embed KHR_texture_procedurals
materialxjs convert ./materials/             # batch convert a directory

# Inspect a texture folder, .mtlx, or .zip
materialxjs inspect ./Wood066_2K/

# Create a material from loose textures or an archive
materialxjs create ./Wood066_2K/             # → Wood066_2K.mtlx
materialxjs create Wood066_2K.zip --glb      # → Wood066_2K.glb + meta.json

# Pack an existing material into GLB
materialxjs pack material.mtlx               # → material.glb + meta.json
```

### Convert format flags

| Flag | Output |
|------|--------|
| `--mtlx` | MaterialX XML |
| `--json` | materialxjson |
| `--gltf` | Standard glTF asset (`.gltf`) |
| `--json --procedural` | Standalone KHR_texture_procedurals JSON |
| `--gltf --procedural` | glTF asset with embedded `KHR_texture_procedurals` |
| `--indent <n>` | JSON indentation (default: 2) |
| `--force` | Overwrite existing output without prompting |
| `--dry-run` | Preview without writing |

Priority when resolving output format: explicit flag > `-o` extension > default.

## More

- Full CLI reference: [docs/cli.md](https://github.com/DennisSmolek/materialXJson/blob/main/docs/cli.md)
- Project overview: [repository README](https://github.com/DennisSmolek/materialXJson#readme)
