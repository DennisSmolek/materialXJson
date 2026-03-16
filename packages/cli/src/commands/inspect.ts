import { defineCommand } from "citty";
import { consola } from "consola";
import { ingest, MaterialXError } from "@materialxjs/ingest";
import type { TextureMapping } from "@materialxjs/texture-map";
import type { MtlxElement } from "@materialxjs/json";

/**
 * Inspect a material source — show detected texture channels, material
 * structure, warnings, and conflicts. Useful for debugging before `create`.
 *
 * @example
 * ```bash
 * materialxjs inspect ./Wood066_2K/
 * materialxjs inspect material.mtlx
 * materialxjs inspect Wood066_2K.zip
 * materialxjs inspect ./textures/ --json-log
 * ```
 */
export const inspect = defineCommand({
  meta: {
    name: "inspect",
    description: "Inspect a material source (textures, .mtlx, or .zip)",
  },
  args: {
    input: {
      type: "positional",
      description: "Path to texture folder, .mtlx file, or .zip archive",
      required: true,
    },
    shader: {
      type: "string",
      description:
        "Shading model to check against (open_pbr_surface, standard_surface, gltf_pbr)",
      default: "open_pbr_surface",
    },
    "json-log": {
      type: "boolean",
      description: "Output structured JSON instead of human-readable text",
      default: false,
    },
  },
  async run({ args }) {
    const shader = args.shader as
      | "open_pbr_surface"
      | "standard_surface"
      | "gltf_pbr";

    let result;
    try {
      result = await ingest(args.input, { shader });
    } catch (err) {
      if (err instanceof MaterialXError) {
        consola.error(`${err.code}: ${err.message}`);
        if (err.hint) console.log(`Hint: ${err.hint}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    try {
      if (args["json-log"]) {
        printJsonLog(result.textures, result.warnings, result.document.children);
        return;
      }

      printHumanReadable(
        args.input,
        result.textures,
        result.warnings,
        result.document.children,
      );
    } finally {
      await result.cleanup();
    }
  },
});

// ── Output formatters ───────────────────────────────────────────────

function printJsonLog(
  textures: TextureMapping[],
  warnings: string[],
  children: MtlxElement[],
): void {
  const output = {
    textures: textures.map((t) => ({
      channel: t.channel,
      file: t.file,
      colorspace: t.colorspace,
      confidence: t.confidence,
      ...(t.resolution ? { resolution: t.resolution } : {}),
      ...(t.normalConvention ? { normalConvention: t.normalConvention } : {}),
      ...(t.packing ? { packing: t.packing } : {}),
    })),
    nodes: children.map((c) => ({
      category: c.category,
      name: c.name,
      type: c.type,
    })),
    warnings,
  };
  console.log(JSON.stringify(output, null, 2));
}

function printHumanReadable(
  inputPath: string,
  textures: TextureMapping[],
  warnings: string[],
  children: MtlxElement[],
): void {
  console.log();

  // Detected textures
  if (textures.length > 0) {
    console.log("  Detected textures:");
    const maxChannel = Math.max(...textures.map((t) => channelLabel(t).length));
    const maxFile = Math.max(...textures.map((t) => t.file.length));

    for (const tex of textures) {
      const label = channelLabel(tex).padEnd(maxChannel + 2);
      const file = tex.file.padEnd(maxFile + 2);
      const meta = formatMeta(tex);
      console.log(`    ${label}${file}${meta}`);
    }
  } else {
    console.log("  No textures detected (passthrough .mtlx)");
  }

  // Warnings (unmapped, conflicts, dropped channels)
  const unmapped = warnings.filter((w) => w.includes("E_TEXTURE_UNMAPPED"));
  const conflicts = warnings.filter((w) => w.includes("E_TEXTURE_CONFLICT"));
  const dropped = warnings.filter((w) => w.includes("E_CHANNEL_DROPPED"));
  const other = warnings.filter(
    (w) =>
      !w.includes("E_TEXTURE_UNMAPPED") &&
      !w.includes("E_TEXTURE_CONFLICT") &&
      !w.includes("E_CHANNEL_DROPPED"),
  );

  if (unmapped.length > 0) {
    console.log();
    console.log("  Unmapped:");
    for (const w of unmapped) {
      console.log(`    ${w.replace("E_TEXTURE_UNMAPPED: ", "")}`);
    }
  }

  if (conflicts.length > 0) {
    console.log();
    console.log("  Conflicts:");
    for (const w of conflicts) {
      console.log(`    ${w.replace("E_TEXTURE_CONFLICT: ", "")}`);
    }
  }

  if (dropped.length > 0) {
    console.log();
    console.log("  Dropped channels:");
    for (const w of dropped) {
      console.log(`    ${w.replace("E_CHANNEL_DROPPED: ", "")}`);
    }
  }

  if (other.length > 0) {
    console.log();
    console.log("  Other warnings:");
    for (const w of other) {
      console.log(`    ${w}`);
    }
  }

  if (warnings.length === 0 && textures.length > 0) {
    console.log();
    console.log("  Conflicts: none");
  }

  // Material structure summary
  console.log();
  const shaderNode = children.find(
    (c) =>
      c.category === "open_pbr_surface" ||
      c.category === "standard_surface" ||
      c.category === "gltf_pbr",
  );
  if (shaderNode) {
    console.log(
      `  Shader: ${shaderNode.category} (${shaderNode.inputs.length} inputs)`,
    );
  }
  console.log(`  Nodes: ${children.length} total`);

  // Suggest next step
  console.log();
  console.log(`  Ready: materialxjs create ${inputPath}`);
  console.log();
}

// ── Helpers ─────────────────────────────────────────────────────────

function channelLabel(tex: TextureMapping): string {
  if (tex.channel === "packed" && tex.packing) {
    return `packed (${tex.packing.r[0].toUpperCase()}/${tex.packing.g[0].toUpperCase()}/${tex.packing.b[0].toUpperCase()})`;
  }
  return tex.channel;
}

function formatMeta(tex: TextureMapping): string {
  const parts: string[] = [tex.colorspace];
  if (tex.resolution) parts.push(tex.resolution);
  if (tex.normalConvention) parts.push(tex.normalConvention.toUpperCase());
  parts.push(tex.confidence);
  return `(${parts.join(", ")})`;
}
