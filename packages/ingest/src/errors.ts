/**
 * Typed error class used across @materialxjs packages.
 *
 * @example
 * ```typescript
 * throw new MaterialXError(
 *   "E_ZIP_UNSAFE",
 *   "fatal",
 *   "Zip entry contains path traversal: ../../../etc/passwd",
 *   "Ensure zip files are from a trusted source"
 * );
 * ```
 */
export class MaterialXError extends Error {
  /** Machine-readable error code (e.g. "E_ZIP_UNSAFE") */
  code: string;
  /** Severity level */
  severity: "warning" | "error" | "fatal";
  /** Optional remediation hint for the user */
  hint?: string;

  constructor(
    code: string,
    severity: "warning" | "error" | "fatal",
    message: string,
    hint?: string,
  ) {
    super(message);
    this.name = "MaterialXError";
    this.code = code;
    this.severity = severity;
    this.hint = hint;
  }
}
