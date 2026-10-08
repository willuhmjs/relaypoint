import { expect, test } from '@playwright/test';

const DISPLAY_ID = process.env.TEST_DISPLAY_ID;
const AUTH_COOKIE = process.env.TEST_AUTH_COOKIE;

test.skip(!DISPLAY_ID || !AUTH_COOKIE, 'requires TEST_DISPLAY_ID + TEST_AUTH_COOKIE');

test('hidden-until-uploaded: new slide does not appear in /sync until finalize', async ({
	request
}) => {
	const before = await request.get(`/display/${DISPLAY_ID}/sync`);
	const beforeIds: number[] = (await before.json()).slides.map((s: { id: number }) => s.id);
	expect(Array.isArray(beforeIds)).toBeTruthy();

	const prepareRes = await request.post(`/dash/displays/${DISPLAY_ID}/slides/prepare`, {
		headers: { Cookie: AUTH_COOKIE!, 'Content-Type': 'application/json' },
		data: { files: [{ filename: 'e2e-test.png', type: 'image/png', size: 100 }] }
	});
	expect(prepareRes.ok()).toBeTruthy();
	const { slides } = await prepareRes.json();
	const slideId: number = slides[0].slideId;
	const uploadUrl: string = slides[0].uploadUrl;

	const midSync = await (await request.get(`/display/${DISPLAY_ID}/sync`)).json();
	const midIds: number[] = midSync.slides.map((s: { id: number }) => s.id);
	expect(midIds).not.toContain(slideId);

	const tinyPng = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
		'base64'
	);
	const putRes = await request.put(uploadUrl, {
		headers: { Cookie: AUTH_COOKIE!, 'Content-Type': 'image/png' },
		data: tinyPng
	});
	expect(putRes.ok()).toBeTruthy();

	const stillHiddenSync = await (await request.get(`/display/${DISPLAY_ID}/sync`)).json();
	const stillHiddenIds: number[] = stillHiddenSync.slides.map((s: { id: number }) => s.id);
	expect(stillHiddenIds).not.toContain(slideId);

	const finalizeRes = await request.post(
		`/dash/displays/${DISPLAY_ID}/slides/${slideId}/finalize`,
		{ headers: { Cookie: AUTH_COOKIE! } }
	);
	expect(finalizeRes.ok()).toBeTruthy();

	const afterSync = await (await request.get(`/display/${DISPLAY_ID}/sync`)).json();
	const afterIds: number[] = afterSync.slides.map((s: { id: number }) => s.id);
	expect(afterIds).toContain(slideId);

	await request.post(`/dash/displays/${DISPLAY_ID}/slides/rollback`, {
		headers: { Cookie: AUTH_COOKIE!, 'Content-Type': 'application/json' },
		data: { slideIds: [slideId] }
	});
});
