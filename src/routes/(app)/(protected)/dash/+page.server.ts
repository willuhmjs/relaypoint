import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { actionHelper } from '$lib/server/actionHelper';
import { broadcastSwUpdate, getConnectedDisplayIds } from '$lib/server/webSocketHandler';

export const actions = {
	forceSwUpdateAll: actionHelper(z.object({}), async (_data, { locals }) => {
		const session = await locals.auth();
		if (session?.user?.role !== 'ADMIN') {
			return fail(403, { message: 'You are not authorized to perform this action.' });
		}

		const displayIds = getConnectedDisplayIds();
		for (const displayId of displayIds) {
			broadcastSwUpdate(displayId);
		}
		return {
			success: true,
			message: `Service worker update sent to ${displayIds.length} connected display(s).`
		};
	})
};
