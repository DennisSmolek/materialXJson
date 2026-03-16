# CLI Reference

The `materialx-json` CLI converts between MaterialX XML and JSON formats from the command line.

## Installation

```bash
# Use directly with npx (no install needed)
npx materialx-json --help

# Or install globally
npm install -g materialx-json
materialx-json --help

# Or as a project dependency
npm install materialx-json
npx materialx-json --help
```

## Commands

### `m2j` — MaterialX XML to materialxjson

Convert `.mtlx` files to the materialxjson JSON format (lossless).

```bash
# Single file
npx materialx-json m2j material.mtlx -o material.json

# Output to different directory
npx materialx-json m2j material.mtlx -o ./output/

# Batch convert all .mtlx files in a directory
npx materialx-json m2j ./materials/ -o ./output/

# Custom indentation
npx materialx-json m2j material.mtlx -o material.json --indent 4

# Default output (same name with .json extension in current directory)
npx materialx-json m2j material.mtlx
```

### `j2m` — materialxjson to MaterialX XML

Convert materialxjson `.json` files back to `.mtlx` XML.

```bash
# Single file
npx materialx-json j2m material.json -o material.mtlx

# Batch convert
npx materialx-json j2m ./json-files/ -o ./output/
```

### `m2g` — MaterialX XML to glTF KHR_texture_procedurals

Convert `.mtlx` files to the glTF procedural texture JSON format.

```bash
# Single file (outputs .gltf.json)
npx materialx-json m2g material.mtlx -o material.gltf.json

# Batch convert
npx materialx-json m2g ./materials/ -o ./output/
```

### `g2m` — glTF KHR_texture_procedurals to MaterialX XML

Convert glTF procedural JSON files back to `.mtlx` XML.

```bash
# Single file
npx materialx-json g2m material.gltf.json -o material.mtlx
```

## Options

| Option | Short | Commands | Description | Default |
|--------|-------|----------|-------------|---------|
| `--output <path>` | `-o` | all | Output file or directory | Current directory, same base name |
| `--indent <n>` | | m2j, m2g | JSON indentation spaces | `2` |
| `--version` | `-V` | (global) | Show version number | |
| `--help` | `-h` | (global) | Show help | |

## Output Naming

When no `-o` flag is given, files are written to the current directory with the input base name and appropriate extension:

| Command | Input | Default Output |
|---------|-------|---------------|
| `m2j` | `path/to/Wood052.mtlx` | `./Wood052.json` |
| `j2m` | `path/to/Wood052.json` | `./Wood052.mtlx` |
| `m2g` | `path/to/Wood052.mtlx` | `./Wood052.gltf.json` |
| `g2m` | `path/to/Wood052.gltf.json` | `./Wood052.mtlx` |

When `-o` points to a directory (ending with `/`), the file is placed inside that directory with the default name.

## Examples

### Convert the sample materials

```bash
# Convert all three sample materials to materialxjson
npx materialx-json m2j materials/Onyx006_2K-JPG/Onyx006_2K-JPG.mtlx -o output/
npx materialx-json m2j materials/Wood052_2K-JPG/Wood052_2K-JPG.mtlx -o output/
npx materialx-json m2j materials/Wood066_2K-JPG/Wood066_2K-JPG.mtlx -o output/

# Convert to glTF procedural format
npx materialx-json m2g materials/Onyx006_2K-JPG/Onyx006_2K-JPG.mtlx -o output/

# Round-trip: XML -> JSON -> XML
npx materialx-json m2j material.mtlx -o temp.json
npx materialx-json j2m temp.json -o roundtripped.mtlx
```

### Use with development server (tsx)

During development, you can use `tsx` to run the CLI directly from source:

```bash
npx tsx src/cli.ts m2j material.mtlx -o output.json
```
