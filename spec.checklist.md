# @materialxjs Spec Checklist

//* How To Use ===

- [ ] Treat each section as a package-level Definition of Done (DoD);
- [ ] Do not mark complete unless tests and docs in that section are complete;
- [ ] If behavior conflicts with `SPEC.md`, update `SPEC.md` first, then implement;
- [ ] Any lossy behavior must emit a warning code from the taxonomy;

//* Cross-Package Release Gates ===

- [ ] All public APIs have typed signatures and stable return shapes;
- [ ] Error objects use `MaterialXError` with `code`, `severity`, `message`, optional `hint`;
- [ ] No absolute filesystem paths appear in serialized outputs;
- [ ] Warnings are surfaced deterministically (same inputs => same warning set/order);
- [ ] Warning routing is clear: `MapResult` arrays are authoritative for texture-level issues; `IngestResult.warnings` is for pipeline-level messages; `E_TEXTURE_*` codes are for CLI/log surfacing only;
- [ ] Fixtures are checked into repo and reusable by all packages;
- [ ] CI runs unit tests + integration tests + glTF validation (where applicable);
- [ ] Changelog entries exist for each package release;

//* Package 1: @materialxjs/texture-map (Phase 1) ===

//* API + Behavior ---------------------------------

- [ ] `detectChannel(filename)` returns `TextureMapping | null`;
- [ ] `mapTextures(files, overrides?)` supports both simple and rich `TextureOverride`;
- [ ] Match ranking is enforced: `override > exact > vendor > fuzzy`;
- [ ] Tie at same ranking level produces conflict (never silent pick);
- [ ] `confidence` is set correctly on every mapped result;
- [ ] Normal convention handling is deterministic (`GL` preferred, `DX` conflict noted);
- [ ] Packed detection (`ARM/ORM`) sets `channel: "packed"` + valid `packing`;
- [ ] Resolution extraction supports `1k/2k/4k/8k` tokens case-insensitively;
- [ ] Colorspace rules apply channel + format heuristic (including EXR/HDR exceptions);

//* Invariants -------------------------------------

- [ ] Every input file appears in exactly one bucket: `mapped`, `unmapped`, or `conflicts`;
- [ ] No channel drop occurs without explicit conflict/unmapped output;
- [ ] Output ordering is deterministic for same input set;

//* Tests ------------------------------------------

- [ ] AmbientCG fixtures pass golden `MapResult` assertions;
- [ ] Polyhaven fixtures pass golden `MapResult` assertions;
- [ ] FreePBR/custom naming fixtures pass golden `MapResult` assertions;
- [ ] ARM/ORM fixtures validate `packing` metadata;
- [ ] GL + DX dual-normal fixtures validate conflict and preferred result behavior;
- [ ] EXR/HDR fixtures validate colorspace inference and override behavior;

//* Package 2: @materialxjs/ingest (Phase 2) ===

//* API + Source Handling --------------------------

- [ ] `ingest(input, options?)` supports `.mtlx`, `.zip`, directory inputs;
- [ ] `.mtlx` passthrough preserves original shading model and core graph fidelity;
- [ ] Directory ingestion routes filenames through `@materialxjs/texture-map`;
- [ ] Zip ingestion extracts to temp dir and returns usable `textureDir`;
- [ ] `IngestResult.cleanup()` exists and is safe to call multiple times (idempotent);
- [ ] All zip-source callers wrap downstream work in `try/finally { await result.cleanup() }`;

//* Zip Safety -------------------------------------

- [ ] Path traversal entries are rejected with `E_ZIP_UNSAFE`;
- [ ] Absolute zip entry paths are rejected with `E_ZIP_UNSAFE`;
- [ ] Null-byte filenames are rejected with `E_ZIP_UNSAFE`;
- [ ] Max uncompressed size limit enforced;
- [ ] Max file count limit enforced;
- [ ] Corrupt archives raise `E_ZIP_EXTRACT_FAILED`;

//* Material Assembly ------------------------------

- [ ] One `tiledimage` node is created per mapped texture;
- [ ] Shader node is created per selected model and wired correctly;
- [ ] `surfacematerial` is created and connected to shader output;
- [ ] Packed textures generate `extract` nodes for R/G/B channel reads;
- [ ] AO strategy is implemented per chosen policy and emits warnings if lossy;
- [ ] Relative path policy is enforced with `fileprefix="./"` for generated docs;

//* Tests ------------------------------------------

- [ ] Golden `MtlxDocument` snapshots for texture-folder fixtures;
- [ ] Golden `MtlxDocument` snapshots for zip fixtures;
- [ ] Golden passthrough roundtrip checks for existing `.mtlx` fixtures;
- [ ] Malicious zip fixtures validate all safety guards and error codes;
- [ ] `cleanup()` behavior test verifies temp content removed after explicit call;
- [ ] `cleanup()` called without zip source is a no-op (no error);
- [ ] Leaked temp dir test: verify cleanup runs even when downstream pipeline throws;

