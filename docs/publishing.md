# Publishing Guide

Step-by-step guide for publishing `@materialxjs/*` packages to npm, and instructions for testing locally without deploying.

The repo publishes five packages:

- `@materialxjs/json`
- `@materialxjs/texture-map`
- `@materialxjs/ingest`
- `@materialxjs/gltf-pack`
- `@materialxjs/cli`

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- npm account with publish access to the `@materialxjs` org
- Logged in: `npm login`

Verify your login and org access:

```bash
npm whoami
npm org ls materialxjs
```

If `npm org ls materialxjs` errors, the org doesn't exist yet — create it at https://www.npmjs.com/org/create before publishing.

Each `package.json` declares `"publishConfig": { "access": "public" }`, so scoped packages publish as public automatically.

---

## Local Testing (No Publish)

Test packages locally before publishing to npm.

### Option A: pnpm link (quick, for CLI testing)

```bash
pnpm build

# Link the CLI globally
cd packages/cli
pnpm link --global

# Use it from anywhere
materialxjs --help

# When done
pnpm unlink --global
```

### Option B: pnpm pack (simulates real install)

Creates `.tgz` files identical to what npm would publish — the most accurate local test.

```bash
pnpm build

# Pack every package
pnpm -r exec pnpm pack
# Creates: packages/*/materialxjs-*-0.1.0.tgz
```

Install the tarballs in a scratch project (install in dependency order — lowest first):

```bash
mkdir ~/test-materialxjs && cd ~/test-materialxjs
npm init -y

# Core library first, then dependents
npm install /path/to/packages/json/materialxjs-json-0.1.0.tgz
npm install /path/to/packages/texture-map/materialxjs-texture-map-0.1.0.tgz
npm install /path/to/packages/ingest/materialxjs-ingest-0.1.0.tgz
npm install /path/to/packages/gltf-pack/materialxjs-gltf-pack-0.1.0.tgz
npm install /path/to/packages/cli/materialxjs-cli-0.1.0.tgz

# Smoke test
node -e "
  const { parseMtlx, documentToJson, toJsonString } = require('@materialxjs/json');
  const doc = parseMtlx('<materialx version=\"1.39\"><standard_surface name=\"test\" type=\"surfaceshader\" /></materialx>');
  console.log(toJsonString(documentToJson(doc)));
"
npx materialxjs --help
```

Clean up:

```bash
rm packages/*/*.tgz
```

### Option C: Verdaccio (local npm registry)

For repeated local testing, run a local registry:

```bash
npm install -g verdaccio
verdaccio  # runs on http://localhost:4873

# In another terminal — pnpm handles topological order
pnpm -r publish --registry http://localhost:4873

# Install from local registry in a test project
npm install @materialxjs/json @materialxjs/cli --registry http://localhost:4873
```

---

## Publishing to npm

### 1. Pre-flight checks

```bash
# Clean working tree on main
git status

# Tests + build
pnpm test
pnpm build

# Inspect each tarball's file list — should be dist/, LICENSE, README.md, package.json
for pkg in json texture-map ingest gltf-pack cli; do
  (cd "packages/$pkg" && npm pack --dry-run)
done
```

No source code, tests, or config files should leak through.

### 2. Bump versions

For v0.1.x, all five packages stay in sync. The simplest approach:

```bash
# Patch (0.1.0 → 0.1.1)
pnpm -r exec npm version patch --no-git-tag-version

# Or minor / major
pnpm -r exec npm version minor --no-git-tag-version
pnpm -r exec npm version major --no-git-tag-version
```

> **Note on `workspace:*`** — internal deps use `workspace:*`. pnpm rewrites these to the real version (e.g. `^0.1.1`) at publish time, so published packages always reference valid npm versions.

### 3. Publish

`pnpm -r publish` walks the dependency graph in topological order: `json` and `texture-map` first, then `ingest` and `gltf-pack`, then `cli`.

```bash
pnpm -r publish
```

The `--access public` flag is no longer required — each package's `publishConfig.access` handles it.

If you want to publish a single package:

```bash
pnpm --filter @materialxjs/cli publish
```

### 4. Verify the publish

```bash
for pkg in json texture-map ingest gltf-pack cli; do
  npm info "@materialxjs/$pkg" version
done
```

Smoke-test from a fresh directory:

```bash
mkdir ~/verify-publish && cd ~/verify-publish
npm init -y
npm install @materialxjs/json @materialxjs/texture-map @materialxjs/ingest @materialxjs/gltf-pack
npm install -g @materialxjs/cli

node -e "const { parseMtlx } = require('@materialxjs/json'); console.log('OK');"
materialxjs --help
```

### 5. Tag the release in git

```bash
git add packages/*/package.json package.json
git commit -m "release: v0.1.1"
git tag v0.1.1
git push origin main --tags
```

---

## Quick Reference

| Step | Command |
|------|---------|
| Build | `pnpm build` |
| Test | `pnpm test` |
| Dry-run pack (all) | `pnpm -r exec pnpm pack` |
| Bump (all, patch) | `pnpm -r exec npm version patch --no-git-tag-version` |
| Publish (all) | `pnpm -r publish` |
| Publish one | `pnpm --filter @materialxjs/cli publish` |
| Verify | `npm info @materialxjs/json` |

## Troubleshooting

**"You must be logged in"** — Run `npm login` and confirm publish access to the `@materialxjs` org.

**"402 Payment Required"** — The package is being published as private. Check that `publishConfig.access: "public"` exists in its `package.json`, or pass `--access public` explicitly.

**"403 Forbidden"** — Your npm account doesn't have write access to the org. Ask an org owner to add you.

**"Cannot publish over existing version"** — npm doesn't allow overwriting. Bump the version before re-publishing.

**`workspace:*` appears in published tarball** — You used `npm publish` instead of `pnpm publish`. Only `pnpm publish` / `pnpm -r publish` rewrites `workspace:*` to real versions.

**A dependent publishes before its dep** — Use `pnpm -r publish` (not a loop over `npm publish`) — pnpm sorts topologically by the workspace graph.
