/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { version } from '$service-worker';

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const CONTENT_CACHE = `relaypoint-content-${version}`;

const CACHEABLE_BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|avif|mp4|webm|mov)$/i;
const HTML_EXTENSIONS = /\.(html|htm)$/i;

sw.addEventListener('install', (event) => {
	event.waitUntil(sw.skipWaiting());
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await sw.clients.claim();

			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith('relaypoint-content-') && key !== CONTENT_CACHE)
					.map((key) => caches.delete(key))
			);
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	if (!url.pathname.startsWith('/content/')) return;

	if (CACHEABLE_BINARY_EXTENSIONS.test(url.pathname)) {
		event.respondWith(cacheFirst(event.request));
	} else if (HTML_EXTENSIONS.test(url.pathname)) {
		event.respondWith(staleWhileRevalidate(event.request));
	} else {
		event.respondWith(cacheFirst(event.request));
	}
});

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CONTENT_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;

	try {
		const response = await fetch(request);
		if (response.ok) {
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		return new Response('Network error', { status: 503 });
	}
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
	const cache = await caches.open(CONTENT_CACHE);
	const cached = await cache.match(request);

	const networkFetch = fetch(request)
		.then((response) => {
			if (response.ok) {
				cache.put(request, response.clone());
			}
			return response;
		})
		.catch(() => null);

	if (cached) return cached;

	const networkResponse = await networkFetch;
	if (networkResponse) return networkResponse;
	return new Response('Network error', { status: 503 });
}

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'PRECACHE_URLS') {
		const urls: string[] = event.data.urls;
		event.waitUntil(precacheUrls(urls));
	} else if (event.data?.type === 'CLEAR_CACHE') {
		event.waitUntil(
			caches.keys().then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('relaypoint-content-'))
						.map((key) => caches.delete(key))
				)
			)
		);
	}
});

async function precacheUrls(urls: string[]): Promise<void> {
	const cache = await caches.open(CONTENT_CACHE);

	for (const url of urls) {
		const existing = await cache.match(url);
		if (existing) continue;

		try {
			const response = await fetch(url);
			if (response.ok) {
				await cache.put(url, response);
			}
		} catch (e) {
			console.warn(`[SW] Failed to precache: ${url}`, e);
		}
	}
}
