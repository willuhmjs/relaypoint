import type { SlideType } from '@prisma/client';

export type FastPathSlideType = 'IMAGE' | 'VIDEO' | 'HTML';

export function slideTypeFromMime(mime: string): SlideType | null {
	const normalized = mime.split(';')[0].trim().toLowerCase();
	if (normalized.startsWith('image/')) return 'IMAGE';
	if (normalized.startsWith('video/')) return 'VIDEO';
	if (normalized === 'text/html') return 'HTML';
	return null;
}

export function isFastPathMime(mime: string): boolean {
	return slideTypeFromMime(mime) !== null;
}

export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}
