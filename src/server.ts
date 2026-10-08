// src/server.ts
// @ts-expect-error - The build directory is generated at build time
import { handler } from '../build/handler.js';
import { createServer } from 'http';
import { attachWebSocketServer } from './lib/server/webSocketHandler';
import { prisma } from './lib/server/prisma/prismaConnection';

const PORT = process.env.PORT || 3000;
const server = createServer(handler);

async function main() {
	// Clear out any stale display clients from a previous run
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