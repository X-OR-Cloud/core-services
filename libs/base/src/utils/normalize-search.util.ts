/**
 * Normalize text for diacritic-insensitive search.
 *
 * - NFD decomposition + strip combining marks (U+0300-U+036F) removes Vietnamese tone marks and accents
 * - Replaces đ/Đ explicitly (NFD does not decompose them)
 * - Lowercases and collapses whitespace
 *
 * Examples:
 *   "Phở Gà"   → "pho ga"
 *   "Bánh Mỳ"  → "banh my"
 *   "Đoàn"     → "doan"
 */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape a string so it can be safely used inside a RegExp.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a MongoDB filter that matches all whitespace-separated tokens (AND)
 * of a search query against a normalized field.
 *
 * Returns `null` when the query yields no usable tokens — caller can skip the filter.
 */
export function buildSearchFilter(
  searchField: string,
  query: string
): Record<string, unknown> | null {
  const normalized = normalizeSearchText(query);
  if (!normalized) return null;
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) {
    return { [searchField]: { $regex: escapeRegex(tokens[0]) } };
  }
  return {
    $and: tokens.map((token) => ({
      [searchField]: { $regex: escapeRegex(token) },
    })),
  };
}
