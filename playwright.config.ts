import { defineConfig } from '@playwright/test';

/**
 * To run against an already-installed Chromium/Chrome (e.g. on air-gapped
 * machines where `npx playwright install` cannot reach the CDN), set
 * PLAYWRIGHT_EXECUTABLE_PATH to the browser binary.
 */
const customExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
	webServer: {
		// Cold `npm run build` + preview start can exceed the 60s default on CI runners.
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 180_000,
		reuseExistingServer: !process.env.CI
	},
	globalSetup: './e2e/global.setup.ts',
	testDir: 'e2e',
	use: {
		...(customExecutable
			? { launchOptions: { executablePath: customExecutable, args: ['--no-sandbox'] } }
			: {})
	}
});
