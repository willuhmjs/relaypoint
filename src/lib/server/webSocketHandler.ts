// src/lib/server/webSocketHandler.ts
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { parse } from 'url';
import { prisma } from './prisma/prismaConnection';
import { UAParser } from 'ua-parser-js';
import type { DisplayClient } from '@prisma/client';

// --- Type Definitions ---
interface ExtendedWebSocket extends WebSocket {
	dbId: string;
	displayId: number;
	isAlive: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface ClientInfo {
	id: string;
	ip: string;
	userAgent: string;
	os: UAParser.IOS;
	browser: UAParser.IBrowser;
	timeJoined: number;
	latency: number | null;
	friendlyName?: string;
}

interface InternalClientInfo extends ClientInfo {
	ws: ExtendedWebSocket;
}

// --- Global WebSocket State using Symbol ---
// This ensures that our client map is a true singleton that survives HMR in dev.
const CLIENTS_KEY = Symbol.for('sveltekit.wsClients');
type GlobalWithClients = typeof globalThis & {
	[CLIENTS_KEY]: Map<number, Map<string, InternalClientInfo>>;
};
const clients = ((globalThis as GlobalWithClients)[CLIENTS_KEY] ??= new Map());

/**
 * Attaches the WebSocket server logic to a given HTTP server.
 * @param server The HTTP server instance.
 */
export function attachWebSocketServer(
	server: Server,
	opts: { heartbeatIntervalMs?: number } = {}
) {
	const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
	const wss = new WebSocketServer({ noServer: true });

	const heartbeatTimer = setInterval(() => {
		wss.clients.forEach((client) => {
			const ws = client as ExtendedWebSocket;
			if (ws.isAlive === false) {
				console.log(
					`[WebSocket] Terminating unresponsive client for display ${ws.displayId} (missed heartbeat).`
				);
				return ws.terminate();
			}
			ws.isAlive = false;
			ws.ping();
		});
	}, heartbeatIntervalMs);

	wss.on('close', () => clearInterval(heartbeatTimer));

	server.on('upgrade', (request, socket, head) => {
		// Politely ignore requests that aren't for our WebSocket endpoint.
		if (!request.url?.startsWith('/ws/display/')) {
			return;
		}

		console.log(`[WebSocket] Handling upgrade for app endpoint: ${request.url}`);
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request);
			console.log(`[WebSocket] App connection successful for ${request.url}`);
		});
	});

	wss.on('connection', async (ws: ExtendedWebSocket, request: IncomingMessage) => {
		const url = request.url;
		if (!url) return ws.close();

		const { pathname } = parse(url);
		const match = pathname?.match(/^\/ws\/display\/(\d+)$/);
		if (!match) return ws.close();

		const displayId = parseInt(match[1], 10);
		if (isNaN(displayId)) return ws.close();
		ws.displayId = displayId;
		ws.isAlive = true;
		ws.on('pong', () => {
			ws.isAlive = true;
		});

		console.log(`[WebSocket] New client connecting for display ${ws.displayId}...`);

		ws.on('message', async (rawMessage) => {
			const serverReceiveTime = Date.now();
			try {
				const message = JSON.parse(rawMessage.toString());

				if (message.type === 'identify' && message.clientId) {
					ws.dbId = message.clientId;

					const display = await prisma.display.findUnique({ where: { id: ws.displayId } });
					if (!display) {
						ws.close(4004, `Display with ID ${ws.displayId} not found.`);
						return;
					}

					if (!clients.has(ws.displayId)) {
						clients.set(ws.displayId, new Map());
					}

					const ip =
						(request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
						request.socket.remoteAddress ||
						'Unknown';
					const userAgent = request.headers['user-agent'] || 'Unknown';

					const clientRecord = await prisma.displayClient.upsert({
						where: { id: ws.dbId },
						update: { lastSeen: new Date(), lastKnownIp: ip, userAgent: userAgent },
						create: {
							id: ws.dbId,
							displayId: ws.displayId,
							lastKnownIp: ip,
							userAgent: userAgent
						}
					});

					const parser = new UAParser(userAgent);
					const clientInfo: InternalClientInfo = {
						ws,
						id: clientRecord.id,
						ip,
						userAgent,
						os: parser.getOS(),
						browser: parser.getBrowser(),
						timeJoined: Date.now(),
						latency: null,
						friendlyName: clientRecord.friendlyName ?? undefined
					};

					clients.get(ws.displayId)!.set(ws.dbId, clientInfo);
					console.log(`[WebSocket] Client ${ws.dbId} identified for display ${ws.displayId}`);
				} else if (message.type === 'client_error' && message.error) {
					console.error(
						`[ClientError] Display ${ws.displayId} Client ${ws.dbId}: ${message.error}` +
							(message.stack ? `\n${message.stack}` : '')
					);
				} else if (message.type === 'ping' && message.t1) {
					if (!ws.dbId) return; // Ignore pings from unidentified clients
					const t4 = Date.now();
					ws.send(
						JSON.stringify({
							type: 'pong',
							t1: message.t1,
							t2: serverReceiveTime,
							t3: Date.now()
						})
					);
					const t3 = Date.now();
					const client = clients.get(ws.displayId)?.get(ws.dbId);
					if (client) {
						client.latency = t4 - message.t1 - (t3 - serverReceiveTime);
					}
				}
			} catch (e) {
				console.error('[WebSocket] Error parsing message from client:', e);
			}
		});

		ws.on('close', () => {
			if (ws.dbId) {
				const displayClients = clients.get(ws.displayId);
				if (displayClients) {
					displayClients.delete(ws.dbId);
					if (displayClients.size === 0) {
						clients.delete(ws.displayId);
					}
				}
				console.log(`[WebSocket] Client ${ws.dbId} disconnected from display ${ws.displayId}`);
			} else {
				console.log(`[WebSocket] Unidentified client disconnected from display ${ws.displayId}`);
			}
		});

		ws.on('error', (error) => {
			console.error(`[WebSocket] Error for client ${ws.dbId || 'unidentified'}:`, error);
		});
	});

	console.log('[WebSocket] Server handler attached to HTTP server.');
	return wss;
}

