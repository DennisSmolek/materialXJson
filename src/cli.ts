import { Command } from "commander";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { parseMtlx } from "./xml/parser.js";
import { serializeMtlx } from "./xml/serializer.js";
import { documentToJson } from "./json/serializer.js";
import { documentFromJson } from "./json/parser.js";
import { documentToGltf } from "./gltf/serializer.js";
import { documentFromGltf } from "./gltf/parser.js";
import type { MtlxJsonDocument, GltfProceduralDocument } from "./types.js";

const program = new Command();

program
  .name("materialx-json")
  .description("Convert between MaterialX XML and JSON formats")
  .version("0.1.0");

// XML → materialxjson
program
  .command("m2j <input>")
  .description("Convert MaterialX XML to materialxjson JSON")
  .option("-o, --output <path>", "Output file or directory")
  .option("--indent <n>", "JSON indentation", "2")
  .action(async (input: string, opts: { output?: string; indent: string }) => {
    const files = await resolveInput(input, ".mtlx");
    for (const file of files) {
      const xml = await readFile(file, "utf-8");
      const doc = parseMtlx(xml);
      const json = documentToJson(doc, { indent: parseInt(opts.indent) });
      const jsonStr = JSON.stringify(json, null, parseInt(opts.indent));
      const outPath = resolveOutput(file, opts.output, ".json");
      await writeFile(outPath, jsonStr, "utf-8");
      console.log(`${file} → ${outPath}`);
    }
  });

// materialxjson → XML
program
  .command("j2m <input>")
  .description("Convert materialxjson JSON to MaterialX XML")
  .option("-o, --output <path>", "Output file or directory")
  .action(async (input: string, opts: { output?: string }) => {
    const files = await resolveInput(input, ".json");
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const json = JSON.parse(content) as MtlxJsonDocument;
      const doc = documentFromJson(json);
      const xml = serializeMtlx(doc);
      const outPath = resolveOutput(file, opts.output, ".mtlx");
      await writeFile(outPath, xml, "utf-8");
      console.log(`${file} → ${outPath}`);
    }
  });

// XML → glTF KHR_texture_procedurals
program
  .command("m2g <input>")
  .description("Convert MaterialX XML to glTF KHR_texture_procedurals JSON")
  .option("-o, --output <path>", "Output file or directory")
  .option("--indent <n>", "JSON indentation", "2")
  .action(async (input: string, opts: { output?: string; indent: string }) => {
    const files = await resolveInput(input, ".mtlx");
    for (const file of files) {
      const xml = await readFile(file, "utf-8");
      const doc = parseMtlx(xml);
      const gltf = documentToGltf(doc);
      const jsonStr = JSON.stringify(gltf, null, parseInt(opts.indent));
      const outPath = resolveOutput(file, opts.output, ".gltf.json");
      await writeFile(outPath, jsonStr, "utf-8");
      console.log(`${file} → ${outPath}`);
    }
  });

// glTF KHR_texture_procedurals → XML
program
  .command("g2m <input>")
  .description("Convert glTF KHR_texture_procedurals JSON to MaterialX XML")
  .option("-o, --output <path>", "Output file or directory")
  .action(async (input: string, opts: { output?: string }) => {
    const files = await resolveInput(input, ".json");
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const gltf = JSON.parse(content) as GltfProceduralDocument;
      const doc = documentFromGltf(gltf);
      const xml = serializeMtlx(doc);
      const outPath = resolveOutput(file, opts.output, ".mtlx");
      await writeFile(outPath, xml, "utf-8");
      console.log(`${file} → ${outPath}`);
    }
  });

async function resolveInput(input: string, ext: string): Promise<string[]> {
  const info = await stat(input);
  if (info.isDirectory()) {
    const entries = await readdir(input);
    return entries
      .filter((e) => e.endsWith(ext))
      .map((e) => join(input, e));
  }
  return [input];
}

function resolveOutput(
  inputFile: string,
  output: string | undefined,
  newExt: string,
): string {
  const base = basename(inputFile, extname(inputFile));
  if (!output) {
    return join(".", base + newExt);
  }
  // If output looks like a directory path (ends with / or has no ext)
  if (output.endsWith("/") || output.endsWith("\\")) {
    return join(output, base + newExt);
  }
  return output;
}

program.parse();
