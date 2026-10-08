/**
 * Iframe pool for HTML slides.
 *
 * Maintains a set of pinned iframe wrappers that are created once and never
 * reparented. Reparenting matters: inserting an iframe into the DOM re-navigates
 * it, so moving a warm iframe into a viewport would destroy its document and
 * re-parse srcdoc on every slide transition.
 *
 * Inactive wrappers are hidden with display:none rather than visibility:hidden.
 * visibility:hidden keeps CSS animations running and the document compositing;
 * display:none stops both while leaving the browsing context (and therefore the
 * parsed document) alive.
 *
 * Steady state: at most 2 live documents (current + next).
 */

export interface PoolSlide {
	id: number;
	type: string;
	contentUrl: string;
}

export interface PoolOptions {
	/** Sandbox tokens for pooled iframes. Overridable so tests can opt into
	 *  same-origin access; production should use the default. */
	sandbox?: string[];
	/** Age at which an idle wrapper is torn down and rebuilt. Overridable so the
	 *  recycle path is testable without waiting half an hour. */
	maxAgeMs?: number;
}

export interface PoolAPI {
	rebuild(slides: PoolSlide[], htmlCache: Map<string, string>): void;
	wrapperFor(slideId: number): HTMLDivElement | null;
	warm(slideId: number): Promise<void>;
	keepOnly(activeIds: number[]): void;
	recycle(exceptIds: number[]): void;
	destroy(): void;
}

interface WrapperEntry {
	wrapper: HTMLDivElement;
	iframe: HTMLIFrameElement;
	slideId: number;
	contentUrl: string;
	createdAt: number;
	hasLoaded: boolean;
}

const IFRAME_MAX_AGE_MS = 30 * 60 * 1000;
const DEFAULT_SANDBOX = ['allow-scripts', 'allow-forms', 'allow-popups'];

export function createPool(stageEl: HTMLElement, opts: PoolOptions = {}): PoolAPI {
	const sandbox = opts.sandbox ?? DEFAULT_SANDBOX;
	const maxAgeMs = opts.maxAgeMs ?? IFRAME_MAX_AGE_MS;
	const wrappers = new Map<number, WrapperEntry>();

	// Retained so recycle() can rebuild a wrapper in place. Without this, a
	// recycled slide would stay destroyed until the next content sync, which in
	// steady state never comes.
	let lastCache = new Map<string, string>();

	function rebuild(slides: PoolSlide[], htmlCache: Map<string, string>) {
		lastCache = htmlCache;

		const htmlSlides = slides.filter((s) => s.type === 'HTML');
		const neededIds = new Set(htmlSlides.map((s) => s.id));

		for (const [slideId, entry] of wrappers) {
			if (!neededIds.has(slideId)) {
				entry.wrapper.remove();
				wrappers.delete(slideId);
			}
		}

		for (const slide of htmlSlides) {
			const existing = wrappers.get(slide.id);
			if (!existing) {
				createWrapper(slide);
			} else if (existing.contentUrl !== slide.contentUrl) {
				existing.wrapper.remove();
				wrappers.delete(slide.id);
				createWrapper(slide);
			}
		}
	}

	function createWrapper(slide: { id: number; contentUrl: string }): WrapperEntry {
		const wrapper = document.createElement('div');
		wrapper.style.position = 'absolute';
		wrapper.style.inset = '0';
		wrapper.style.width = '100%';
		wrapper.style.height = '100%';
		wrapper.style.overflow = 'hidden';
		wrapper.style.display = 'none';
		wrapper.style.opacity = '0';
		wrapper.style.zIndex = '1';

		const iframe = document.createElement('iframe');
		iframe.title = 'Embedded web content';
		iframe.className = 'h-full w-full border-none';
		for (const token of sandbox) {
			iframe.sandbox.add(token);
		}
		iframe.style.position = 'absolute';
		iframe.style.inset = '0';
		iframe.style.width = '100%';
		iframe.style.height = '100%';
		iframe.style.border = 'none';
		iframe.srcdoc = lastCache.get(slide.contentUrl) || '';

		const entry: WrapperEntry = {
			wrapper,
			iframe,
			slideId: slide.id,
			contentUrl: slide.contentUrl,
			createdAt: Date.now(),
			hasLoaded: false
		};

		iframe.addEventListener(
			'load',
			() => {
				entry.hasLoaded = true;
			},
			{ once: true }
		);

		wrapper.appendChild(iframe);
		stageEl.appendChild(wrapper);
		wrappers.set(slide.id, entry);
		return entry;
	}

	function wrapperFor(slideId: number): HTMLDivElement | null {
		return wrappers.get(slideId)?.wrapper || null;
	}

	async function warm(slideId: number): Promise<void> {
		const entry = wrappers.get(slideId);
		if (!entry) return;

		entry.wrapper.style.display = 'block';

		if (!entry.hasLoaded) {
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(resolve, 5000);
				entry.iframe.addEventListener(
					'load',
					() => {
						clearTimeout(timeout);
						resolve();
					},
					{ once: true }
				);
			});
		}

		// Two frames: one to run layout after display:block, one to paint it.
		await new Promise((resolve) => requestAnimationFrame(resolve));
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}

	function keepOnly(activeIds: number[]): void {
		const activeSet = new Set(activeIds);
		for (const [slideId, entry] of wrappers) {
			entry.wrapper.style.display = activeSet.has(slideId) ? 'block' : 'none';
		}
	}

	function recycle(exceptIds: number[]): void {
		const now = Date.now();
		const exceptSet = new Set(exceptIds);

		for (const [slideId, entry] of wrappers) {
			if (exceptSet.has(slideId)) continue;
			if (now - entry.createdAt <= maxAgeMs) continue;

			console.log(`[IframePool] Recycling stale iframe for slide ${slideId}`);
			const { contentUrl } = entry;
			entry.wrapper.remove();
			wrappers.delete(slideId);
			// Recreate immediately. rebuild() only runs on a content sync, which in
			// steady state never happens, so deferring would drop the slide for good.
			createWrapper({ id: slideId, contentUrl });
		}
	}

	function destroy(): void {
		for (const [, entry] of wrappers) {
			entry.wrapper.remove();
		}
		wrappers.clear();
	}

	return { rebuild, wrapperFor, warm, keepOnly, recycle, destroy };
}
