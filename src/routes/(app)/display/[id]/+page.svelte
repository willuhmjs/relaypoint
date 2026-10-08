<script lang="ts">
	import { onMount, tick as svelteTick } from 'svelte';
	import { transitions, type TransitionType } from '$lib/transitions';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { renderSVG } from 'scannable/qr';
	import { page } from '$app/state';
	import { createPool, type PoolAPI } from '$lib/iframePool';

	let { data } = $props();
	let displayId = $derived(data.displayId);

	type Slide = {
		id: number;
		type: 'IMAGE' | 'VIDEO' | 'HTML';
		contentUrl: string;
		duration: number;
	};

	// --- Display State ---
	let slides = $state<Slide[]>([]);
	let activeSlideIndex = $state(-1);
	let transitionType: TransitionType = $state('fade');
	let transitionDuration = $state(500);
	let status = $state('syncing');
	let errorMessage = $state('');
	let showQrCode = $state(false);

	// --- Timeline State ---
	let timelineBasisTime = $state(0);
	let clockError = $state(0);
	let totalPresentationDuration = $state(0);

	// --- NTP State ---
	const NTP_WINDOW_SIZE = 8;
	let ntpSamples: { offset: number; rtt: number }[] = [];
	let ntpBurstRemaining = 5;
	let ntpBurstTimer: ReturnType<typeof setTimeout> | null = null;

	// --- Scheduler State ---
	let animationFrameId: number;
	let idleTimerId: ReturnType<typeof setTimeout> | null = null;
	let isInRafMode = false;

	// --- Connection State ---
	let ws: WebSocket | null = null;
	let reconnectInterval: ReturnType<typeof setInterval>;
	let timeSyncInterval: ReturnType<typeof setInterval>;
	let swUpdateInterval: ReturnType<typeof setInterval>;

	// --- A/B Viewport State ---
	let slideInViewA = $state<Slide | null>(null);
	let slideInViewB = $state<Slide | null>(null);
	let videoElementA = $state<HTMLVideoElement | null>(null);
	let videoElementB = $state<HTMLVideoElement | null>(null);
	let viewAElement = $state<HTMLDivElement | null>(null);
	let viewBElement = $state<HTMLDivElement | null>(null);
	let activeView = $state<'A' | 'B'>('A');
	let animationLock = false;

	// --- Content Cache ---
	let htmlContentCache = new Map<string, string>();

	// --- Debug State ---
	let debugMode = $state(false);

	// --- Iframe Pool State ---
	let iframePool: PoolAPI | null = null;
	let iframeStageElement = $state<HTMLDivElement | null>(null);
	let iframeRecycleTimer: ReturnType<typeof setInterval> | null = null;

	// --- Video sync effect ---
	$effect(() => {
		if (activeSlideIndex === -1) return;
		const currentSlide = slides[activeSlideIndex];
		if (!currentSlide) return;
		if (currentSlide.type !== 'VIDEO') return;
		const activeVideoEl = activeView === 'A' ? videoElementA : videoElementB;
		if (activeVideoEl) {
			setVideoTime(activeVideoEl);
		}
	});

	function reportError(error: string, stack?: string) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'client_error', error, stack }));
		}
	}

	onMount(() => {
		connectWebSocket();

		window.addEventListener('error', (event) => {
			reportError(event.message, event.error?.stack);
		});
		window.addEventListener('unhandledrejection', (event) => {
			const reason = event.reason;
			reportError(`Unhandled rejection: ${reason?.message || String(reason)}`, reason?.stack);
		});

		// Periodically check for service worker updates (IoT kiosk devices never close)
		swUpdateInterval = setInterval(
			() => {
				navigator.serviceWorker?.getRegistration().then((r) => r?.update());
			},
			30 * 60 * 1000
		);

		navigator.serviceWorker?.addEventListener('controllerchange', () => {
			console.log('[SW] New service worker activated.');
		});

		return () => {
			cancelScheduledChecks();
			clearInterval(reconnectInterval);
			clearInterval(timeSyncInterval);
			clearInterval(swUpdateInterval);
			clearTimeout(ntpBurstTimer!);
			if (iframeRecycleTimer) clearInterval(iframeRecycleTimer);
			iframePool?.destroy();
			if (ws) ws.close();
		};
	});

	// ========================================================================
	// NTP TIME SYNC
	// ========================================================================

	function processNtpSample(t1: number, t2: number, t3: number, t4: number) {
		const rtt = t4 - t1 - (t3 - t2);
		const offset = (t2 - t1 + (t3 - t4)) / 2;

		ntpSamples.push({ offset, rtt });
		if (ntpSamples.length > NTP_WINDOW_SIZE) {
			ntpSamples = ntpSamples.slice(-NTP_WINDOW_SIZE);
		}

		const previousClockError = clockError;

		if (ntpSamples.length < 3) {
			clockError = offset;
			console.log(
				`[NTP] Sample ${ntpSamples.length}/${NTP_WINDOW_SIZE}. RTT: ${rtt}ms. ` +
					`Offset: ${offset.toFixed(2)}ms (raw, < 3 samples)`
			);
		} else {
			const sortedRtts = ntpSamples.map((s) => s.rtt).sort((a, b) => a - b);
			const medianRtt = sortedRtts[Math.floor(sortedRtts.length / 2)];
			const goodSamples = ntpSamples.filter((s) => s.rtt <= medianRtt * 2);

			if (goodSamples.length === 0) {
				clockError = offset;
			} else {
				const sortedOffsets = goodSamples.map((s) => s.offset).sort((a, b) => a - b);
				clockError = sortedOffsets[Math.floor(sortedOffsets.length / 2)];
			}

			console.log(
				`[NTP] Sample ${ntpSamples.length}/${NTP_WINDOW_SIZE}. RTT: ${rtt}ms. ` +
					`Good: ${goodSamples.length}/${ntpSamples.length}. ` +
					`Clock error: ${clockError.toFixed(2)}ms`
			);
		}

		// Recalibrate scheduler if clock correction changed significantly
		if (Math.abs(clockError - previousClockError) > 10 && status === 'playing') {
			scheduleNextCheck();
		}
	}

	function sendNtpPing() {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'ping', t1: Date.now() }));
		}
	}

	// ========================================================================
	// WEBSOCKET
	// ========================================================================

	// localStorage, not sessionStorage: kiosk WebViews restart often, and a fresh
	// session would mint a new UUID on every restart, creating a new DisplayClient
	// row each time.
	function getOrSetClientId() {
		let clientId = localStorage.getItem('relaypoint-client-id');
		if (!clientId) {
			clientId = crypto.randomUUID();
			localStorage.setItem('relaypoint-client-id', clientId);
		}
		return clientId;
	}

	function connectWebSocket() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws/display/${displayId}`;
		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			console.log('[WebSocket] Connection established.');
			ws?.send(JSON.stringify({ type: 'identify', clientId: getOrSetClientId() }));

			initialSync();
			clearInterval(reconnectInterval);

			// NTP burst: 5 pings at 2s intervals for fast initial calibration
			ntpBurstRemaining = 5;
			ntpSamples = [];
			clearTimeout(ntpBurstTimer!);

			function burstPing() {
				if (ntpBurstRemaining <= 0) {
					clearInterval(timeSyncInterval);
					timeSyncInterval = setInterval(sendNtpPing, 30_000);
					return;
				}
				sendNtpPing();
				ntpBurstRemaining--;
				ntpBurstTimer = setTimeout(burstPing, 2_000);
			}
			burstPing();
		};

		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			switch (message.type) {
				case 'update':
				case 'settings_updated':
					console.log(
						`[WebSocket] Content update (reason: ${message.reason}), background syncing...`
					);
					backgroundSync();
					break;
				case 'reload':
					console.log('[WebSocket] Received reload command, reloading page...');
					window.location.reload();
					break;
				case 'reset':
					console.log('[WebSocket] Received reset command, reloading page...');
					window.location.reload();
					break;
				case 'sw_update':
					console.log('[WebSocket] Received SW update command...');
					forceSwUpdate();
					break;
				case 'set_debug':
					debugMode = !!message.enabled;
					console.log(`[Debug] Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
					break;
				case 'pong': {
					const t4 = Date.now();
					processNtpSample(message.t1, message.t2, message.t3, t4);
					break;
				}
			}
		};

		ws.onclose = () => {
			console.log('[WebSocket] Connection closed. Attempting to reconnect in 5 seconds...');
			status = 'recovering';
			cancelScheduledChecks();
			clearInterval(reconnectInterval);
			clearInterval(timeSyncInterval);
			reconnectInterval = setInterval(() => {
				if (!ws || ws.readyState === WebSocket.CLOSED) {
					connectWebSocket();
				}
			}, 5000);
		};

		ws.onerror = (error) => {
			console.error('[WebSocket] Error:', error);
			ws?.close();
		};
	}

	// ========================================================================
	// SERVICE WORKER LIFECYCLE
	// ========================================================================

	function notifySwPrecache(slideList: Slide[]) {
		if (navigator.serviceWorker?.controller) {
			navigator.serviceWorker.controller.postMessage({
				type: 'PRECACHE_URLS',
				urls: slideList.map((s) => s.contentUrl)
			});
		}
		navigator.serviceWorker?.getRegistration().then((r) => r?.update());
	}

	async function forceSwUpdate() {
		try {
			const reg = await navigator.serviceWorker?.getRegistration();
			if (reg) {
				await Promise.race([reg.update(), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
				if (navigator.serviceWorker?.controller) {
					navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
				}
			}
		} catch (e) {
			console.warn('[SW] Force update failed:', e);
		}
		window.location.reload();
	}

	// ========================================================================
	// SYNC — INITIAL (shows overlay, full setup)
	// ========================================================================

	async function initialSync() {
		try {
			status = 'syncing';
			const fetchStart = Date.now();
			const res = await fetch(`/display/${displayId}/sync`, { cache: 'no-store' });
			if (!res.ok) throw new Error(`Server sync failed: ${res.status} ${res.statusText}`);
			const fetchEnd = Date.now();

			const syncData = await res.json();

			if (syncData.slides.length === 0) {
				throw new Error('This display has no active slides.');
			}

			// Bootstrap approximate clock error from sync response until NTP takes over
			if (ntpSamples.length === 0 && syncData.serverTime) {
				const rtt = fetchEnd - fetchStart;
				clockError = syncData.serverTime - (fetchStart + rtt / 2);
				console.log(`[Sync] Bootstrap clockError: ${clockError.toFixed(2)}ms (RTT: ${rtt}ms)`);
			}

			slides = syncData.slides;
			transitionType = syncData.transitionType as TransitionType;
			transitionDuration = syncData.transitionDuration;
			timelineBasisTime = syncData.timelineBasisTime;
			totalPresentationDuration = slides.reduce((sum, s) => sum + s.duration * 1000, 0);
			showQrCode = syncData.showQrCode ?? false;

			console.log(
				`[Sync] Complete. Transition: ${transitionType}, Duration: ${transitionDuration}`
			);

			// Prefetch all assets
			console.log('[Prefetch] Starting asset prefetch...');
			const prefetchPromises: Promise<void>[] = [];
			htmlContentCache.clear();
			for (const slide of slides) {
				if (slide.type === 'HTML') {
					prefetchPromises.push(
						fetch(slide.contentUrl)
							.then((response) => response.text())
							.then((text) => {
								htmlContentCache.set(slide.contentUrl, text);
							})
							.catch((e) => console.warn(`[Prefetch] Failed for ${slide.contentUrl}`, e))
					);
				} else if (slide.type === 'IMAGE') {
					prefetchPromises.push(
						new Promise<void>((resolve) => {
							const img = new Image();
							img.onload = () => resolve();
							img.onerror = () => resolve();
							img.src = slide.contentUrl;
						})
					);
				}
			}
			await Promise.all(prefetchPromises);
			console.log(`[Prefetch] Completed. ${htmlContentCache.size} HTML slides cached.`);

			// Initialize iframe pool if needed
			if (!iframePool && iframeStageElement) {
				iframePool = createPool(iframeStageElement);
			}
			iframePool?.rebuild(slides, htmlContentCache);

			// Start recycling timer for HTML slides
			const hasHtmlSlides = slides.some((s) => s.type === 'HTML');
			if (hasHtmlSlides && !iframeRecycleTimer) {
				iframeRecycleTimer = setInterval(() => {
					if (iframePool) {
						const activeId = slides[activeSlideIndex]?.id;
						const nextIndex = (activeSlideIndex + 1) % slides.length;
						const nextId = slides[nextIndex]?.id;
						iframePool.recycle([activeId, nextId].filter(Boolean));
					}
				}, 60_000);
			} else if (!hasHtmlSlides && iframeRecycleTimer) {
				clearInterval(iframeRecycleTimer);
				iframeRecycleTimer = null;
			}

			const { calculatedIndex } = findCurrentSlideIndex();

			animationLock = true;
			cancelScheduledChecks();
			await Promise.resolve();

			if (calculatedIndex !== -1) {
				activeSlideIndex = calculatedIndex;
				activeView = 'A';
				slideInViewA = slides[calculatedIndex];
				slideInViewB = null;
			} else if (slides.length > 0) {
				activeSlideIndex = 0;
				slideInViewA = slides[0];
				slideInViewB = null;
			}

			animationLock = false;
			status = 'playing';
			scheduleNextCheck();

			await svelteTick();

			// Set initial viewport styles
			if (viewAElement) {
				viewAElement.style.opacity = '1';
				viewAElement.style.zIndex = '2';
				viewAElement.style.transform = 'none';
				viewAElement.style.filter = 'none';
			}
			if (viewBElement) {
				viewBElement.style.opacity = '0';
				viewBElement.style.zIndex = '1';
				viewBElement.style.transform = 'none';
				viewBElement.style.filter = 'none';
			}

			// Warm the initial slide if it's HTML
			if (slideInViewA?.type === 'HTML' && iframePool) {
				await iframePool.warm(slideInViewA.id);
			}

			// Pre-render next slide onto inactive viewport so it's ready before transition
			if (slides.length > 1) {
				const nextIndex = (activeSlideIndex + 1) % slides.length;
				slideInViewB = slides[nextIndex];
				preloadMediaReady(slides[nextIndex], 'B');
			}

			// Establish pool invariant: only active and next slides visible
			if (iframePool && slideInViewA && slideInViewB) {
				const activeIds = [slideInViewA.id, slideInViewB.id].filter((id) =>
					slides.some((s) => s.id === id && s.type === 'HTML')
				);
				iframePool.keepOnly(activeIds);
			}

			notifySwPrecache(slides);
		} catch (e: any) {
			console.error('Sync error:', e);
			reportError(`[Sync] ${e?.message || e}`, e?.stack);
			status = 'error';
			errorMessage = e.message || 'An unknown error occurred.';
			cancelScheduledChecks();
			setTimeout(initialSync, 15000);
		}
	}

	// ========================================================================
	// SYNC — BACKGROUND (no overlay, hot-swap)
	// ========================================================================

	async function backgroundSync() {
		try {
			const res = await fetch(`/display/${displayId}/sync`, { cache: 'no-store' });
			if (!res.ok) throw new Error(`Server sync failed: ${res.status} ${res.statusText}`);

			const syncData = await res.json();

			if (syncData.slides.length === 0) {
				console.warn('[BackgroundSync] Server returned 0 slides — ignoring update.');
				return;
			}

			const newSlides: Slide[] = syncData.slides;
			const slidesChanged =
				slides.length !== newSlides.length ||
				slides.some(
					(s, i) =>
						s.id !== newSlides[i]?.id ||
						s.contentUrl !== newSlides[i]?.contentUrl ||
						s.duration !== newSlides[i]?.duration
				);

			// Hot-swap settings (always safe)
			transitionType = syncData.transitionType as TransitionType;
			transitionDuration = syncData.transitionDuration;
			showQrCode = syncData.showQrCode ?? false;

			const newBasisTime = syncData.timelineBasisTime;
			if (newBasisTime !== timelineBasisTime) {
				timelineBasisTime = newBasisTime;
				console.log('[BackgroundSync] Timeline basis updated.');
			}

			if (slidesChanged) {
				console.log('[BackgroundSync] Slides changed, prefetching new assets...');

				const newHtmlCache = new Map<string, string>();
				const prefetchPromises: Promise<void>[] = [];

				for (const slide of newSlides) {
					if (slide.type === 'HTML') {
						prefetchPromises.push(
							fetch(slide.contentUrl)
								.then((response) => response.text())
								.then((text) => {
									newHtmlCache.set(slide.contentUrl, text);
								})
								.catch((e) => console.warn(`[Prefetch] Failed for ${slide.contentUrl}`, e))
						);
					} else if (slide.type === 'IMAGE') {
						prefetchPromises.push(
							new Promise<void>((resolve) => {
								const img = new Image();
								img.onload = () => resolve();
								img.onerror = () => resolve();
								img.src = slide.contentUrl;
							})
						);
					}
				}

				await Promise.all(prefetchPromises);

				htmlContentCache = newHtmlCache;
				slides = newSlides;
				totalPresentationDuration = newSlides.reduce((sum, s) => sum + s.duration * 1000, 0);

				iframePool?.rebuild(newSlides, newHtmlCache);

				const { calculatedIndex } = findCurrentSlideIndex();
				if (calculatedIndex !== -1) {
					activeSlideIndex = calculatedIndex;
					if (activeView === 'A') {
						slideInViewA = slides[calculatedIndex];
					} else {
						slideInViewB = slides[calculatedIndex];
					}
				}

				scheduleNextCheck();
				console.log(`[BackgroundSync] Hot-swapped ${newSlides.length} slides.`);
			} else {
				totalPresentationDuration = newSlides.reduce((sum, s) => sum + s.duration * 1000, 0);
				scheduleNextCheck();
			}

			notifySwPrecache(newSlides);
		} catch (e) {
			console.error('[BackgroundSync] Error:', e);
		}
	}

	// ========================================================================
	// TIMELINE CALCULATION
	// ========================================================================

	function findCurrentSlideIndex() {
		const correctedNow = Date.now() + clockError;
		if (totalPresentationDuration <= 0) {
			return { calculatedIndex: slides.length > 0 ? 0 : -1, correctedNow };
		}

		const elapsedTime = Math.max(0, correctedNow - timelineBasisTime) % totalPresentationDuration;

		let cumulativeTime = 0;
		let calculatedIndex = -1;
		for (let i = 0; i < slides.length; i++) {
			const slideDuration = slides[i].duration * 1000;
			if (elapsedTime >= cumulativeTime && elapsedTime < cumulativeTime + slideDuration) {
				calculatedIndex = i;
				break;
			}
			cumulativeTime += slideDuration;
		}

		if (calculatedIndex === -1 && slides.length > 0) {
			calculatedIndex = 0;
		}

		return { calculatedIndex, correctedNow };
	}

	function msUntilNextSlide(): number {
		if (slides.length <= 1 || totalPresentationDuration <= 0) return Infinity;

		const correctedNow = Date.now() + clockError;
		const elapsedTime = Math.max(0, correctedNow - timelineBasisTime) % totalPresentationDuration;

		let cumulativeTime = 0;
		for (let i = 0; i < slides.length; i++) {
			cumulativeTime += slides[i].duration * 1000;
			if (elapsedTime < cumulativeTime) {
				return cumulativeTime - elapsedTime;
			}
		}

		return totalPresentationDuration - elapsedTime;
	}

	function setVideoTime(videoElement: HTMLVideoElement) {
		const { calculatedIndex, correctedNow } = findCurrentSlideIndex();
		if (calculatedIndex === -1) return;

		if (totalPresentationDuration <= 0) {
			videoElement.currentTime = 0;
			return;
		}

		const elapsedTime = Math.max(0, correctedNow - timelineBasisTime) % totalPresentationDuration;

		let currentSlideStartTimeInLoop = 0;
		for (let i = 0; i < calculatedIndex; i++) {
			currentSlideStartTimeInLoop += slides[i].duration * 1000;
		}

		const timeIntoCurrentSlideMs = elapsedTime - currentSlideStartTimeInLoop;
		const videoSeekTime = timeIntoCurrentSlideMs / 1000;

		if (isFinite(videoSeekTime) && videoElement.readyState > 0) {
			videoElement.currentTime = Math.max(0, videoSeekTime);
		}
	}

	// ========================================================================
	// HYBRID SCHEDULER (setTimeout idle + rAF precision)
	// ========================================================================

	function scheduleNextCheck() {
		cancelScheduledChecks();

		if (status !== 'playing' || slides.length === 0) return;

		const msRemaining = msUntilNextSlide();

		if (msRemaining === Infinity) return;

		const RAF_LEAD_MS = 200;

		if (debugMode) {
			console.log(
				`[Scheduler] Next slide in ${msRemaining.toFixed(0)}ms, activeSlide=${activeSlideIndex}, clockError=${clockError.toFixed(1)}ms`
			);
			reportError(
				`[Debug] scheduleNextCheck: msRemaining=${msRemaining.toFixed(0)}, activeSlide=${activeSlideIndex}, slides=${slides.length}, clockError=${clockError.toFixed(1)}`
			);
		}

		if (msRemaining > RAF_LEAD_MS) {
			isInRafMode = false;
			idleTimerId = setTimeout(() => {
				isInRafMode = true;
				animationFrameId = requestAnimationFrame(tick);
			}, msRemaining - RAF_LEAD_MS);
		} else {
			isInRafMode = true;
			animationFrameId = requestAnimationFrame(tick);
		}
	}

	function cancelScheduledChecks() {
		if (idleTimerId !== null) {
			clearTimeout(idleTimerId);
			idleTimerId = null;
		}
		cancelAnimationFrame(animationFrameId);
		isInRafMode = false;
	}

	// ========================================================================
	// MEDIA PRE-RENDERING
	// ========================================================================

	async function waitForMediaReady(slide: Slide, viewKey: 'A' | 'B'): Promise<void> {
		const TIMEOUT_MS = 5_000;

		const readyPromise = (async () => {
			await svelteTick();

			if (slide.type === 'IMAGE') {
				const viewEl = viewKey === 'A' ? viewAElement : viewBElement;
				if (!viewEl) return;
				const img = viewEl.querySelector('img');
				if (!img) return;
				await decodeImage(img);
			} else if (slide.type === 'VIDEO') {
				const videoEl = viewKey === 'A' ? videoElementA : videoElementB;
				if (!videoEl) return;
				if (videoEl.readyState >= 3) return;
				await new Promise<void>((resolve) => {
					const handler = () => {
						videoEl.removeEventListener('canplay', handler);
						resolve();
					};
					videoEl.addEventListener('canplay', handler);
				});
			} else if (slide.type === 'HTML') {
				if (!iframePool) return;
				await iframePool.warm(slide.id);
			}
		})();

		await Promise.race([
			readyPromise,
			new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_MS))
		]);
	}

	async function decodeImage(img: HTMLImageElement): Promise<void> {
		if (typeof img.decode === 'function') {
			try {
				await img.decode();
			} catch {
				// decode() can reject if the image is broken or src changes mid-decode
			}
			return;
		}
		// Fallback for Chromium < 64 (Tizen 3.0–5.0): wait for load or check complete
		if (img.complete && img.naturalWidth > 0) return;
		await new Promise<void>((resolve) => {
			img.addEventListener('load', () => resolve(), { once: true });
			img.addEventListener('error', () => resolve(), { once: true });
		});
	}

	function preloadMediaReady(slide: Slide, viewKey: 'A' | 'B') {
		waitForMediaReady(slide, viewKey).catch(() => {});
	}

	// ========================================================================
	// VIEW RESOLUTION
	// ========================================================================

	function resolveViewEl(slide: Slide | null, viewKey: 'A' | 'B'): HTMLElement | null {
		if (!slide) return null;

		if (slide.type === 'HTML') {
			return iframePool?.wrapperFor(slide.id) || null;
		}

		return viewKey === 'A' ? viewAElement : viewBElement;
	}

	// ========================================================================
	// TRANSITIONS (WAAPI)
	// ========================================================================

	async function runTransition(inEl: HTMLElement, outEl: HTMLElement) {
		if (!inEl || !outEl) {
			console.warn('[Animation] Missing view element, skipping transition.');
			return;
		}

		const animDef = transitions[transitionType] || transitions.fade;
		const duration = transitionType === 'none' ? 0 : transitionDuration;
		const easing = 'cubic-bezier(0.23, 1, 0.32, 1)';

		inEl.style.zIndex = '2';
		outEl.style.zIndex = '1';
		inEl.style.transform = 'none';
		inEl.style.filter = 'none';
		outEl.style.transform = 'none';
		outEl.style.filter = 'none';

		const inAnimation = inEl.animate(animDef.in, { duration, easing, fill: 'forwards' });
		const outAnimation = outEl.animate(animDef.out, { duration, easing, fill: 'forwards' });

		await Promise.allSettled([inAnimation.finished, outAnimation.finished]);

		if (inEl.isConnected) {
			inAnimation.commitStyles();
			inAnimation.cancel();
			inEl.style.opacity = '1';
			inEl.style.transform = 'none';
			inEl.style.filter = 'none';
			inEl.style.zIndex = '2';
		}

		if (outEl.isConnected) {
			outAnimation.commitStyles();
			outAnimation.cancel();
			outEl.style.opacity = '0';
			outEl.style.transform = 'none';
			outEl.style.filter = 'none';
			outEl.style.zIndex = '1';
		}
	}

	// ========================================================================
	// TICK (slide change detection + transition execution)
	// ========================================================================

	async function tick() {
		if (animationLock || status !== 'playing' || slides.length === 0) {
			if (isInRafMode && status === 'playing') {
				animationFrameId = requestAnimationFrame(tick);
			}
			return;
		}

		if (totalPresentationDuration <= 0) {
			activeSlideIndex = 0;
			return;
		}

		const { calculatedIndex } = findCurrentSlideIndex();

		if (calculatedIndex !== -1 && calculatedIndex !== activeSlideIndex) {
			animationLock = true;

			try {
				const newSlide = slides[calculatedIndex];
				const currentSlide = slides[activeSlideIndex];
				const inViewStoreKey = activeView === 'A' ? 'B' : 'A';

				// Set content for the incoming view
				if (inViewStoreKey === 'A') {
					slideInViewA = newSlide;
				} else {
					slideInViewB = newSlide;
				}

				// Wait for media to be visually ready (short timeout — content should be preloaded)
				await waitForMediaReady(newSlide, inViewStoreKey);

				// Resolve view elements
				const inViewEl = resolveViewEl(newSlide, inViewStoreKey);
				const outViewEl = resolveViewEl(currentSlide, activeView);

				// Re-check timeline after render — if we took too long, snap instead of animate
				const { calculatedIndex: postRenderIndex } = findCurrentSlideIndex();
				const shouldSnap = postRenderIndex !== calculatedIndex;

				if (shouldSnap && postRenderIndex !== -1) {
					// We missed the target slide — snap to correct position
					const correctSlide = slides[postRenderIndex];
					if (inViewStoreKey === 'A') {
						slideInViewA = correctSlide;
					} else {
						slideInViewB = correctSlide;
					}
					await svelteTick();

					const correctInViewEl = resolveViewEl(correctSlide, inViewStoreKey);

					// Snap: no animation, just swap visibility
					if (correctInViewEl) {
						correctInViewEl.style.opacity = '1';
						correctInViewEl.style.zIndex = '2';
						correctInViewEl.style.transform = 'none';
						correctInViewEl.style.filter = 'none';
					}
					if (outViewEl) {
						outViewEl.style.opacity = '0';
						outViewEl.style.zIndex = '1';
						outViewEl.style.transform = 'none';
						outViewEl.style.filter = 'none';
					}

					activeSlideIndex = postRenderIndex;
					activeView = inViewStoreKey;
					console.log(
						`[Tick] Slow render detected — snapped to slide ${postRenderIndex} (target was ${calculatedIndex})`
					);
				} else if (inViewEl && outViewEl) {
					// Normal animated transition
					await runTransition(inViewEl, outViewEl);
					activeSlideIndex = calculatedIndex;
					activeView = inViewStoreKey;
				} else {
					// A view element is missing (e.g. a pooled wrapper was destroyed).
					// Advance anyway — leaving activeSlideIndex behind would wedge the
					// timeline and spin tick() in rAF forever.
					console.warn(
						`[Tick] Missing view element (in=${!!inViewEl}, out=${!!outViewEl}); advancing without transition.`
					);
					if (inViewEl) {
						inViewEl.style.opacity = '1';
						inViewEl.style.zIndex = '2';
					}
					if (outViewEl) {
						outViewEl.style.opacity = '0';
						outViewEl.style.zIndex = '1';
					}
					activeSlideIndex = calculatedIndex;
					activeView = inViewStoreKey;
				}

				// Handle opacity for unused A/B divs
				// When transitioning between HTML and IMAGE/VIDEO, ensure unused A/B div is hidden
				const activeSlide = slides[activeSlideIndex];
				if (activeSlide) {
					if (activeSlide.type === 'HTML') {
						// Both A/B divs should be hidden when active is HTML
						if (viewAElement) viewAElement.style.opacity = '0';
						if (viewBElement) viewBElement.style.opacity = '0';
					} else {
						// One A/B div is active, ensure the other is hidden
						const activeAbDiv = activeView === 'A' ? viewAElement : viewBElement;
						const inactiveAbDiv = activeView === 'A' ? viewBElement : viewAElement;
						if (activeAbDiv) activeAbDiv.style.opacity = '1';
						if (inactiveAbDiv) inactiveAbDiv.style.opacity = '0';
					}
				}

				// Preload the NEXT slide onto the now-inactive viewport
				const nextIndex = (activeSlideIndex + 1) % slides.length;
				if (slides.length > 1) {
					const nextSlide = slides[nextIndex];
					if (activeView === 'A') {
						slideInViewB = nextSlide;
					} else {
						slideInViewA = nextSlide;
					}
					// Pre-render so it's ready before next transition fires
					preloadMediaReady(nextSlide, activeView === 'A' ? 'B' : 'A');
				}

				// Establish pool invariant: only active and next slides visible
				if (iframePool) {
					const currentId = slides[activeSlideIndex]?.id;
					const nextId = slides[nextIndex]?.id;
					const activeIds = [currentId, nextId].filter((id) =>
						slides.some((s) => s.id === id && s.type === 'HTML')
					);
					iframePool.keepOnly(activeIds);
				}
			} catch (e: any) {
				console.error('[Tick] Error during transition:', e);
				reportError(`[Tick] Transition error: ${e?.message || e}`, e?.stack);
			} finally {
				animationLock = false;
				scheduleNextCheck();
			}
			return;
		}

		// No transition needed yet — keep polling in rAF mode
		if (isInRafMode) {
			animationFrameId = requestAnimationFrame(tick);
		}
	}

	// ========================================================================
	// QR CODE
	// ========================================================================

	function getQrSvg(url: string) {
		const svg = renderSVG({ value: url, foregroundColor: 'white', backgroundColor: 'transparent' });
		const widthMatch = svg.match(/width=["']?(\d+)["']?/);
		const heightMatch = svg.match(/height=["']?(\d+)["']?/);

		if (widthMatch && heightMatch) {
			const width = widthMatch[1];
			const height = heightMatch[1];
			return svg
				.replace(/width=["']?\d+["']?/, `width="100%"`)
				.replace(/height=["']?\d+["']?/, `height="100%"`)
				.replace(
					'<svg',
					`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"`
				);
		}
		return svg;
	}
</script>

<main
	class="fixed inset-0 h-full w-full overflow-hidden bg-black text-white"
	style="--transition-duration: {transitionDuration}ms"
>
	<!-- Persistent stage for HTML slide iframe wrappers. Never unmounts: removing a
	     wrapper from the DOM destroys its iframe document, so this must sit outside
	     the status gate below. Must stay `absolute`, not `fixed` — a fixed element
	     creates a stacking context, which would trap the wrappers' z-index and let
	     viewA/viewB paint over an incoming HTML slide mid-transition. -->
	<div id="iframe-stage" class="absolute inset-0" bind:this={iframeStageElement}></div>

	{#if status === 'playing' && slides.length > 0}
		<div id="viewA" class="slide-view" bind:this={viewAElement}>
			{#if slideInViewA}
				{#if slideInViewA.type === 'IMAGE'}
					<div class="flex h-full w-full items-center justify-center bg-black">
						<img src={slideInViewA.contentUrl} alt="Display Slide" class="media-asset" />
					</div>
				{:else if slideInViewA.type === 'VIDEO'}
					<video
						bind:this={videoElementA}
						onloadedmetadata={(e) => setVideoTime(e.currentTarget)}
						autoplay
						muted
						loop
						disablepictureinpicture
						class="media-asset"
						src={slideInViewA.contentUrl}
					>
						Loading video stream...
					</video>
				{:else if slideInViewA.type === 'HTML'}
					<!-- Pooled iframe managed by swapIframeIntoView() -->
				{/if}
			{/if}
		</div>

		<div id="viewB" class="slide-view" bind:this={viewBElement}>
			{#if slideInViewB}
				{#if slideInViewB.type === 'IMAGE'}
					<div class="flex h-full w-full items-center justify-center bg-black">
						<img src={slideInViewB.contentUrl} alt="Display Slide" class="media-asset" />
					</div>
				{:else if slideInViewB.type === 'VIDEO'}
					<video
						bind:this={videoElementB}
						onloadedmetadata={(e) => setVideoTime(e.currentTarget)}
						autoplay
						muted
						loop
						disablepictureinpicture
						class="media-asset"
						src={slideInViewB.contentUrl}
					>
						Loading video stream...
					</video>
				{:else if slideInViewB.type === 'HTML'}
					<!-- Pooled iframe managed by swapIframeIntoView() -->
				{/if}
			{/if}
		</div>
	{/if}

	{#if showQrCode}
		<a
			href="{page.url.origin}/view/{data.displayId}"
			class="qr-footer"
			target="_blank"
			rel="noopener noreferrer"
		>
			<div class="qr-text">
				<span class="qr-title">Scan to View Slides</span>
				<span class="qr-url">{page.url.host}/view/{data.displayId}</span>
			</div>
			<div class="qr-code">
				{@html getQrSvg(`${page.url.origin}/view/${data.displayId}`)}
			</div>
		</a>
	{/if}

	{#if status !== 'playing'}
		<div
			class="bg-background text-foreground absolute inset-0 z-[100] flex h-full w-full flex-col items-center justify-center gap-4 p-4 text-center"
		>
			<div class="h-16 w-16">
				{#if status === 'syncing' || status === 'recovering'}
					<Loader2Icon class="h-full w-full animate-spin" style="color: var(--primary);" />
				{/if}
			</div>
			<p class="text-xl font-semibold" style="color: var(--primary);">
				{#if status === 'syncing'}
					Synchronizing & Prefetching Assets...
				{:else if status === 'recovering'}
					Connection lost. Attempting to recover...
				{:else if status === 'error'}
					<span style="color: var(--destructive);">Error</span>
				{/if}
			</p>
			{#if status === 'error'}
				<p class="text-sm" style="color: var(--muted-foreground);">{errorMessage}</p>
				<p class="mt-2 text-xs" style="color: var(--muted-foreground); opacity: 0.7;">
					Retrying in 15 seconds...
				</p>
			{/if}
		</div>
	{/if}
</main>

<style>
	.media-asset {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}

	.slide-view {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		z-index: 1;
		pointer-events: none;
		transform: none;
		filter: none;
	}

	.qr-footer {
		position: absolute;
		bottom: 2rem;
		right: 2rem;
		display: flex;
		align-items: center;
		gap: clamp(0.75rem, 1.5vmin, 1.25rem);
		z-index: 50;
		background-color: #0f172b;
		padding: clamp(0.75rem, 1.5vmin, 1rem) clamp(1rem, 2vmin, 1.5rem);
		border-radius: 1rem;
		box-shadow:
			0 10px 15px -3px rgb(0 0 0 / 0.3),
			0 4px 6px -4px rgb(0 0 0 / 0.3);
		color: white;
		font-family: 'OpenSans', sans-serif;
		text-decoration: none;
		transition:
			transform 0.2s ease-in-out,
			box-shadow 0.2s ease-in-out;
	}

	.qr-footer:hover {
		transform: translateY(-2px);
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.3),
			0 8px 10px -6px rgb(0 0 0 / 0.3);
	}

	.qr-text {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		text-align: right;
	}

	.qr-title {
		font-weight: 700;
		font-size: clamp(0.875rem, 2vmin, 1.25rem);
		line-height: 1.4;
		letter-spacing: -0.01em;
	}

	.qr-url {
		font-size: clamp(0.7rem, 1.5vmin, 1rem);
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.75);
		font-weight: 500;
	}

	.qr-code {
		width: clamp(80px, 10vmin, 160px);
		height: clamp(80px, 10vmin, 160px);
		flex-shrink: 0;
	}

	.qr-code :global(svg) {
		width: 100%;
		height: 100%;
	}
</style>
