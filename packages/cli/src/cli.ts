#!/usr/bin/env node
/**
 * @materialxjs/cli
 *
 * Unified CLI for MaterialX material management: convert between formats,
 * inspect material sources, create materials, and pack into GLB.
 *
 * @example
 * ```bash
 * # Convert between formats (default command)
 * materialxjs material.mtlx                    # → material.json
 * materialxjs material.mtlx --gltf             # → material.gltf.json
 *
 * # Inspect a material source
 * materialxjs inspect ./Wood066_2K/
 *
 * # Create a material from textures
 * materialxjs create ./Wood066_2K/             # → Wood066_2K.mtlx
 * materialxjs create Wood066_2K.zip --glb      # → Wood066_2K.glb + meta.json
 *
 * # Pack an existing material into GLB
 * materialxjs pack material.mtlx               # → material.glb + meta.json
 * ```
 */
import { defineCommand, runMain } from "citty";
import { convert } from "./commands/convert.js";
import { inspect } from "./commands/inspect.js";
import { create } from "./commands/create.js";
import { pack } from "./commands/pack.js";

const main = defineCommand({
  meta: {
    name: "materialxjs",
    version: "0.1.0",
    description:
      "Convert, inspect, and create MaterialX materials from any source",
  },
  subCommands: {
    convert,
    inspect,
    create,
    pack,
  },
});

runMain(main);