// --- Helper & Exported Functions ---

function sendMessageToClient(
	client: InternalClientInfo | undefined,
	message: Record<string, unknown>
) {
	if (client && client.ws.readyState === client.ws.OPEN) {
		client.ws.send(JSON.stringify(message));
	}
}

export function updateClientFriendlyName(
	displayId: number,
	clientId: string,
	friendlyName: string | null
) {
	const client = clients.get(displayId)?.get(clientId);
	if (client) {
		client.friendlyName = friendlyName ?? undefined;
	}
}

export function getConnectedClientsForDisplay(displayId: number): ClientInfo[] {
	const displayClients = clients.get(displayId);
	if (!displayClients) return [];
	return Array.from(displayClients.values()).map(({ ws, ...clientData }) => clientData);
}

export function getConnectedDisplayIds(): number[] {
	return Array.from(clients.entries())
		.filter(([, displayClients]) => displayClients.size > 0)
		.map(([displayId]) => displayId);
}

export function sendUpdateToClient(displayId: number, clientId: string, reason = 'DIRECT_UPDATE') {
	const client = clients.get(displayId)?.get(clientId);
	sendMessageToClient(client, { type: 'update', reason, timestamp: Date.now() });
}

export function sendDebugToggle(displayId: number, clientId: string, enabled: boolean) {
	const client = clients.get(displayId)?.get(clientId);
	sendMessageToClient(client, { type: 'set_debug', enabled });
}

export function sendReloadToClient(displayId: number, clientId: string) {
	const client = clients.get(displayId)?.get(clientId);
	sendMessageToClient(client, { type: 'reload', reason: 'ADMIN_REQUEST', timestamp: Date.now() });
}

export function broadcastUpdate(displayId: number, reason: string = 'GENERIC_UPDATE') {
	const displayClients = clients.get(displayId);
	if (displayClients && displayClients.size > 0) {
		console.log(
			`[WebSocket] Broadcasting update to ${displayClients.size} client(s) for display ${displayId}`
		);
		const message = { type: 'update', reason: reason, timestamp: Date.now() };
		for (const client of displayClients.values()) {
			sendMessageToClient(client, message);
		}
	} else {
		console.log(`[WebSocket] Broadcast update: No clients connected for display ${displayId}`);
	}
}

export function broadcastReset(displayId: number) {
	const displayClients = clients.get(displayId);
	if (displayClients && displayClients.size > 0) {
		console.log(
			`[WebSocket] Broadcasting reset to ${displayClients.size} client(s) for display ${displayId}`
		);
		const message = { type: 'reset', timestamp: Date.now() };
		for (const client of displayClients.values()) {
			sendMessageToClient(client, message);
		}
	} else {
		console.log(`[WebSocket] Broadcast reset: No clients connected for display ${displayId}`);
	}
}

export function broadcastReload(displayId: number) {
	const displayClients = clients.get(displayId);
	if (displayClients && displayClients.size > 0) {
		console.log(
			`[WebSocket] Broadcasting reload to ${displayClients.size} client(s) for display ${displayId}`
		);
		const message = { type: 'reload', reason: 'FORCE_RELOAD_REQUEST', timestamp: Date.now() };
		for (const client of displayClients.values()) {
			sendMessageToClient(client, message);
		}
	} else {
		console.log(`[WebSocket] Broadcast reload: No clients connected for display ${displayId}`);
	}
}

export function broadcastSwUpdate(displayId: number) {
	const displayClients = clients.get(displayId);
	if (displayClients && displayClients.size > 0) {
		console.log(
			`[WebSocket] Broadcasting SW update to ${displayClients.size} client(s) for display ${displayId}`
		);
		const message = { type: 'sw_update', timestamp: Date.now() };
		for (const client of displayClients.values()) {
			sendMessageToClient(client, message);
		}
	} else {
		console.log(`[WebSocket] Broadcast SW update: No clients connected for display ${displayId}`);
	}
}
