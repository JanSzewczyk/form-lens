const BYTES_PER_MB = 1024 * 1024;

/** The document types the API reads; it checks the bytes again, so this only spares the user a pointless upload. */
const ACCEPTED_MIME_TYPES: ReadonlyArray<string> = ["application/pdf", "image/png", "image/jpeg", "image/tiff"];

/** Browsers send no MIME type for some files (TIFF often), so the extension is accepted on its own as well. */
const ACCEPTED_EXTENSIONS: ReadonlyArray<string> = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"];

type CheckedFile = Pick<File, "name" | "size" | "type">;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Why the file cannot be uploaded, or `null` when it can: a PDF, PNG, JPEG or TIFF of at most `maxMb` megabytes.
 * The drop zone runs it before any upload and the server action runs it again.
 */
export function checkFile(file: CheckedFile, maxMb: number): string | null {
  const isAccepted = ACCEPTED_MIME_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(extensionOf(file.name));
  if (!isAccepted) {
    return "This file type is not supported. Choose a PDF, PNG, JPEG or TIFF file.";
  }
  if (file.size > maxMb * BYTES_PER_MB) {
    return `The file is larger than ${maxMb} MB. Choose a file of up to ${maxMb} MB.`;
  }
  return null;
}

/** A size as the user reads it: `2 MB`, `350 KB`, `12 B`. */
export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) {
    return `${Math.round((bytes / BYTES_PER_MB) * 10) / 10} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}
