# CLI Reference

The `materialxjs` CLI uses explicit subcommands. Format auto-detection still applies within the `convert` command.

## Installation

```bash
# Use directly with npx (no install needed)
npx materialxjs --help

# Or install globally
npm install -g @materialxjs/cli

# Or as a project dependency
npm install @materialxjs/cli
```

## Usage

```bash
materialxjs <command> [args] [options]
```

## Commands

| Command | Purpose |
|---------|---------|
| `convert` | Convert between MaterialX XML, materialxjson, procedural JSON, and standard glTF assets |
| `inspect` | Inspect a texture folder, `.mtlx`, or `.zip` source |
| `create` | Create a MaterialX material from textures, `.mtlx`, or `.zip` |
| `pack` | Pack a material source into `.glb` + `.meta.json` |

## Convert Usage

```bash
materialxjs convert <input> [options]
```

The `convert` command figures out the output format based on context:

| Input | Default output | Why |
|-------|---------------|-----|
| `material.mtlx` | `material.json` | XML in → materialxjson out |
| `material.json` | `material.mtlx` | JSON in → XML out |
| `material.gltf.json` | `material.mtlx` | Procedural JSON in → XML out |

## Examples

```bash
# XML → materialxjson (auto)
materialxjs convert material.mtlx
# → material.json

# JSON → XML (auto)
materialxjs convert material.json
# → material.mtlx

# XML → standard glTF asset
materialxjs convert material.mtlx --gltf
# → material.gltf + resources

# XML → standard glTF asset with procedural extension embedded
materialxjs convert material.mtlx --gltf --procedural
# → material.gltf + KHR_texture_procedurals

# XML → standalone procedural JSON payload
materialxjs convert material.mtlx --json --procedural
# → material.gltf.json

# Custom output path
materialxjs convert material.mtlx -o build/out.json

# glTF → XML (auto-detected from .gltf.json extension)
materialxjs convert material.gltf.json
# → material.mtlx

# Batch convert a directory
materialxjs convert ./materials/
```

## Other Command Examples

```bash
# Inspect a source before creating a material
materialxjs inspect ./Wood066_2K/

# Create a MaterialX document from textures
materialxjs create ./Wood066_2K/

# Create a standard glTF asset from textures
materialxjs create ./Wood066_2K/ --gltf

# Keep procedural JSON explicit when creating
materialxjs create ./Wood066_2K/ --json --procedural

# Pack a source into .glb + .meta.json
materialxjs pack ./Wood066_2K/
```

## Format Flags

Use these when auto-detection isn't enough:

| Flag | Output format |
|------|--------------|
| `--mtlx` | MaterialX XML (`.mtlx`) |
| `--json` | materialxjson (`.json`) |
| `--gltf` | Standard glTF asset (`.gltf`) |
| `--json --procedural` | Standalone KHR_texture_procedurals payload (`.gltf.json`) |
| `--gltf --procedural` | Standard glTF asset with embedded `KHR_texture_procedurals` |

**Priority order:** explicit flag > `-o` extension > default based on input format.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output file or directory | Current dir, same base name |
| `--indent <n>` | JSON indentation spaces | `2` |
| `--procedural` | Switch `--json` or `--gltf` into procedural mode | `false` |
| `-V, --version` | Show version | |
| `-h, --help` | Show help | |

## Auto-Detection Logic

**Input format** is detected from the file extension:
- `.mtlx` → MaterialX XML
- `.gltf.json` → glTF KHR_texture_procedurals
- `.gltf` → standard glTF asset output path
- `.json` → auto-detected from content (`mimetype` key → materialxjson, `procedurals` key → glTF)

**Output format** is resolved in this order:
1. Explicit flag (`--mtlx`, `--json`, `--gltf`)
2. Procedural modifier (`--json --procedural` or `--gltf --procedural`)
3. Extension of `-o` path (`.mtlx`, `.json`, `.gltf.json`, `.gltf`)
4. Default: opposite of input (XML↔JSON, glTF→XML)
