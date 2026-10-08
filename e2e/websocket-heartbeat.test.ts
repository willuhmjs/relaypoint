import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachWebSocketServer } from '../src/lib/server/webSocketHandler';

/**
 * Node-only test: exercises the raw http.Server + ws heartbeat behavior
 * directly, without a browser. A live client's OS auto-responds to ping
 * frames, so only a socket that stops responding should be evicted.
 */

const HEARTBEAT_INTERVAL_MS = 200;

function listen(server: Server): Promise<number> {
	return new Promise((resolve) => {
		server.listen(0, () => {
			const address = server.address();
			if (typeof address === 'object' && address) resolve(address.port);
		});
	});
}

function connect(port: number, displayId: number): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://localhost:${port}/ws/display/${displayId}`);
		ws.once('open', () => resolve(ws));
		ws.once('error', reject);
	});
}

test.describe('WebSocket heartbeat', () => {
	let server: Server;
	let port: number;

	test.beforeEach(async () => {
		server = createServer();
		attachWebSocketServer(server, { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS });
		port = await listen(server);
	});

	test.afterEach(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	test('a live client survives repeated heartbeat sweeps', async () => {
		const ws = await connect(port, 1);
		await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS * 3));
		expect(ws.readyState).toBe(WebSocket.OPEN);
		ws.close();
	});

	test('a zombie socket (no pong response) is terminated within two sweeps', async () => {
		const ws = await connect(port, 2);

		// Simulate a dead peer: ws normally auto-replies to ping frames via
		// its own `pong()` method. Shadowing it with a no-op on the instance
		// suppresses that reply while leaving the underlying socket (and thus
		// the eventual server-initiated close) working normally.
		(ws as unknown as { pong: () => void }).pong = () => {};

		const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));

		await Promise.race([
			closed,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('zombie client was not evicted in time')),
					HEARTBEAT_INTERVAL_MS * 5
				)
			)
		]);
	});
});
