import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMtlx } from "../src/xml/parser.js";
import { documentToJson } from "../src/json/serializer.js";
import { documentFromJson } from "../src/json/parser.js";
import type { MtlxJsonDocument } from "../src/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("documentToJson", () => {
  it("produces correct mimetype", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const json = documentToJson(doc);
    expect(json.mimetype).toBe("application/mtlx+json");
  });

  it("preserves root attributes", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const json = documentToJson(doc);
    expect(json.materialx.version).toBe("1.39");
    expect(json.materialx.fileprefix).toBe("./");
  });

  it("serializes children with correct structure", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const json = documentToJson(doc);
    const children = json.materialx.children as unknown[];
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBe(8);
  });

  it("serializes inputs on elements", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const json = documentToJson(doc);
    const children = json.materialx.children! as any[];
    const shader = children.find((c: any) => c.category === "open_pbr_surface");
    expect(shader.inputs).toHaveLength(3);
    expect(shader.inputs[0].name).toBe("base_color");
    expect(shader.inputs[0].nodename).toBe("Onyx006_2K_JPG_Color");
  });

  it("serializes values on inputs", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const json = documentToJson(doc);
    const children = json.materialx.children! as any[];
    const colorImg = children.find((c: any) => c.name === "Onyx006_2K_JPG_Color");
    const fileInput = colorImg.inputs.find((i: any) => i.name === "file");
    expect(fileInput.value).toBe("Onyx006_2K-JPG_Color.jpg");
    expect(fileInput.colorspace).toBe("srgb_texture");
  });

  it("matches reference JSON format for standard_surface_default", () => {
    const doc = parseMtlx(readFixture("standard_surface_default.mtlx"));
    const json = documentToJson(doc);
    const reference: MtlxJsonDocument = JSON.parse(readFixture("standard_surface_default.json"));

    expect(json.mimetype).toBe(reference.mimetype);
    expect(json.materialx.version).toBe(reference.materialx.version);

    // Compare children count
    const jsonChildren = json.materialx.children! as any[];
    const refChildren = reference.materialx.children! as any[];
    expect(jsonChildren.length).toBe(refChildren.length);

    // Compare first child (standard_surface shader)
    const jsonShader = jsonChildren[0];
    const refShader = refChildren[0];
    expect(jsonShader.name).toBe(refShader.name);
    expect(jsonShader.category).toBe(refShader.category);
    expect(jsonShader.type).toBe(refShader.type);
    expect(jsonShader.inputs.length).toBe(refShader.inputs.length);

    // Spot-check some inputs
    for (let i = 0; i < refShader.inputs.length; i++) {
      expect(jsonShader.inputs[i].name).toBe(refShader.inputs[i].name);
      expect(jsonShader.inputs[i].type).toBe(refShader.inputs[i].type);
      expect(jsonShader.inputs[i].value).toBe(refShader.inputs[i].value);
    }
  });
});

describe("documentFromJson", () => {
  it("round-trips through JSON", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const json = documentToJson(doc);
    const doc2 = documentFromJson(json);

    expect(doc2.version).toBe(doc.version);
    expect(doc2.fileprefix).toBe(doc.fileprefix);
    expect(doc2.children.length).toBe(doc.children.length);

    for (let i = 0; i < doc.children.length; i++) {
      expect(doc2.children[i].category).toBe(doc.children[i].category);
      expect(doc2.children[i].name).toBe(doc.children[i].name);
      expect(doc2.children[i].type).toBe(doc.children[i].type);
      expect(doc2.children[i].inputs.length).toBe(doc.children[i].inputs.length);
    }
  });

  it("rejects invalid mimetype", () => {
    expect(() =>
      documentFromJson({ mimetype: "wrong" as any, materialx: {} as any }),
    ).toThrow("wrong or missing mimetype");
  });

  it("parses reference JSON correctly", () => {
    const reference: MtlxJsonDocument = JSON.parse(readFixture("standard_surface_default.json"));
    const doc = documentFromJson(reference);
    expect(doc.version).toBe("1.39");
    expect(doc.attributes.colorspace).toBe("lin_rec709");
    expect(doc.children).toHaveLength(2);
    expect(doc.children[0].category).toBe("standard_surface");
    expect(doc.children[0].inputs.length).toBeGreaterThan(10);
  });
});
