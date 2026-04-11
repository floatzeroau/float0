// ---------------------------------------------------------------------------
// Reserved slugs — blocked from use as org slugs
// ---------------------------------------------------------------------------

export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'portal',
  'hub',
  'www',
  'mail',
  'support',
  'help',
  'login',
  'register',
  'auth',
  'health',
]);

// ---------------------------------------------------------------------------
// Slugify — converts an arbitrary string to a URL-safe slug
// ---------------------------------------------------------------------------

/**
 * Convert a string to a URL-safe slug.
 * - Lowercases
 * - Replaces accented characters with ASCII equivalents
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Strips leading/trailing hyphens
 *
 * @example slugify("Peat's Plate Café") // "peats-plate-cafe"
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD') // decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric runs with hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-'); // collapse consecutive hyphens
}

// ---------------------------------------------------------------------------
// Validate slug format
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Validate a slug string. Returns null if valid, or an error message string.
 * Rules: 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 */
export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return 'Slug must be at least 3 characters';
  if (slug.length > 50) return 'Slug must be at most 50 characters';
  if (!SLUG_RE.test(slug)) {
    return 'Slug must contain only lowercase letters, numbers, and hyphens';
  }
  if (RESERVED_SLUGS.has(slug)) return 'This slug is reserved';
  return null;
}
