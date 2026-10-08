import type { Plugin } from 'vite';
import { attachWebSocketServer } from './webSocketHandler';

export const webSocketPlugin: Plugin = {
    name: 'webSocketPlugin',
    configureServer(server) {
        if (server.httpServer) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            attachWebSocketServer(server.httpServer as any);
            console.log('[WebSocket] Vite plugin attached WebSocket handler to dev server.');
        } else {
            // This might happen in some testing environments or with future Vite versions.
            // It's good practice to handle this case.
            console.error('[WebSocket] Vite server is not ready, WebSocket handler could not be attached.');
        }
    }
};