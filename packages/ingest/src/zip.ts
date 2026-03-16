import { unzipSync } from "fflate";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { ZipSafetyOptions } from "./types.js";
import { MaterialXError } from "./errors.js";

const DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500 MB
const DEFAULT_MAX_FILES = 1000;

/**
 * Safely extract a zip file to a temporary directory.
 *
 * Enforces:
 * - Path traversal protection (no `..`, no absolute paths, no null bytes)
 * - Total uncompressed size limit
 * - File count limit
 *
 * @param zipPath - Path to the .zip file
 * @param options - Safety limits
 * @returns Object with the temp directory path and a cleanup function
 *
 * @throws {MaterialXError} `E_ZIP_UNSAFE` for path traversal, size, or count violations
 * @throws {MaterialXError} `E_ZIP_EXTRACT_FAILED` for corrupt or unreadable archives
 */
export async function extractZip(
  zipPath: string,
  options?: ZipSafetyOptions,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const maxSize = options?.maxUncompressedSize ?? DEFAULT_MAX_SIZE;
  const maxFiles = options?.maxFileCount ?? DEFAULT_MAX_FILES;

  // Read zip into memory
  let zipData: Uint8Array;
  try {
    const buffer = await readFile(zipPath);
    zipData = new Uint8Array(buffer);
  } catch (err) {
    throw new MaterialXError(
      "E_ZIP_EXTRACT_FAILED",
      "fatal",
      `Failed to read zip file: ${zipPath}`,
      "Ensure the file exists and is readable",
    );
  }

  // Decompress
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipData);
  } catch (err) {
    throw new MaterialXError(
      "E_ZIP_EXTRACT_FAILED",
      "fatal",
      `Failed to decompress zip: ${zipPath}`,
      "The archive may be corrupt or use an unsupported compression method",
    );
  }

  // Validate entry count
  const entryNames = Object.keys(entries);
  if (entryNames.length > maxFiles) {
    throw new MaterialXError(
      "E_ZIP_UNSAFE",
      "fatal",
      `Zip contains ${entryNames.length} entries, exceeding limit of ${maxFiles}`,
      "Increase maxFileCount in zip options if this is expected",
    );
  }

  // Create temp directory
  const tempId = randomBytes(8).toString("hex");
  const tempDir = join(tmpdir(), `materialxjs-${tempId}`);
  await mkdir(tempDir, { recursive: true });

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  };

  try {
    let totalSize = 0;

    for (const [name, data] of Object.entries(entries)) {
      // Skip directories (fflate marks them with empty data and trailing /)
      if (name.endsWith("/") && data.length === 0) continue;

      // Safety: null bytes
      if (name.includes("\0")) {
        throw new MaterialXError(
          "E_ZIP_UNSAFE",
          "fatal",
          `Zip entry contains null byte in filename: ${JSON.stringify(name)}`,
        );
      }

      // Safety: normalize and check for traversal
      const stripped = name.replace(/^\/+/, ""); // strip leading /
      const normalized = normalize(stripped);
      if (
        normalized.startsWith("..") ||
        normalized.includes("..\\") ||
        normalized.includes("../") ||
        resolve(tempDir, normalized) !== join(tempDir, normalized) // resolve must stay within tempDir
      ) {
        throw new MaterialXError(
          "E_ZIP_UNSAFE",
          "fatal",
          `Zip entry contains path traversal: ${name}`,
          "Ensure zip files are from a trusted source",
        );
      }

      // Safety: total size
      totalSize += data.length;
      if (totalSize > maxSize) {
        throw new MaterialXError(
          "E_ZIP_UNSAFE",
          "fatal",
          `Zip uncompressed size exceeds ${maxSize} bytes`,
          "Increase maxUncompressedSize in zip options if this is expected",
        );
      }

      // Write file
      const outPath = join(tempDir, normalized);
      await mkdir(join(outPath, ".."), { recursive: true });
      await writeFile(outPath, data);
    }
  } catch (err) {
    // Clean up on failure
    await cleanup();
    throw err;
  }

  return { dir: tempDir, cleanup };
}
