import type { SlideType } from '@prisma/client';

export type FastPathSlideType = 'IMAGE' | 'VIDEO' | 'HTML';

export function slideTypeFromMime(mime: string): SlideType | null {
	if (mime.startsWith('image/')) return 'IMAGE';
	if (mime.startsWith('video/')) return 'VIDEO';
	if (mime === 'text/html') return 'HTML';
	return null;
}

export function isFastPathMime(mime: string): boolean {
	return slideTypeFromMime(mime) !== null;
}

export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}
