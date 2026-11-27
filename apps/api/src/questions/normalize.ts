// BR-QB-019 canonical key, used for catalog dedupe and option/answer/pair
// uniqueness: NFC → trim → collapse whitespace → lowercase.
// Locale-independent toLowerCase; accents are preserved (no unaccent in MVP).
// The teacher's original text is stored separately; only keys hold this output.
export function normalize(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}
