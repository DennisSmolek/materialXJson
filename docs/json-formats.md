# JSON Format Guide

This library supports two distinct JSON representations of MaterialX documents. Both formats are fully bidirectional — you can convert to and from either format.

## Format Comparison

| Feature | materialxjson | glTF KHR_texture_procedurals |
|---------|--------------|-------------------------------|
| **Purpose** | Lossless XML round-trip | Khronos standards interop |
| **Connections** | Name-based (`nodename`) | Index-based (`node: 0`) |
| **Inputs/Outputs** | Arrays | Objects (keyed by name) |
| **Values** | Always strings | Typed (numbers, arrays) |
| **Structure** | Tree (mirrors XML) | Flat node arrays in nodegraphs |
| **UI Metadata** | Preserved (xpos, ypos) | Lost by default |
| **Nesting** | Supports deep nesting | No nesting (flat) |
| **MIME Type** | `application/mtlx+json` | — |

## When to Use Which

**Use materialxjson when:**
- You need lossless round-trip with XML
- You're building a material editor and need to preserve all metadata
- You're storing materials in a database or API
- You need compatibility with the Python [materialxjson](https://github.com/kwokcb/materialxjson) library

**Use glTF KHR_texture_procedurals when:**
- You're integrating with glTF viewers or engines (Three.js, Babylon.js, etc.)
- You need to embed procedural textures in .gltf files
- You're following the [Khronos extension spec](https://github.com/KhronosGroup/glTF/tree/KHR_texture_procedurals/extensions/2.0/Khronos/KHR_texture_procedurals)
- You want typed values (numbers/arrays instead of strings)

---

## materialxjson Format

### Structure

```
{
  mimetype            -> "application/mtlx+json" (always this value)
  materialx           -> root document object
    version           -> MaterialX version (e.g. "1.39")
    fileprefix        -> optional file prefix
    colorspace        -> optional default colorspace
    children[]        -> array of top-level elements
      name            -> element name
      category        -> XML tag name ("surfacematerial", "tiledimage", etc.)
      type            -> output type ("material", "color3", etc.)
      xpos, ypos      -> UI position metadata (if present)
      inputs[]        -> array of input ports
        name          -> input name
        type          -> data type
        value         -> literal value (string)
        nodename      -> connection target (name of another element)
        colorspace    -> colorspace override
      outputs[]       -> array of output ports
      children[]      -> nested child elements (for nodegraphs)
}
```

### Complete Example

Given this MaterialX XML:

```xml
<?xml version="1.0"?>
<materialx version="1.39" fileprefix="./">
  <open_pbr_surface name="PBR" type="surfaceshader" xpos="6.0" ypos="-2.0">
    <input name="base_color" type="color3" nodename="ColorTex" />
    <input name="specular_roughness" type="float" value="0.4" />
  </open_pbr_surface>
  <tiledimage name="ColorTex" type="color3" xpos="3.0" ypos="-3.0">
    <input name="file" type="filename" value="color.jpg" colorspace="srgb_texture" />
    <input name="uvtiling" type="vector2" value="1.0, 1.0" />
  </tiledimage>
  <surfacematerial name="Mat" type="material" xpos="8.0" ypos="0.0">
    <input name="surfaceshader" type="surfaceshader" nodename="PBR" />
  </surfacematerial>
</materialx>
```

The materialxjson output is:

```json
{
  "mimetype": "application/mtlx+json",
  "materialx": {
    "version": "1.39",
    "fileprefix": "./",
    "children": [
      {
        "name": "PBR",
        "category": "open_pbr_surface",
        "type": "surfaceshader",
        "xpos": "6.0",
        "ypos": "-2.0",
        "inputs": [
          {
            "name": "base_color",
            "type": "color3",
            "nodename": "ColorTex"
          },
          {
            "name": "specular_roughness",
            "type": "float",
            "value": "0.4"
          }
        ]
      },
      {
        "name": "ColorTex",
        "category": "tiledimage",
        "type": "color3",
        "xpos": "3.0",
        "ypos": "-3.0",
        "inputs": [
          {
            "name": "file",
            "type": "filename",
            "value": "color.jpg",
            "colorspace": "srgb_texture"
          },
          {
            "name": "uvtiling",
            "type": "vector2",
            "value": "1.0, 1.0"
          }
        ]
      },
      {
        "name": "Mat",
        "category": "surfacematerial",
        "type": "material",
        "xpos": "8.0",
        "ypos": "0.0",
        "inputs": [
          {
            "name": "surfaceshader",
            "type": "surfaceshader",
            "nodename": "PBR"
          }
        ]
      }
    ]
  }
}
```

### Key Design Decisions

1. **All values are strings** — matching how XML attributes store values. This ensures perfect round-trip fidelity: `"0.4"` stays `"0.4"`, never becomes `0.4` or `0.40000000000000002`.

2. **Inputs use `nodename` for connections** — `nodename: "ColorTex"` means "this input is connected to the node named ColorTex". When `value` is present instead, it's a literal/constant.

3. **Empty arrays are omitted** — if an element has no inputs, the `inputs` key is absent (not an empty `[]`).

4. **All XML attributes are preserved** — `xpos`, `ypos`, `colorspace`, and any custom attributes appear as top-level keys on the element.

---

## glTF KHR_texture_procedurals Format

### Structure

```
{
  procedurals[]             -> array of procedural graphs
    nodetype                -> always "nodegraph"
    type                    -> output type or "multioutput"
    name                    -> optional graph name
    inputs {}               -> object of graph-level inputs (keyed by name)
      <name>
        nodetype            -> "input"
        type                -> data type
        value               -> typed value (number, array, string)
    outputs {}              -> object of graph-level outputs (keyed by name)
      <name>
        nodetype            -> "output"
        type                -> data type
        node                -> index of upstream node in nodes[]
        output              -> output port name
    nodes[]                 -> flat array of processing nodes
      nodetype              -> MaterialX node type ("tiledimage", "mix", etc.)
      type                  -> output data type
      name                  -> optional node name
      inputs {}             -> object of node inputs (keyed by name)
        <name>
          type              -> data type
          value             -> literal value (typed)
          node              -> index of upstream node in nodes[]
          input             -> reference to a graph-level input
          output            -> output port name on referenced node
}
```

### Complete Example

The same MaterialX XML from above converts to:

```json
{
  "procedurals": [
    {
      "nodetype": "nodegraph",
      "type": "material",
      "nodes": [
        {
          "nodetype": "open_pbr_surface",
          "type": "surfaceshader",
          "name": "PBR",
          "inputs": {
            "base_color": {
              "type": "color3",
              "node": 1
            },
            "specular_roughness": {
              "type": "float",
              "value": 0.4
            }
          }
        },
        {
          "nodetype": "tiledimage",
          "type": "color3",
          "name": "ColorTex",
          "inputs": {
            "file": {
              "type": "filename",
              "value": "color.jpg"
            },
            "uvtiling": {
              "type": "vector2",
              "value": [1, 1]
            }
          }
        },
        {
          "nodetype": "surfacematerial",
          "type": "material",
          "name": "Mat",
          "inputs": {
            "surfaceshader": {
              "type": "surfaceshader",
              "node": 0
            }
          }
        }
      ]
    }
  ]
}
```

### Key Design Decisions

1. **Index-based references** — `"node": 1` means "connected to `nodes[1]`". This is efficient for GPU processing but means node order matters.

2. **Typed values** — float values are JSON numbers (`0.4`), vector values are arrays (`[1, 1]`), strings remain strings (`"color.jpg"`). This makes the data directly usable without parsing.

3. **Three connection types:**
   - `"node": <index>` — connect to another node's output
   - `"input": "<name>"` — connect to a graph-level input
   - `"value": <typed>` — literal/constant value

4. **Inputs/outputs are objects, not arrays** — keyed by port name. `inputs.base_color` instead of `inputs[0]`.

5. **Everything must be in a nodegraph** — loose nodes are automatically wrapped into a synthetic nodegraph during conversion.

6. **UI metadata is dropped** — `xpos`, `ypos` and similar attributes are not preserved by default (the `includeUiMetadata` option may be used in the future).

---

## Conversion Notes

### materialxjson -> glTF (what changes)

| materialxjson | glTF |
|--------------|------|
| `"nodename": "ColorTex"` | `"node": 1` (index of ColorTex in nodes array) |
| `"value": "0.4"` | `"value": 0.4` (parsed to number) |
| `"value": "1.0, 1.0"` | `"value": [1, 1]` (parsed to array) |
| `"xpos": "6.0"` | (dropped) |
| Top-level elements | Wrapped in nodegraph procedural |
| `inputs: [...]` array | `inputs: {...}` object keyed by name |

### glTF -> materialxjson (what changes)

| glTF | materialxjson |
|------|--------------|
| `"node": 1` | `"nodename": "ColorTex"` (resolved from index) |
| `"value": 0.4` | `"value": "0.4"` (stringified) |
| `"value": [1, 1]` | `"value": "1, 1"` (joined to string) |
| Procedural graph | Becomes a `<nodegraph>` element |
| `inputs: {...}` object | `inputs: [...]` array |
