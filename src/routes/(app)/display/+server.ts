import { json, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    const acceptHeader = request.headers.get('Accept');

    // Only serve content if the client explicitly accepts JSON.
    if (acceptHeader?.includes('application/json')) {
        const displays = await prisma.display.findMany({
            select: {
                id: true,
                name: true,
                description: true,
                displayGroup: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });
        return json(displays);
    }
    
    throw redirect(303, '/dash');
};