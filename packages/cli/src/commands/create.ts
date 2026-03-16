import { defineCommand } from "citty";
import { consola } from "consola";
import { writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  serializeMtlx,
  documentToJson,
  documentToGltf,
  toJsonString,
} from "@materialxjs/json";
import { ingest, MaterialXError } from "@materialxjs/ingest";
import type { ShaderModel } from "@materialxjs/ingest";
import { resolveOutputSafely } from "../util/output.js";

/**
 * Create a MaterialX material from a texture folder, zip archive, or .mtlx file.
 *
 * Ingests the input source, assembles a MaterialX document, and writes it
 * to the chosen output format (.mtlx, .json, or .gltf.json).
 *
 * @example
 * ```bash
 * materialxjs create ./Wood066_2K/                  # → Wood066_2K.mtlx
 * materialxjs create ./Wood066_2K/ --json           # → Wood066_2K.json
 * materialxjs create Wood066_2K.zip --gltf          # → Wood066_2K.gltf.json
 * materialxjs create ./textures/ --shader standard_surface
 * materialxjs create ./textures/ --name MyMaterial -o ./output/
 * ```
 */
export const create = defineCommand({
  meta: {
    name: "create",
    description:
      "Create a MaterialX material from textures, .mtlx, or .zip",
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
      description: "Output file or directory",
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
    json: {
      type: "boolean",
      description: "Output as materialxjson (.json)",
      default: false,
    },
    gltf: {
      type: "boolean",
      description: "Output as glTF KHR_texture_procedurals (.gltf.json)",
      default: false,
    },
    indent: {
      type: "string",
      description: "JSON indentation",
      default: "2",
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
    const indent = parseInt(args.indent);

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

      // Determine output format and serialize
      const { content, ext } = serializeOutput(
        result.document,
        args,
        indent,
      );

      // Resolve output path
      const outPath = resolveCreateOutputPath(args.input, args.output, ext);

      if (args["dry-run"]) {
        console.log(`[dry-run] Would create: ${outPath}`);
        console.log(`  Textures: ${result.textures.length}`);
        console.log(`  Nodes: ${result.document.children.length}`);
        console.log(`  Warnings: ${result.warnings.length}`);
        return;
      }

      const safe = await resolveOutputSafely(outPath, args.force);
      if (!safe) {
        process.exitCode = 1;
        return;
      }

      await mkdir(dirname(resolve(outPath)), { recursive: true });
      await writeFile(outPath, content, "utf-8");

      consola.success(`Created ${outPath}`);
      consola.info(
        `  ${result.textures.length} textures, ${result.document.children.length} nodes`,
      );
    } finally {
      await result.cleanup();
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────

function serializeOutput(
  document: Parameters<typeof serializeMtlx>[0],
  args: { json: boolean; gltf: boolean },
  indent: number,
): { content: string; ext: string } {
  if (args.json) {
    return {
      content: toJsonString(documentToJson(document), indent),
      ext: ".json",
    };
  }
  if (args.gltf) {
    return {
      content: toJsonString(documentToGltf(document), indent),
      ext: ".gltf.json",
    };
  }
  // Default: .mtlx
  return { content: serializeMtlx(document), ext: ".mtlx" };
}

/**
 * Resolve the output path for create command.
 * Infers filename from the input path basename.
 */
function resolveCreateOutputPath(
  input: string,
  output: string | undefined,
  ext: string,
): string {
  // Derive base name from input, stripping extensions
  let base = basename(input);
  for (const strip of [".zip", ".mtlx"]) {
    if (base.endsWith(strip)) {
      base = base.slice(0, -strip.length);
      break;
    }
  }
  // Clean up trailing slashes / dots
  base = base.replace(/[/\\.]$/g, "") || base;

  if (!output) {
    return `./${base}${ext}`;
  }

  if (output.endsWith("/") || output.endsWith("\\")) {
    return `${output}${base}${ext}`;
  }

  return output;
}
