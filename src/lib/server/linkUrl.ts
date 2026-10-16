/**
 * Slide link URLs are rendered as anchor `href`s on public pages and opened
 * on displays, so only plain web links are accepted (blocks `javascript:`,
 * `data:`, `file:` etc.).
 */
export function safeLinkUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