//* Package 3: @materialxjs/gltf-pack (Phase 4) ===

//* API + Output -----------------------------------

- [ ] `packGlb(result, options?)` returns `{ glb, meta }`;
- [ ] `writePackage(...)` writes `.glb` and `meta.json` correctly;
- [ ] `MetaJson` includes `name`, `version`, `shader`, `textures`, `channels`;
- [ ] `embedMaterialX` default is `false` and opt-in embedding works;
- [ ] `textures: "embed" | "reference"` behavior is implemented and documented;

//* Packing + Compression --------------------------

- [ ] ORM packed textures map directly when channel order already matches glTF;
- [ ] Non-ORM packed textures (ex: ARM) are remapped correctly before export;
- [ ] KTX2 path checks for `toktx` and throws `E_TOOL_MISSING` with install hint;
- [ ] KTX2 conversion uses correct transfer function for `srgb` vs `linear`;
- [ ] Resize and quality options are validated and applied safely;

//* Determinism + Validation -----------------------

- [ ] GLBs pass glTF-Validator (0 errors, 0 warnings) in CI;
- [ ] Semantic equivalence on repeat runs: same material count, same texture count, same node names, same input wiring, same extension set;
- [ ] Any dropped or approximated channels emit taxonomy warnings;

//* Tests ------------------------------------------

- [ ] Snapshot/fixture tests for `meta.json` content and stable key ordering;
- [ ] Visual parity spot checks for representative materials are documented;
- [ ] Extension usage tests cover required `KHR_materials_*` cases;

//* Package 4: @materialxjs/tsl (Phase 6) ===

//* API + Runtime ----------------------------------

- [ ] `proceduralToMaterial(...)` is async and returns `Promise<Material>`;
- [ ] `textureLoader(path)` async hook is supported and documented;
- [ ] `colorManagement` option behavior is implemented and tested;
- [ ] Standard Surface mapping reaches parity with selected compatibility target;
- [ ] OpenPBR partial mapping emits explicit warnings for all dropped/defaulted inputs;

//* Graph Translation ------------------------------

- [ ] glTF procedurals nodes map deterministically to TSL node graph;
- [ ] Channel extraction from procedurals maps to correct TSL swizzles;
- [ ] Packed texture usage remains consistent with ingest/gltf-pack semantics;
- [ ] Unsupported node patterns fail with typed `E_SHADER_UNSUPPORTED` errors;

//* Three.js Integration ---------------------------

- [ ] Works against pinned Three.js version range defined in package peer deps;
- [ ] Material class selection (`MeshStandardNodeMaterial` vs `MeshPhysicalNodeMaterial`) is deterministic;
- [ ] Runtime texture path resolution is documented for browser app contexts;

//* Tests ------------------------------------------

- [ ] Fixture-driven tests from procedurals JSON => material graph assertions;
- [ ] Browser smoke test renders representative materials without runtime errors;
- [ ] Compatibility matrix claims are backed by test cases;

//* CLI: @materialxjs/cli (Phases 3 + 5) ===

//* Commands + UX ----------------------------------

- [ ] Existing convert flow remains backward-compatible;
- [ ] `create` supports folder/zip inputs and shader selection;
- [ ] `inspect` reports mapped/unmapped/conflicts with confidence and variants;
- [ ] `pack` supports `.mtlx` source and GLB output options;
- [ ] `--force`, `--dry-run`, `--json-log` flags are implemented for all write commands;
- [ ] Non-interactive detection uses `stdin/stdout/CI` rule from spec;

//* Safety + Exit Codes ----------------------------

- [ ] Existing output behavior: prompt on interactive TTY, error in non-interactive mode;
- [ ] Exit codes: `0` success, `1` error, `2` partial failure;
- [ ] `--json-log` output is stable and machine-parseable;

//* Tests ------------------------------------------

- [ ] E2E CLI tests cover each command and key flag combinations;
- [ ] Snapshot tests cover human-readable inspect output;
- [ ] Snapshot tests cover JSON log schema and deterministic key ordering;

//* Docs + Developer Handoff ===

- [ ] `README.md` includes quick-start flows for `inspect`, `create`, `pack`;
- [ ] Package READMEs include API signatures, options, and warning/error tables;
- [ ] One troubleshooting page exists for common failures (`toktx`, zip safety, conflicts);
- [ ] Compatibility matrix from `SPEC.md` is mirrored in user-facing docs;
- [ ] Migration notes exist for breaking API/CLI changes;

//* Final Sign-Off ===

- [ ] All phase checklists complete;
- [ ] Open questions in `SPEC.md` are either resolved or explicitly deferred with owner;
- [ ] At least one full fixture pipeline passes end-to-end: `zip -> ingest -> pack -> runtime render`;
- [ ] Release tags and package versions are aligned across workspace packages;
