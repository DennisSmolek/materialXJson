import { defineCommand } from "citty";
import { consola } from "consola";
import { basename } from "node:path";
import { ingest, MaterialXError } from "@materialxjs/ingest";
import type { ShaderModel } from "@materialxjs/ingest";
import { writePackage } from "@materialxjs/gltf-pack";
import { resolveOutputSafely } from "../util/output.js";

/**
 * Pack an existing material source (.mtlx, folder, or zip) into a .glb + meta.json.
 *
 * This is a convenience command that combines `ingest` → `gltf-pack` in one step.
 * For more control over the intermediate MaterialX document, use `create` first
 * then pipe to gltf-pack programmatically.
 *
 * @example
 * ```bash
 * materialxjs pack ./Wood066_2K/                    # → Wood066_2K.glb + .meta.json
 * materialxjs pack material.mtlx                    # → material.glb + .meta.json
 * materialxjs pack material.mtlx -o dist/mat.glb    # custom output path
 * materialxjs pack Wood066_2K.zip --geometry sphere  # sphere preview mesh
 * materialxjs pack ./textures/ --embed-mtlx          # embed MtlxDocument in extras
 * ```
 */
export const pack = defineCommand({
  meta: {
    name: "pack",
    description: "Pack a material source into a .glb + meta.json",
  },
  args: {
    input: {
      type: "positional",
      description: "Path to texture folder, .mtlx file, or .zip archive",
      required: true,
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output .glb file path",
    },
    shader: {
      type: "string",
      description:
        "Shading model (open_pbr_surface, standard_surface, gltf_pbr)",
      default: "open_pbr_surface",
    },
    name: {
      type: "string",
      description: "Material name (default: inferred from input path)",
    },
    geometry: {
      type: "string",
      description: "Preview geometry (plane, sphere, cube, none)",
      default: "plane",
    },
    "embed-mtlx": {
      type: "boolean",
      description: "Embed MtlxDocument in GLB extras for lossless round-trip",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing output files without prompting",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be created, but don't write anything",
      default: false,
    },
  },
  async run({ args }) {
    const shader = args.shader as ShaderModel;

    // Ingest the material source
    let result;
    try {
      result = await ingest(args.input, {
        shader,
        name: args.name,
      });
    } catch (err) {
      if (err instanceof MaterialXError) {
        consola.error(`${err.code}: ${err.message}`);
        if (err.hint) consola.info(`Hint: ${err.hint}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    try {
      // Print warnings
      for (const w of result.warnings) {
        consola.warn(w);
      }

      // Resolve output path
      const glbPath = resolvePackOutputPath(args.input, args.output);

      if (args["dry-run"]) {
        const metaPath = glbPath.replace(/\.glb$/, ".meta.json");
        console.log(`[dry-run] Would create: ${glbPath}`);
        console.log(`[dry-run] Would create: ${metaPath}`);
        console.log(`  Textures: ${result.textures.length}`);
        console.log(`  Nodes: ${result.document.children.length}`);
        console.log(`  Warnings: ${result.warnings.length}`);
        return;
      }

      const safe = await resolveOutputSafely(glbPath, args.force);
      if (!safe) {
        process.exitCode = 1;
        return;
      }

      const geometry = args.geometry as "plane" | "sphere" | "cube" | "none";
      const { glbPath: writtenGlb, metaPath: writtenMeta } = await writePackage(
        result,
        glbPath,
        {
          geometry,
          embedMaterialX: args["embed-mtlx"],
        },
      );

      consola.success(`Created ${writtenGlb}`);
      consola.success(`Created ${writtenMeta}`);
      consola.info(
        `  ${result.textures.length} textures, ${result.document.children.length} nodes`,
      );
    } finally {
      await result.cleanup();
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the output path for the pack command.
 * Infers filename from the input path, always produces .glb extension.
 */
function resolvePackOutputPath(
  input: string,
  output: string | undefined,
): string {
  if (output) {
    return output.endsWith(".glb") ? output : `${output}.glb`;
  }

  // Derive base name from input, stripping extensions
  let base = basename(input);
  for (const strip of [".zip", ".mtlx"]) {
    if (base.endsWith(strip)) {
      base = base.slice(0, -strip.length);
      break;
    }
  }
  base = base.replace(/[/\\.]$/g, "") || base;

  return `./${base}.glb`;
}
