import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolAPI, createPool } from '../src/lib/iframePool';

declare global {
	interface Window {
		IframePool: { createPool: typeof createPool };
		pool: PoolAPI;
		loadCount: number;
	}
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bundle the real module and inject it. These tests must exercise
 * src/lib/iframePool.ts itself — a re-implementation inside page.evaluate()
 * would pass no matter what the shipped module does.
 */
let bundle: string;

test.beforeAll(async () => {
	const result = await build({
		entryPoints: [path.join(projectRoot, 'src/lib/iframePool.ts')],
		bundle: true,
		format: 'iife',
		globalName: 'IframePool',
		write: false,
		platform: 'browser'
	});
	bundle = result.outputFiles[0].text;
});

// allow-same-origin so assertions can reach contentDocument/contentWindow.
// Production uses the module's default sandbox.
const TEST_SANDBOX = ['allow-scripts', 'allow-same-origin'];

async function setupPage(page: Page, slides: Record<number, string>, maxAgeMs?: number) {
	await page.setContent('<!DOCTYPE html><html><body><div id="stage"></div></body></html>');
	await page.addScriptTag({ content: bundle });
	await page.evaluate(
		({ slides, sandbox, maxAgeMs }) => {
			const stage = document.getElementById('stage')!;
			const pool = window.IframePool.createPool(stage, { sandbox, maxAgeMs });
			window.pool = pool;

			const cache = new Map<string, string>();
			const list = Object.entries(slides).map(([id, html]) => {
				const contentUrl = `/slide-${id}.html`;
				cache.set(contentUrl, html);
				return { id: Number(id), type: 'HTML', contentUrl };
			});
			pool.rebuild(list, cache);
		},
		{ slides, sandbox: TEST_SANDBOX, maxAgeMs }
	);
}

/** Count load events on a slide's iframe from the parent side. */
async function trackLoads(page: Page, slideId: number) {
	await page.evaluate((id) => {
		const iframe = window.pool.wrapperFor(id)!.querySelector('iframe')!;
		window.loadCount = 0;
		iframe.addEventListener('load', () => window.loadCount++);
	}, slideId);
}

test.describe('iframePool', () => {
	test('hiding and showing never re-navigates the iframe', async ({ page }) => {
		await setupPage(page, { 1: '<body><h1>Slide 1</h1></body>' });

		await page.evaluate(() => window.pool.warm(1));
		await page.waitForTimeout(300);

		// Start counting after the initial load has settled.
		await trackLoads(page, 1);

		// Stamp the live document. If the iframe re-navigates, this is lost.
		await page.evaluate(() => {
			const iframe = window.pool.wrapperFor(1)!.querySelector('iframe')!;
			(iframe.contentWindow as Window & { __marker?: string }).__marker = 'original';
		});

		for (let i = 0; i < 3; i++) {
			await page.evaluate(() => window.pool.keepOnly([]));
			await page.waitForTimeout(50);
			await page.evaluate(() => window.pool.keepOnly([1]));
			await page.waitForTimeout(50);
		}

		const result = await page.evaluate(() => {
			const iframe = window.pool.wrapperFor(1)!.querySelector('iframe')!;
			return {
				loadCount: window.loadCount,
				marker: (iframe.contentWindow as Window & { __marker?: string }).__marker
			};
		});

		expect(result.loadCount).toBe(0);
		expect(result.marker).toBe('original');
	});

	test('hidden wrappers stop CSS animations, visible ones run them', async ({ page }) => {
		const animated = `
			<style>
				@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
				#box { width: 100px; height: 100px; background: red; animation: spin 2s linear infinite; }
			</style>
			<body><div id="box"></div></body>`;
		await setupPage(page, { 1: animated });

		await page.evaluate(() => window.pool.warm(1));
		await page.waitForTimeout(500);

		const running = () =>
			page.evaluate(() => {
				const iframe = window.pool.wrapperFor(1)!.querySelector('iframe')!;
				const box = iframe.contentDocument!.querySelector('#box')!;
				return box.getAnimations().filter((a) => a.playState === 'running').length;
			});

		// Guard against a vacuous pass: the animation must genuinely be detected.
		expect(await running()).toBeGreaterThan(0);

		await page.evaluate(() => window.pool.keepOnly([]));
		await page.waitForTimeout(200);
		expect(await running()).toBe(0);

		await page.evaluate(() => window.pool.keepOnly([1]));
		await page.waitForTimeout(200);
		expect(await running()).toBeGreaterThan(0);
	});

	test('keepOnly leaves exactly the named wrappers displayed', async ({ page }) => {
		await setupPage(page, {
			1: '<body>1</body>',
			2: '<body>2</body>',
			3: '<body>3</body>',
			4: '<body>4</body>'
		});

		await page.evaluate(() => window.pool.keepOnly([2, 3]));

		const states = await page.evaluate(() =>
			[1, 2, 3, 4].map((i) => window.pool.wrapperFor(i)?.style.display ?? 'missing')
		);
		expect(states).toEqual(['none', 'block', 'block', 'none']);

		// Idempotent: repeating the call must not drift.
		await page.evaluate(() => window.pool.keepOnly([2, 3]));
		const again = await page.evaluate(() =>
			[1, 2, 3, 4].map((i) => window.pool.wrapperFor(i)?.style.display ?? 'missing')
		);
		expect(again).toEqual(['none', 'block', 'block', 'none']);
	});

	test('recycle rebuilds the stale wrapper instead of dropping the slide', async ({ page }) => {
		// maxAgeMs 0 => every unprotected wrapper is stale immediately.
		await setupPage(page, { 1: '<body>1</body>', 2: '<body>2</body>' }, 0);

		const before = await page.evaluate(() => window.pool.wrapperFor(2) !== null);
		expect(before).toBe(true);

		// Slide 1 is protected, slide 2 is recycled.
		await page.evaluate(() => window.pool.recycle([1]));

		const after = await page.evaluate(() => ({
			protectedStillThere: window.pool.wrapperFor(1) !== null,
			// Regression guard: recycle() used to delete and rely on a later
			// rebuild() that never comes in steady state, stranding the slide.
			recycledStillThere: window.pool.wrapperFor(2) !== null,
			stageChildren: document.getElementById('stage')!.children.length
		}));

		expect(after.protectedStillThere).toBe(true);
		expect(after.recycledStillThere).toBe(true);
		expect(after.stageChildren).toBe(2);
	});
});
