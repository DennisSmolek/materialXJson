# Publishing Guide

Step-by-step guide for publishing `@materialxjs/*` packages to npm, and instructions for testing locally without deploying.

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- npm account with access to the `@materialxjs` org
- Logged in: `npm login`

Verify your login and org access:

```bash
npm whoami
npm org ls materialxjs
```

---

## Local Testing (No Publish)

Test packages locally before publishing to npm. There are two approaches.

### Option A: pnpm link (quick, for CLI testing)

Link the CLI globally so you can run `materialxjs` anywhere:

```bash
# Build everything first
pnpm build

# Link the CLI globally
cd packages/cli
pnpm link --global

# Now use it from anywhere
materialxjs --help
materialxjs ~/some-material.mtlx --gltf

# When done, unlink
pnpm unlink --global
```

### Option B: pnpm pack (simulates real install)

This creates .tgz files identical to what npm would publish — the most accurate local test.

```bash
# Build everything first
pnpm build

# Pack both packages
cd packages/json
pnpm pack
# Creates: materialxjs-json-0.1.0.tgz

cd ../cli
pnpm pack
# Creates: materialxjs-cli-0.1.0.tgz
```

Then install the tarballs in a test project:

```bash
mkdir ~/test-materialxjs && cd ~/test-materialxjs
npm init -y

# Install from local tarballs (json first since cli depends on it)
npm install /path/to/packages/json/materialxjs-json-0.1.0.tgz
npm install /path/to/packages/cli/materialxjs-cli-0.1.0.tgz

# Test the library
node -e "
  const { parseMtlx, documentToJson, toJsonString } = require('@materialxjs/json');
  const doc = parseMtlx('<materialx version=\"1.39\"><standard_surface name=\"test\" type=\"surfaceshader\" /></materialx>');
  console.log(toJsonString(documentToJson(doc)));
"

# Test the CLI
npx materialxjs --help
```

Clean up the .tgz files when done:

```bash
rm packages/json/*.tgz packages/cli/*.tgz
```

### Option C: Verdaccio (local npm registry)

For repeated local testing, run a local npm registry:

```bash
# Install and start Verdaccio
npm install -g verdaccio
verdaccio  # runs on http://localhost:4873

# In another terminal, publish to local registry
npm publish --registry http://localhost:4873 packages/json
npm publish --registry http://localhost:4873 packages/cli

# Install from local registry in a test project
npm install @materialxjs/json @materialxjs/cli --registry http://localhost:4873
```

---

## Publishing to npm

### 1. Pre-flight checks

```bash
# Make sure you're on main with a clean working tree
git status

# Run tests
pnpm test

# Build
pnpm build

# Check what files will be included in each package
cd packages/json && npm pack --dry-run && cd ../..
cd packages/cli && npm pack --dry-run && cd ../..
```

Verify the `npm pack --dry-run` output only includes `dist/` and `package.json` — no source code, tests, or config files should leak through.

### 2. Bump versions

Update the version in both package.json files. Keep them in sync:

```bash
# For a patch release (0.1.0 → 0.1.1)
cd packages/json && npm version patch && cd ../..
cd packages/cli && npm version patch && cd ../..

# For a minor release (0.1.0 → 0.2.0)
cd packages/json && npm version minor && cd ../..
cd packages/cli && npm version minor && cd ../..

# For a major release (0.1.0 → 1.0.0)
cd packages/json && npm version major && cd ../..
cd packages/cli && npm version major && cd ../..
```

> **Important:** `@materialxjs/cli` depends on `@materialxjs/json` via `workspace:*`. pnpm automatically replaces `workspace:*` with the actual version (e.g. `^0.2.0`) at publish time, so the CLI will always reference the correct version on npm.

### 3. Publish @materialxjs/json first

The CLI depends on the core library, so publish `json` first:

```bash
cd packages/json
npm publish --access public
```

The `--access public` flag is required the first time you publish a scoped package. Subsequent publishes don't need it.

### 4. Publish @materialxjs/cli

```bash
cd packages/cli
npm publish --access public
```

### 5. Verify the publish

```bash
npm info @materialxjs/json
npm info @materialxjs/cli
```

Test installing from npm in a fresh directory:

```bash
mkdir ~/verify-publish && cd ~/verify-publish
npm init -y
npm install @materialxjs/json
npm install -g @materialxjs/cli

node -e "const { parseMtlx } = require('@materialxjs/json'); console.log('OK');"
materialxjs --help
```

### 6. Tag the release in git

```bash
git add packages/json/package.json packages/cli/package.json
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

---

## Quick Reference

| Step | Command |
|------|---------|
| Build | `pnpm build` |
| Test | `pnpm test` |
| Dry-run pack | `cd packages/json && npm pack --dry-run` |
| Bump version | `cd packages/json && npm version patch` |
| Publish json | `cd packages/json && npm publish --access public` |
| Publish cli | `cd packages/cli && npm publish --access public` |
| Verify | `npm info @materialxjs/json` |

## Troubleshooting

**"You must be logged in"** — Run `npm login` and ensure your account has publish access to the `@materialxjs` org.

**"403 Forbidden"** — First publish of a scoped package requires `--access public`. Or your npm account doesn't have write access to the org.

**"Cannot publish over existing version"** — You need to bump the version before publishing. npm doesn't allow overwriting published versions.

**CLI `workspace:*` not resolved** — Make sure you're using `pnpm publish` or `npm publish` from inside the package directory, not `pnpm -r publish`. pnpm resolves `workspace:*` to real versions at publish time.
