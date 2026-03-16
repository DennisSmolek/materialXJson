import { defineCommand } from "citty";
import { consola } from "consola";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import {
  parseMtlx,
  serializeMtlx,
  documentToJson,
  documentFromJson,
  documentToGltf,
  documentFromGltf,
  toJsonString,
} from "@materialxjs/json";
import type {
  MtlxDocument,
  MtlxJsonDocument,
  GltfProceduralDocument,
} from "@materialxjs/json";
import { resolveOutputSafely } from "../util/output.js";

type Format = "mtlx" | "json" | "gltf";

/**
 * Convert between MaterialX XML, materialxjson, and glTF procedural formats.
 *
 * This is the default command when no subcommand is specified.
 */
export const convert = defineCommand({
  meta: {
    name: "convert",
    description: "Convert between MaterialX XML and JSON formats",
  },
  args: {
    input: {
      type: "positional",
      description: "Input file or directory",
      required: true,
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output file or directory",
    },
    mtlx: {
      type: "boolean",
      description: "Output as MaterialX XML (.mtlx)",
      default: false,
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
    const files = await resolveInputFiles(args.input);
    const indent = parseInt(args.indent);

    if (files.length === 0) {
      consola.warn("No matching files found.");
      return;
    }

    for (const file of files) {
      const inputFormat = detectInputFormat(file);
      const outputFormat = resolveOutputFormat(inputFormat, args);

      const doc = await loadDocument(file, inputFormat);
      const { content, ext } = serializeDocument(doc, outputFormat, indent);
      const outPath = resolveOutputPath(file, args.output, ext);

      if (args["dry-run"]) {
        consola.info(`[dry-run] ${file} → ${outPath}`);
        continue;
      }

      const safe = await resolveOutputSafely(outPath, args.force);
      if (!safe) continue;

      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, content, "utf-8");
      consola.success(`${file} → ${outPath}`);
    }
  },
});

// ── Format detection ────────────────────────────────────────────────

function detectInputFormat(file: string): Format {
  if (file.endsWith(".mtlx")) return "mtlx";
  if (file.endsWith(".gltf.json")) return "gltf";
  return "json";
}

function detectFormatFromExtension(file: string): Format | null {
  if (file.endsWith(".mtlx")) return "mtlx";
  if (file.endsWith(".gltf.json") || file.endsWith(".gltf")) return "gltf";
  if (file.endsWith(".json")) return "json";
  return null;
}

function resolveOutputFormat(
  inputFormat: Format,
  args: { mtlx: boolean; json: boolean; gltf: boolean; output?: string },
): Format {
  if (args.mtlx) return "mtlx";
  if (args.json) return "json";
  if (args.gltf) return "gltf";

  if (args.output) {
    const detected = detectFormatFromExtension(args.output);
    if (detected) return detected;
  }

  switch (inputFormat) {
    case "mtlx":
      return "json";
    case "json":
      return "mtlx";
    case "gltf":
      return "mtlx";
  }
}

// ── I/O helpers ─────────────────────────────────────────────────────

async function loadDocument(
  file: string,
  inputFormat: Format,
): Promise<MtlxDocument> {
  const content = await readFile(file, "utf-8");

  if (inputFormat === "mtlx") {
    return parseMtlx(content);
  }

  const parsed = JSON.parse(content);

  if (parsed.mimetype === "application/mtlx+json") {
    return documentFromJson(parsed as MtlxJsonDocument);
  }
  if (parsed.procedurals) {
    return documentFromGltf(parsed as GltfProceduralDocument);
  }

  throw new Error(
    `Cannot determine JSON format for ${file}. Expected "mimetype" or "procedurals" key.`,
  );
}

function serializeDocument(
  doc: MtlxDocument,
  outputFormat: Format,
  indent: number,
): { content: string; ext: string } {
  switch (outputFormat) {
    case "mtlx":
      return { content: serializeMtlx(doc), ext: ".mtlx" };
    case "json":
      return {
        content: toJsonString(documentToJson(doc), indent),
        ext: ".json",
      };
    case "gltf":
      return {
        content: toJsonString(documentToGltf(doc), indent),
        ext: ".gltf.json",
      };
  }
}

async function resolveInputFiles(input: string): Promise<string[]> {
  const info = await stat(input);
  if (info.isDirectory()) {
    const entries = await readdir(input);
    return entries
      .filter((e) => e.endsWith(".mtlx") || e.endsWith(".json"))
      .map((e) => join(input, e));
  }
  return [input];
}

function resolveOutputPath(
  inputFile: string,
  output: string | undefined,
  defaultExt: string,
): string {
  let base = basename(inputFile);
  for (const ext of [".gltf.json", ".mtlx", ".json"]) {
    if (base.endsWith(ext)) {
      base = base.slice(0, -ext.length);
      break;
    }
  }

  if (!output) {
    return join(".", base + defaultExt);
  }

  if (output.endsWith("/") || output.endsWith("\\")) {
    return join(output, base + defaultExt);
  }

  return output;
}
