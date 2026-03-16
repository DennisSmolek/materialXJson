# CLI Reference

The `materialxjs` CLI auto-detects input and output formats from file extensions — no subcommands needed.

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
materialxjs <input> [options]
```

The CLI figures out what you want based on context:

| Input | Default output | Why |
|-------|---------------|-----|
| `material.mtlx` | `material.json` | XML in → materialxjson out |
| `material.json` | `material.mtlx` | JSON in → XML out |
| `material.gltf.json` | `material.mtlx` | glTF in → XML out |

## Examples

```bash
# XML → materialxjson (auto)
materialxjs material.mtlx
# → material.json

# JSON → XML (auto)
materialxjs material.json
# → material.mtlx

# XML → glTF procedurals (flag)
materialxjs material.mtlx --gltf
# → material.gltf.json

# XML → glTF procedurals (inferred from -o extension)
materialxjs material.mtlx -o material.gltf.json
# → material.gltf.json

# JSON → glTF (flag)
materialxjs material.json --gltf
# → material.gltf.json

# Custom output path
materialxjs material.mtlx -o build/out.json

# glTF → XML (auto-detected from .gltf.json extension)
materialxjs material.gltf.json
# → material.mtlx

# Batch convert a directory
materialxjs ./materials/
```

## Format Flags

Use these when auto-detection isn't enough (e.g., JSON→glTF instead of JSON→XML):

| Flag | Output format |
|------|--------------|
| `--mtlx` | MaterialX XML (`.mtlx`) |
| `--json` | materialxjson (`.json`) |
| `--gltf` | glTF KHR_texture_procedurals (`.gltf.json`) |

**Priority order:** explicit flag > `-o` extension > default based on input format.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output file or directory | Current dir, same base name |
| `--indent <n>` | JSON indentation spaces | `2` |
| `-V, --version` | Show version | |
| `-h, --help` | Show help | |

## Auto-Detection Logic

**Input format** is detected from the file extension:
- `.mtlx` → MaterialX XML
- `.gltf.json` → glTF KHR_texture_procedurals
- `.json` → auto-detected from content (`mimetype` key → materialxjson, `procedurals` key → glTF)

**Output format** is resolved in this order:
1. Explicit flag (`--mtlx`, `--json`, `--gltf`)
2. Extension of `-o` path (`.mtlx`, `.json`, `.gltf.json`, `.gltf`)
3. Default: opposite of input (XML↔JSON, glTF→XML)
