import { readFile, writeFile } from "node:fs/promises";
import { parseMtlx } from "./xml/parser.js";
import { serializeMtlx } from "./xml/serializer.js";
import { documentToJson } from "./json/serializer.js";
import { documentFromJson } from "./json/parser.js";
import type {
  MtlxDocument,
  MtlxJsonDocument,
  JsonWriteOptions,
  JsonReadOptions,
} from "./types.js";

// Re-export everything from main entry
export * from "./index.js";

/** Read and parse a .mtlx XML file */
export async function readMtlxFile(path: string): Promise<MtlxDocument> {
  const xml = await readFile(path, "utf-8");
  return parseMtlx(xml);
}

/** Serialize and write a .mtlx XML file */
export async function writeMtlxFile(
  path: string,
  doc: MtlxDocument,
): Promise<void> {
  const xml = serializeMtlx(doc);
  await writeFile(path, xml, "utf-8");
}

/** Read and parse a materialxjson JSON file */
export async function readJsonFile(
  path: string,
): Promise<MtlxJsonDocument> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as MtlxJsonDocument;
}

/** Serialize and write a materialxjson JSON file */
export async function writeJsonFile(
  path: string,
  doc: MtlxJsonDocument,
  options?: JsonWriteOptions,
): Promise<void> {
  const json = JSON.stringify(doc, null, options?.indent ?? 2);
  await writeFile(path, json, "utf-8");
}
