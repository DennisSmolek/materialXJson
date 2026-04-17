import { describe, expect, expectTypeOf, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  documentFromProceduralGltf,
  documentToProceduralGltf,
  parseMtlx,
} from "../src/index.js";
import type { GltfProceduralExtensionDocument } from "../src/index.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("procedural glTF public api", () => {
  it("exports explicit procedural glTF helpers", () => {
    const source = parseMtlx(readFixture("Onyx006.mtlx"));

    const procedural = documentToProceduralGltf(source);
    expectTypeOf(procedural).toMatchTypeOf<GltfProceduralExtensionDocument>();
    expect(procedural.procedurals).toHaveLength(1);

    const roundTripped = documentFromProceduralGltf(procedural);
    expect(roundTripped.children).toHaveLength(1);
    expect(roundTripped.children[0].category).toBe("nodegraph");
  });
});
