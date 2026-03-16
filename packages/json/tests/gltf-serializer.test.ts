import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMtlx } from "../src/xml/parser.js";
import { documentToGltf } from "../src/gltf/serializer.js";
import { documentFromGltf } from "../src/gltf/parser.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("documentToGltf", () => {
  it("wraps loose nodes into a procedural", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    expect(gltf.procedurals).toHaveLength(1);
    expect(gltf.procedurals[0].nodetype).toBe("nodegraph");
  });

  it("creates nodes array with correct count", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    const proc = gltf.procedurals[0];
    expect(proc.nodes).toHaveLength(8);
  });

  it("converts node types correctly", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    const nodeTypes = gltf.procedurals[0].nodes!.map((n) => n.nodetype);
    expect(nodeTypes).toContain("open_pbr_surface");
    expect(nodeTypes).toContain("surfacematerial");
    expect(nodeTypes).toContain("tiledimage");
  });

  it("converts name-based refs to index-based refs", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    const proc = gltf.procedurals[0];

    // The open_pbr_surface node references Onyx006_2K_JPG_Color
    const shader = proc.nodes!.find((n) => n.nodetype === "open_pbr_surface");
    expect(shader).toBeDefined();
    const baseColorInput = shader!.inputs!["base_color"];
    expect(baseColorInput.node).toBeTypeOf("number");
    // The referenced node should exist at that index
    const referencedNode = proc.nodes![baseColorInput.node!];
    expect(referencedNode.name).toBe("Onyx006_2K_JPG_Color");
  });

  it("parses literal values into typed JSON values", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    const proc = gltf.procedurals[0];

    const colorImg = proc.nodes!.find((n) => n.name === "Onyx006_2K_JPG_Color");
    expect(colorImg).toBeDefined();

    const uvInput = colorImg!.inputs!["uvtiling"];
    expect(uvInput.value).toEqual([1.0, 1.0]);

    const fileInput = colorImg!.inputs!["file"];
    expect(fileInput.value).toBe("Onyx006_2K-JPG_Color.jpg");
  });
});

describe("documentFromGltf", () => {
  it("converts back to MtlxDocument", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    const doc2 = documentFromGltf(gltf);

    expect(doc2.version).toBe("1.39");
    // Should have one nodegraph wrapping the loose nodes
    expect(doc2.children).toHaveLength(1);
    expect(doc2.children[0].category).toBe("nodegraph");
    // The nodegraph should contain all original nodes
    expect(doc2.children[0].children).toHaveLength(8);
  });

  it("preserves node connections through round-trip", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const gltf = documentToGltf(doc);
    const doc2 = documentFromGltf(gltf);

    const nodes = doc2.children[0].children;
    const shader = nodes.find((n) => n.category === "open_pbr_surface");
    expect(shader).toBeDefined();

    const baseColor = shader!.inputs.find((i) => i.name === "base_color");
    expect(baseColor).toBeDefined();
    expect(baseColor!.nodename).toBe("Onyx006_2K_JPG_Color");
  });
});
