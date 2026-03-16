import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMtlx } from "../src/xml/parser.js";
import { serializeMtlx } from "../src/xml/serializer.js";
import { documentToJson } from "../src/json/serializer.js";
import { documentFromJson } from "../src/json/parser.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const SAMPLE_FILES = ["Onyx006.mtlx", "Wood052.mtlx", "Wood066.mtlx", "standard_surface_default.mtlx"];

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("XML round-trip (parse → serialize → parse)", () => {
  for (const file of SAMPLE_FILES) {
    it(`round-trips ${file}`, () => {
      const xml = readFixture(file);
      const doc1 = parseMtlx(xml);
      const xml2 = serializeMtlx(doc1);
      const doc2 = parseMtlx(xml2);

      // Structural equality
      expect(doc2.version).toBe(doc1.version);
      expect(doc2.fileprefix).toBe(doc1.fileprefix);
      expect(doc2.children.length).toBe(doc1.children.length);

      for (let i = 0; i < doc1.children.length; i++) {
        const a = doc1.children[i];
        const b = doc2.children[i];
        expect(b.category).toBe(a.category);
        expect(b.name).toBe(a.name);
        expect(b.type).toBe(a.type);
        expect(b.inputs.length).toBe(a.inputs.length);
        expect(b.outputs.length).toBe(a.outputs.length);

        for (let j = 0; j < a.inputs.length; j++) {
          expect(b.inputs[j].name).toBe(a.inputs[j].name);
          expect(b.inputs[j].type).toBe(a.inputs[j].type);
          expect(b.inputs[j].value).toBe(a.inputs[j].value);
          expect(b.inputs[j].nodename).toBe(a.inputs[j].nodename);
        }
      }
    });
  }
});

describe("JSON round-trip (parse → toJson → fromJson → serialize → parse)", () => {
  for (const file of SAMPLE_FILES) {
    it(`round-trips ${file}`, () => {
      const xml = readFixture(file);
      const doc1 = parseMtlx(xml);
      const json = documentToJson(doc1);
      const doc2 = documentFromJson(json);
      const xml2 = serializeMtlx(doc2);
      const doc3 = parseMtlx(xml2);

      // Compare original and round-tripped
      expect(doc3.version).toBe(doc1.version);
      expect(doc3.children.length).toBe(doc1.children.length);

      for (let i = 0; i < doc1.children.length; i++) {
        const a = doc1.children[i];
        const b = doc3.children[i];
        expect(b.category).toBe(a.category);
        expect(b.name).toBe(a.name);
        expect(b.type).toBe(a.type);
        expect(b.inputs.length).toBe(a.inputs.length);

        for (let j = 0; j < a.inputs.length; j++) {
          expect(b.inputs[j].name).toBe(a.inputs[j].name);
          expect(b.inputs[j].type).toBe(a.inputs[j].type);
          expect(b.inputs[j].value).toBe(a.inputs[j].value);
          expect(b.inputs[j].nodename).toBe(a.inputs[j].nodename);
        }
      }
    });
  }
});
