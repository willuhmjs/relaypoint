import { json, error } from '@sveltejs/kit';
import { getConnectedClientsForDisplay } from '$lib/server/webSocketHandler';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { assertCanEditDisplay } from '$lib/server/displayAuth';
import type { RequestHandler } from './$types';

const HISTORY_PAGE_SIZE = 100;

export const GET: RequestHandler = async (event) => {
    const displayId = parseInt(event.params.id, 10);
    if (isNaN(displayId)) {
        throw error(400, 'Invalid Display ID');
    }

    await assertCanEditDisplay(event, displayId);

    const connectedClients = getConnectedClientsForDisplay(displayId);
    const connectedClientIds = connectedClients.map((c) => c.id);

    const historyWhere = {
        displayId: displayId,
        id: {
            notIn: connectedClientIds
        }
    };

    // Capped: a misbehaving kiosk can accumulate tens of thousands of records,
    // and this endpoint is polled every few seconds by the dashboard.
    const [historyClients, historyTotal] = await Promise.all([
        prisma.displayClient.findMany({
            where: historyWhere,
            orderBy: {
                lastSeen: 'desc'
            },
            take: HISTORY_PAGE_SIZE
        }),
        prisma.displayClient.count({ where: historyWhere })
    ]);

    return json({ connected: connectedClients, history: historyClients, historyTotal });
};