import type { RequestHandler } from '@sveltejs/kit';
import { renderSVG } from 'scannable/qr';

// In-memory LRU cache for QR codes, capped so the attacker-controlled `url`
// parameter cannot grow it without bound.
const MAX_CACHED_QR_CODES = 500;
const qrCodeCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
	const hit = qrCodeCache.get(key);
	if (hit !== undefined) {
		// Refresh recency.
		qrCodeCache.delete(key);
		qrCodeCache.set(key, hit);
	}
	return hit;
}

function cacheSet(key: string, value: string): void {
	if (qrCodeCache.size >= MAX_CACHED_QR_CODES) {
		const oldest = qrCodeCache.keys().next().value;
		if (oldest !== undefined) qrCodeCache.delete(oldest);
	}
	qrCodeCache.set(key, value);
}

export const GET: RequestHandler = async ({ url }) => {
	const urlParam = url.searchParams.get('url');

	if (urlParam && urlParam.length <= 2000) {
		// Check if the QR code is already in cache
		const cached = cacheGet(urlParam);
		if (cached !== undefined) {
			return new Response(cached, {
				headers: {
					'Content-Type': 'image/svg+xml',
					'Cache-Control': 'public, max-age=31536000, immutable' // Cache for 1 year
				}
			});
		}

		let qrSVG = renderSVG(urlParam);

		// Ensure all attribute values are quoted for well-formed XML
		qrSVG = qrSVG.replace(/(\w+)=([\w\d]+)/g, '$1="$2"');

		// Convert style attributes to presentation attributes for better image compatibility
		qrSVG = qrSVG.replace(/style="fill:([^;]+);opacity:([^;]+)"/g, 'fill="$1" opacity="$2"');

		// Add XML declaration, xmlns, and viewBox for better compatibility
		qrSVG = `<?xml version="1.0" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${qrSVG.substring(5)}`;

		// Store the generated SVG in cache
		cacheSet(urlParam, qrSVG);

		return new Response(qrSVG, {
			headers: {
				'Content-Type': 'image/svg+xml',
				'Cache-Control': 'public, max-age=31536000, immutable' // Cache for 1 year
			}
		});
	} else {
		return new Response('Invalid request', {
			status: 400
		});
	}
};
