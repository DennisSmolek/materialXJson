import { stat } from "node:fs/promises";
import { consola } from "consola";

/**
 * Check whether an output path is safe to write to.
 *
 * - If the file doesn't exist, returns true.
 * - If `--force` is set, returns true.
 * - In non-interactive mode (piped, CI), logs an error and returns false.
 * - In interactive mode, prompts the user for confirmation.
 *
 * @returns `true` if safe to write, `false` to skip
 */
export async function resolveOutputSafely(
  outPath: string,
  force: boolean,
): Promise<boolean> {
  if (force) return true;

  // Check if file exists
  try {
    await stat(outPath);
  } catch {
    return true; // doesn't exist, safe to write
  }

  // File exists — check if interactive
  if (isNonInteractive()) {
    consola.error(
      `Output file exists: ${outPath} (use --force to overwrite)`,
    );
    return false;
  }

  // Interactive prompt
  const answer = await consola.prompt(
    `Output file exists: ${outPath}. Overwrite?`,
    { type: "confirm" },
  );

  return answer === true;
}

/**
 * Detect non-interactive environments where prompting is not possible.
 */
function isNonInteractive(): boolean {
  return (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    !!process.env.CI
  );
}
