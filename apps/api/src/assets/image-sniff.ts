/** Image formats accepted by the assets API, identified by magic bytes only. */
export type SniffedImage =
  | { extension: "png"; mimeType: "image/png" }
  | { extension: "jpg"; mimeType: "image/jpeg" }
  | { extension: "webp"; mimeType: "image/webp" }
  | { extension: "gif"; mimeType: "image/gif" };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const GIF_87 = Buffer.from("GIF87a", "ascii");
const GIF_89 = Buffer.from("GIF89a", "ascii");
const RIFF = Buffer.from("RIFF", "ascii");
const WEBP = Buffer.from("WEBP", "ascii");

function startsWith(buffer: Buffer, prefix: Buffer, offset = 0): boolean {
  return (
    buffer.length >= offset + prefix.length &&
    buffer.subarray(offset, offset + prefix.length).equals(prefix)
  );
}

/**
 * Derive the format from the file signature, never from the client-supplied
 * filename or Content-Type. Returns null for anything that is not a supported
 * image so callers can answer 415.
 */
export function sniffImage(buffer: Buffer): SniffedImage | null {
  if (startsWith(buffer, PNG)) return { extension: "png", mimeType: "image/png" };
  if (startsWith(buffer, JPEG)) return { extension: "jpg", mimeType: "image/jpeg" };
  if (startsWith(buffer, GIF_87) || startsWith(buffer, GIF_89)) {
    return { extension: "gif", mimeType: "image/gif" };
  }
  if (startsWith(buffer, RIFF) && startsWith(buffer, WEBP, 8)) {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return null;
}
