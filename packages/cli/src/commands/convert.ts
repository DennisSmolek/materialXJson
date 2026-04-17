import { defineCommand } from "citty";
import { consola } from "consola";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import {
  parseMtlx,
  serializeMtlx,
  documentToJson,
  documentFromJson,
  documentToProceduralGltf,
  documentFromProceduralGltf,
  toJsonString,
} from "@materialxjs/json";
import type {
  MtlxDocument,
  MtlxJsonDocument,
  GltfProceduralExtensionDocument,
} from "@materialxjs/json";
import { ingest, MaterialXError } from "@materialxjs/ingest";
import { writeGltfPackage } from "@materialxjs/gltf-pack";
import { resolveOutputSafely } from "../util/output.js";

type InputFormat = "mtlx" | "json" | "procedural-json" | "gltf-asset";
type OutputFormat = "mtlx" | "json" | "procedural-json" | "gltf-asset";

/**
 * Convert between MaterialX XML, materialxjson, procedural glTF payloads,
 * and standard glTF assets.
 */
export const convert = defineCommand({
  meta: {
    name: "convert",
    description: "Convert between MaterialX XML, JSON, and glTF outputs",
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
      description: "Output as a standard glTF asset (.gltf)",
      default: false,
    },
    procedural: {
      type: "boolean",
      description:
        "Use KHR_texture_procedurals output or embed the procedural extension",
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
    validateArgs(args);
    const indent = parseInt(args.indent);

    if (requestsGltfAssetOutput(args)) {
      await writeStandardGltf(args.input, args);
      return;
    }

    const files = await resolveInputFiles(args.input);
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

function detectInputFormat(file: string): InputFormat {
  if (file.endsWith(".mtlx")) return "mtlx";
  if (file.endsWith(".gltf.json")) return "procedural-json";
  if (file.endsWith(".gltf")) return "gltf-asset";
  return "json";
}

function detectFormatFromExtension(file: string): OutputFormat | null {
  if (file.endsWith(".mtlx")) return "mtlx";
  if (file.endsWith(".gltf.json")) return "procedural-json";
  if (file.endsWith(".gltf")) return "gltf-asset";
  if (file.endsWith(".json")) return "json";
  return null;
}

function resolveOutputFormat(
  inputFormat: InputFormat,
  args: {
    mtlx: boolean;
    json: boolean;
    gltf: boolean;
    procedural: boolean;
    output?: string;
  },
): OutputFormat {
  if (args.mtlx) return "mtlx";
  if (args.procedural && args.json) return "procedural-json";
  if (args.json) return "json";
  if (args.gltf) return "gltf-asset";

  if (args.output) {
    const detected = detectFormatFromExtension(args.output);
    if (detected) return detected;
  }

  switch (inputFormat) {
    case "mtlx":
      return "json";
    case "json":
      return "mtlx";
    case "procedural-json":
      return "mtlx";
    case "gltf-asset":
      return "mtlx";
  }
}

// ── I/O helpers ─────────────────────────────────────────────────────

async function loadDocument(
  file: string,
  inputFormat: InputFormat,
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
    return documentFromProceduralGltf(
      parsed as GltfProceduralExtensionDocument,
    );
  }
  if (parsed.asset?.version) {
    throw new Error(
      `Standard glTF asset input is not supported yet for ${file}. Expected materialxjson or procedural JSON.`,
    );
  }

  throw new Error(
    `Cannot determine JSON format for ${file}. Expected "mimetype", "procedurals", or a supported glTF asset.`,
  );
}

function serializeDocument(
  doc: MtlxDocument,
  outputFormat: OutputFormat,
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
    case "procedural-json":
      return {
        content: toJsonString(documentToProceduralGltf(doc), indent),
        ext: ".gltf.json",
      };
    case "gltf-asset":
      throw new Error(
        "Standard glTF assets must be written through the asset packaging path.",
      );
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
  for (const ext of [".gltf.json", ".gltf", ".mtlx", ".json"]) {
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

function validateArgs(args: {
  mtlx: boolean;
  json: boolean;
  gltf: boolean;
  procedural: boolean;
}): void {
  const formatFlags = [args.mtlx, args.json, args.gltf].filter(Boolean).length;
  if (formatFlags > 1) {
    throw new Error("Choose only one of --mtlx, --json, or --gltf.");
  }
  if (args.procedural && !args.json && !args.gltf) {
    throw new Error("--procedural requires either --json or --gltf.");
  }
  if (args.procedural && args.mtlx) {
    throw new Error("--procedural cannot be combined with --mtlx.");
  }
}

function requestsGltfAssetOutput(args: {
  gltf: boolean;
  procedural: boolean;
  output?: string;
}): boolean {
  if (args.gltf) return true;
  if (!args.output) return false;
  return detectFormatFromExtension(args.output) === "gltf-asset";
}

async function writeStandardGltf(
  input: string,
  args: {
    output?: string;
    force: boolean;
    "dry-run": boolean;
    procedural: boolean;
  },
): Promise<void> {
  let result;
  try {
    result = await ingest(input);
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
    const outPath = resolveOutputPath(input, args.output, ".gltf");

    if (args["dry-run"]) {
      consola.info(`[dry-run] ${input} → ${outPath}`);
      consola.info(`[dry-run] ${outPath.replace(/\.gltf$/, ".meta.json")}`);
      return;
    }

    const safe = await resolveOutputSafely(outPath, args.force);
    if (!safe) return;

    const { gltfPath, metaPath } = await writeGltfPackage(result, outPath, {
      assetMode: args.procedural ? "procedural" : "standard",
    });

    consola.success(`${input} → ${gltfPath}`);
    consola.success(`meta → ${metaPath}`);
  } finally {
    await result.cleanup();
  }
}
