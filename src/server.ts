// src/server.ts
// @ts-expect-error - The build directory is generated at build time
import { handler } from '../build/handler.js';
import { createServer } from 'http';
import { attachWebSocketServer } from './lib/server/webSocketHandler';
import { prisma } from './lib/server/prisma/prismaConnection';

const PORT = process.env.PORT || 3000;

// A rejected request body stream (e.g. an oversized or aborted upload) can
// surface as an unhandled promise rejection inside the adapter's request
// handling. For a signage server that must stay up for every connected
// display, log loudly instead of taking the whole process down.
let sawFatal = false;
process.on('unhandledRejection', (reason) => {
	console.error('[server] Unhandled rejection (kept alive):', reason);
});
process.on('uncaughtException', (err) => {
	console.error('[server] Uncaught exception (kept alive):', err);
	// If we keep crashing, exit non-zero so a supervisor can restart us.
	if (sawFatal) process.exit(1);
	sawFatal = true;
});

const server = createServer(handler);

async function main() {
	// Clear out display clients from a previous run: every WebSocket drops on
	// restart, and clients re-register within seconds via the identify
	// handshake, so this keeps the dashboard's connection list honest.
	await prisma.displayClient.deleteMany({});

	// Attach the WebSocket server logic to our HTTP server
	attachWebSocketServer(server);

	server.listen(PORT, () => {
		console.log(`🚀 Server listening on http://localhost:${PORT}`);
	});
}

main().catch((e) => {
	console.error('Failed to start server:', e);
	process.exit(1);
});
