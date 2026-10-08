import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';

export async function load({ params }) {
    const displayId = parseInt(params.id, 10);
    if (isNaN(displayId)) {
        
        throw error(404, 'Not found');
    }

    const display = await prisma.display.findUnique({
        where: { id: displayId }
    });

    if (!display) {
        throw error(404, 'Not found');
    }

    return { displayId, showQrCode: display.showQrCode ?? true };
}