import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMtlx } from "../src/xml/parser.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("parseMtlx", () => {
  it("parses root attributes", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    expect(doc.version).toBe("1.39");
    expect(doc.fileprefix).toBe("./");
  });

  it("parses all top-level elements", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    // open_pbr_surface, surfacematerial, 4x tiledimage, displacement, normalmap = 8
    expect(doc.children).toHaveLength(8);
  });

  it("parses element categories correctly", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const categories = doc.children.map((c) => c.category);
    expect(categories).toContain("open_pbr_surface");
    expect(categories).toContain("surfacematerial");
    expect(categories).toContain("tiledimage");
    expect(categories).toContain("normalmap");
    expect(categories).toContain("displacement");
  });

  it("parses element names and types", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const material = doc.children.find((c) => c.category === "surfacematerial");
    expect(material).toBeDefined();
    expect(material!.name).toBe("Onyx006_2K_JPG");
    expect(material!.type).toBe("material");
  });

  it("parses inputs with values", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const colorImage = doc.children.find((c) => c.name === "Onyx006_2K_JPG_Color");
    expect(colorImage).toBeDefined();

    const fileInput = colorImage!.inputs.find((i) => i.name === "file");
    expect(fileInput).toBeDefined();
    expect(fileInput!.type).toBe("filename");
    expect(fileInput!.value).toBe("Onyx006_2K-JPG_Color.jpg");
    expect(fileInput!.attributes.colorspace).toBe("srgb_texture");
  });

  it("parses inputs with node connections", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const shader = doc.children.find((c) => c.category === "open_pbr_surface");
    expect(shader).toBeDefined();

    const colorInput = shader!.inputs.find((i) => i.name === "base_color");
    expect(colorInput).toBeDefined();
    expect(colorInput!.nodename).toBe("Onyx006_2K_JPG_Color");
    expect(colorInput!.value).toBeUndefined();
  });

  it("parses extra attributes (xpos, ypos)", () => {
    const doc = parseMtlx(readFixture("Onyx006.mtlx"));
    const shader = doc.children.find((c) => c.category === "open_pbr_surface");
    expect(shader!.attributes.xpos).toBe("6.159420");
    expect(shader!.attributes.ypos).toBe("-1.879310");
  });

  it("parses all three sample materials without errors", () => {
    for (const name of ["Onyx006.mtlx", "Wood052.mtlx", "Wood066.mtlx"]) {
      const doc = parseMtlx(readFixture(name));
      expect(doc.version).toBe("1.39");
      expect(doc.children.length).toBeGreaterThan(0);
    }
  });

  it("parses the standard_surface_default sample", () => {
    const doc = parseMtlx(readFixture("standard_surface_default.mtlx"));
    expect(doc.version).toBe("1.39");
    expect(doc.attributes.colorspace).toBe("lin_rec709");

    const shader = doc.children.find((c) => c.category === "standard_surface");
    expect(shader).toBeDefined();
    expect(shader!.inputs.length).toBeGreaterThan(10);

    const material = doc.children.find((c) => c.category === "surfacematerial");
    expect(material).toBeDefined();
    expect(material!.inputs[0].nodename).toBe("SR_default");
  });

  it("throws on invalid XML", () => {
    expect(() => parseMtlx("<notmaterialx />")).toThrow("missing <materialx>");
  });
});
