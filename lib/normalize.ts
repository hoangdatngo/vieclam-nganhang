/**
 * Vietnamese text normalisation.
 *
 * Two forms, used on both sides of the system:
 *
 * - `toStorage` — canonical NFC. Applied by the crawler to every ingested string so that two
 *   visually identical titles arriving in different Unicode forms compare and dedupe as equal.
 * - `toSearch` — lowercase, diacritic-free, `[a-z0-9 ]` only. Written to `job.title_search` by
 *   the crawler and applied to the user's query at read time. Both sides MUST call this same
 *   function; two implementations will drift and search will silently rot.
 *
 * See docs/adr/0004-diacritic-insensitive-vietnamese-search.md.
 */

/** Unicode combining diacritical marks, exposed by NFD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Canonical storage form: NFC, whitespace collapsed, trimmed.
 *
 * Bank career sites are not consistent about Unicode normalisation form. The same visible title
 * can arrive as NFC or NFD, producing byte-different strings that break equality comparison,
 * dedupe keys and indexes.
 */
export function toStorage(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Search form: diacritics folded away, lowercased, reduced to `[a-z0-9 ]`.
 *
 * `đ`/`Đ` (U+0111/U+0110) must be handled explicitly. Unlike every Vietnamese vowel, they have
 * no Unicode canonical decomposition, so NFD followed by combining-mark stripping leaves them
 * untouched — "đồng" would fold to "đong" and a user typing "dong" would get nothing.
 *
 * Reducing the output to `[a-z0-9 ]` is also a security property: it makes it impossible for
 * user input to carry PostgreSQL `tsquery` operators into a constructed query. Do not widen the
 * character class without replacing that guarantee.
 */
export function toSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a user's query into search tokens. Empty input yields an empty array, which callers
 * must treat as "no search applied" rather than "match nothing".
 */
export function toSearchTokens(value: string): string[] {
  const normalised = toSearch(value);
  return normalised === '' ? [] : normalised.split(' ');
}
